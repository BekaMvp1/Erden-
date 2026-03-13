'use strict';

/**
 * Миграция: развернуть weekly_plans в production_plan_day
 * daily_plan = источник правды; weekly хранился отдельно — переносим в daily.
 * Равномерно распределяем weekly_qty по рабочим дням (6 дней, ВС выходной).
 */

const { getWorkingDaysInRange } = require('../utils/planningUtils');

module.exports = {
  async up(queryInterface, Sequelize) {
    const [weeklyRows] = await queryInterface.sequelize.query(`
      SELECT id, workshop_id, building_floor_id, week_start, row_key,
             COALESCE(planned_manual, 0)::numeric + COALESCE(planned_carry, 0)::numeric as weekly_qty
      FROM weekly_plans
      WHERE (COALESCE(planned_manual, 0) + COALESCE(planned_carry, 0)) > 0
    `);

    if (!weeklyRows || weeklyRows.length === 0) {
      console.log('[sync-weekly-to-daily] Нет записей weekly_plans для переноса');
      return;
    }

    const t = await queryInterface.sequelize.transaction();
    let inserted = 0;
    let updated = 0;

    try {
      for (const wp of weeklyRows) {
        const weekStart = String(wp.week_start).slice(0, 10);
        const weekEndDate = new Date(weekStart + 'T12:00:00');
        weekEndDate.setDate(weekEndDate.getDate() + 6);
        const weekEnd = weekEndDate.toISOString().slice(0, 10);

        const workingDays = getWorkingDaysInRange(weekStart, weekEnd);
        if (workingDays.length === 0) continue;

        const weeklyQty = Math.round(parseFloat(wp.weekly_qty) || 0);
        const base = Math.floor(weeklyQty / workingDays.length);
        const rest = weeklyQty % workingDays.length;

        for (let i = 0; i < workingDays.length; i++) {
          const date = workingDays[i];
          const qty = base + (i < rest ? 1 : 0);
          const floorId = wp.building_floor_id;

          const [existing] = await queryInterface.sequelize.query(
            `SELECT id, planned_qty FROM production_plan_day
             WHERE order_id = :orderId AND date = :date AND workshop_id = :workshopId
             AND COALESCE(floor_id, 0) = COALESCE(:floorId, 0)`,
            {
              replacements: {
                orderId: wp.row_key,
                date,
                workshopId: wp.workshop_id,
                floorId,
              },
              transaction: t,
              type: Sequelize.QueryTypes.SELECT,
            }
          );

          if (existing) {
            await queryInterface.sequelize.query(
              `UPDATE production_plan_day SET planned_qty = :qty, updated_at = NOW()
               WHERE id = :id`,
              {
                replacements: { qty, id: existing.id },
                transaction: t,
              }
            );
            updated++;
          } else {
            await queryInterface.sequelize.query(
              `INSERT INTO production_plan_day (order_id, date, workshop_id, floor_id, planned_qty, actual_qty, created_at, updated_at)
               VALUES (:orderId, :date, :workshopId, :floorId, :qty, 0, NOW(), NOW())`,
              {
                replacements: {
                  orderId: wp.row_key,
                  date,
                  workshopId: wp.workshop_id,
                  floorId: floorId,
                  qty,
                },
                transaction: t,
              }
            );
            inserted++;
          }
        }
      }

      await t.commit();
      console.log(`[sync-weekly-to-daily] Перенесено: ${inserted} вставок, ${updated} обновлений`);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down() {
    // Откат не выполняем — данные в daily остаются; weekly_plans не трогаем
    console.log('[sync-weekly-to-daily] down: откат не выполняется');
  },
};
