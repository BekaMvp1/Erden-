/**
 * Синхронизация weekly_plans (кэш) и пересчёт переноса (weekly_carry)
 * Источник правды: daily_plan. manual_week = SUM(daily), carry хранится в weekly_carry.
 */

const { Op } = require('sequelize');
const { getWeekStart } = require('./planningUtils');

/**
 * Обновить кэш weekly_plans для затронутых недель после изменения daily
 * @param {object} db - модели
 * @param {number} workshopId
 * @param {number|null} floorId
 * @param {number} orderId
 * @param {string[]} dates - даты, которые изменились
 * @param {number} periodId - id периода планирования
 * @param {object} transaction - транзакция Sequelize
 */
async function syncWeeklyCacheFromDaily(db, workshopId, floorId, orderId, dates, periodId, transaction = null) {
  if (!dates || dates.length === 0) return;
  if (!periodId) return;

  const opts = transaction ? { transaction } : {};
  const weekStarts = new Set();
  for (const d of dates) {
    weekStarts.add(getWeekStart(d));
  }

  for (const ws of weekStarts) {
    const we = new Date(ws + 'T12:00:00');
    we.setDate(we.getDate() + 6);
    const weekEnd = we.toISOString().slice(0, 10);

    const rows = await db.ProductionPlanDay.findAll({
      where: {
        period_id: periodId,
        order_id: orderId,
        workshop_id: workshopId,
        floor_id: floorId,
        date: { [Op.between]: [ws, weekEnd] },
      },
      attributes: ['planned_qty'],
      ...opts,
    });

    const sum = rows.reduce((s, r) => s + (r.planned_qty || 0), 0);

    const [wp] = await db.WeeklyPlan.findOrCreate({
      where: {
        period_id: periodId,
        workshop_id: workshopId,
        building_floor_id: floorId,
        week_start: ws,
        row_key: orderId,
      },
      defaults: { planned_manual: sum, planned_carry: 0 },
      ...opts,
    });
    if (wp) {
      await wp.update({ planned_manual: sum, planned_carry: 0 }, opts);
    }
  }
}

/**
 * Dev: проверка целостности weekly_from_daily vs weekly_stored
 */
async function checkWeeklyIntegrity(db) {
  if (process.env.NODE_ENV === 'production') return;

  const weeklyRows = await db.WeeklyPlan.findAll({
    attributes: ['id', 'workshop_id', 'building_floor_id', 'week_start', 'row_key', 'planned_manual', 'planned_carry'],
  });

  for (const wp of weeklyRows) {
    const we = new Date(wp.week_start + 'T12:00:00');
    we.setDate(we.getDate() + 6);
    const weekEnd = we.toISOString().slice(0, 10);

    const dailyRows = await db.ProductionPlanDay.findAll({
      where: {
        order_id: wp.row_key,
        workshop_id: wp.workshop_id,
        floor_id: wp.building_floor_id,
        date: { [Op.between]: [wp.week_start, weekEnd] },
      },
      attributes: ['planned_qty'],
    });

    const weeklyFromDaily = dailyRows.reduce((s, r) => s + (r.planned_qty || 0), 0);
    const weeklyStored = parseFloat(wp.planned_manual || 0) + parseFloat(wp.planned_carry || 0);

    if (Math.abs(weeklyFromDaily - weeklyStored) > 0.01) {
      console.warn('[planning integrity] Расхождение weekly vs daily:', {
        workshop_id: wp.workshop_id,
        floor_id: wp.building_floor_id,
        week_start: wp.week_start,
        row_key: wp.row_key,
        weekly_stored: weeklyStored,
        weekly_from_daily: weeklyFromDaily,
      });
    }
  }
}

/**
 * Пересчитать carry по всем строкам и неделям периода. manual не меняется.
 * remainder_week = max(0, planned_total_week - fact_week), carry_next_week = remainder_week
 * @param {object} db
 * @param {number} workshopId
 * @param {number|null} floorId
 * @param {number} periodId - id периода планирования (месяц)
 * @param {object} transaction
 */
async function recalculateCarry(db, workshopId, floorId, periodId, transaction = null) {
  if (!periodId) return;

  const period = await db.PlanningPeriod.findByPk(periodId, {
    attributes: ['start_date', 'end_date'],
    ...(transaction ? { transaction } : {}),
  });
  if (!period) return;

  const firstDay = period.start_date;
  const lastDate = period.end_date;

  const weeks = [];
  const d = new Date(firstDay + 'T12:00:00');
  const dayOfWeek = d.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diffToMonday);
  const lastDateObj = new Date(lastDate + 'T12:00:00');
  while (d <= lastDateObj) {
    const we = new Date(d);
    we.setDate(we.getDate() + 6);
    weeks.push({
      week_start: d.toISOString().slice(0, 10),
      week_end: we.toISOString().slice(0, 10),
    });
    d.setDate(d.getDate() + 7);
  }

  const ordersWhere = { workshop_id: workshopId };
  if (floorId != null) {
    ordersWhere[Op.or] = [{ building_floor_id: floorId }, { building_floor_id: null }];
  }
  const orders = await db.Order.findAll({
    where: ordersWhere,
    attributes: ['id'],
    ...(transaction ? { transaction } : {}),
  });
  const rowKeys = orders.map((o) => o.id);

  const planDays = await db.ProductionPlanDay.findAll({
    where: {
      period_id: periodId,
      workshop_id: workshopId,
      floor_id: floorId,
      order_id: { [Op.in]: rowKeys },
      date: { [Op.between]: [firstDay, lastDate] },
    },
    attributes: ['order_id', 'date', 'planned_qty', 'actual_qty'],
    ...(transaction ? { transaction } : {}),
  });

  const existingCarry = await db.WeeklyCarry.findAll({
    where: {
      period_id: periodId,
      workshop_id: workshopId,
      building_floor_id: floorId,
      row_key: { [Op.in]: rowKeys },
      week_start: { [Op.in]: weeks.map((w) => w.week_start) },
    },
    ...(transaction ? { transaction } : {}),
  });
  const carryByKey = {};
  for (const c of existingCarry) {
    carryByKey[`${c.row_key}_${c.week_start}`] = parseFloat(c.carry_qty) || 0;
  }

  const manualByKey = {};
  const factByKey = {};
  for (const w of weeks) {
    const wStart = new Date(w.week_start + 'T12:00:00');
    const wEnd = new Date(w.week_end + 'T12:00:00');
    for (const oid of rowKeys) {
      let manual = 0;
      let fact = 0;
      for (const pd of planDays) {
        if (pd.order_id !== oid) continue;
        const dt = new Date(pd.date + 'T12:00:00');
        if (dt >= wStart && dt <= wEnd) {
          manual += pd.planned_qty || 0;
          fact += pd.actual_qty || 0;
        }
      }
      manualByKey[`${oid}_${w.week_start}`] = manual;
      factByKey[`${oid}_${w.week_start}`] = fact;
    }
  }

  const opts = transaction ? { transaction } : {};
  for (const order of orders) {
    let prevRemainder = 0;
    for (let i = 0; i < weeks.length; i++) {
      const w = weeks[i];
      const pk = `${order.id}_${w.week_start}`;
      const manual_week = manualByKey[pk] || 0;
      const carry_week = i === 0 ? (carryByKey[pk] ?? 0) : prevRemainder;
      const total_week = manual_week + carry_week;
      const fact_week = factByKey[pk] || 0;
      const remainder_week = Math.max(0, total_week - fact_week);
      prevRemainder = remainder_week;

      const nextWeekStart = i + 1 < weeks.length ? weeks[i + 1].week_start : null;
      if (nextWeekStart) {
        const [row] = await db.WeeklyCarry.findOrCreate({
          where: {
            period_id: periodId,
            workshop_id: workshopId,
            building_floor_id: floorId,
            week_start: nextWeekStart,
            row_key: order.id,
          },
          defaults: { carry_qty: remainder_week },
          ...opts,
        });
        if (row) await row.update({ carry_qty: remainder_week }, opts);
      }
    }
  }
}

module.exports = {
  syncWeeklyCacheFromDaily,
  checkWeeklyIntegrity,
  recalculateCarry,
};
