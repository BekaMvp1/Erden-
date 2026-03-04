/**
 * Роуты для дашборда
 * GET /api/dashboard — дашборд производства (KPI, этажи, горящие заказы, счётчики этапов)
 * GET /api/dashboard/summary — сводка по заказам (легаси)
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { STAGES } = require('../constants/boardStages');

const router = express.Router();

/** Понедельник и воскресенье текущей недели (YYYY-MM-DD) */
function getWeekBounds() {
  const d = new Date();
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return {
    monday: mon.toISOString().slice(0, 10),
    sunday: sun.toISOString().slice(0, 10),
  };
}

/**
 * GET /api/dashboard
 * Дашборд производства: KPI, табло этажей, горящие заказы, счётчики по этапам
 */
router.get('/', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const { monday, sunday } = getWeekBounds();

    // KPI: заказы в работе (Принят, В работе), просроченные
    const [statusRows] = await db.sequelize.query(`
      SELECT 
        (SELECT COUNT(*) FROM orders o 
         JOIN order_status os ON os.id = o.status_id 
         WHERE LOWER(os.name) IN ('принят', 'в работе')) AS orders_in_progress,
        (SELECT COUNT(*) FROM orders WHERE deadline < :today) AS overdue
    `, { replacements: { today } });
    const kpi = {
      orders_in_progress: parseInt(statusRows[0]?.orders_in_progress || 0, 10),
      overdue: parseInt(statusRows[0]?.overdue || 0, 10),
      today_plan: 0,
      today_fact: 0,
      qc_pending: 0,
      warehouse_ready: 0,
      to_ship: 0,
    };

    // План/факт сегодня по пошиву (production_plan_day)
    const [dayRows] = await db.sequelize.query(`
      SELECT 
        COALESCE(SUM(planned_qty), 0)::int AS plan_today,
        COALESCE(SUM(actual_qty), 0)::int AS fact_today
      FROM production_plan_day WHERE date = :today
    `, { replacements: { today } });
    kpi.today_plan = parseInt(dayRows[0]?.plan_today || 0, 10);
    kpi.today_fact = parseInt(dayRows[0]?.fact_today || 0, 10);

    // ОТК ожидают: партии DONE без QC
    const [qcRows] = await db.sequelize.query(`
      SELECT COUNT(*) AS cnt FROM sewing_batches sb
      LEFT JOIN qc_batches qb ON qb.batch_id = sb.id
      WHERE sb.status = 'DONE' AND qb.id IS NULL
    `);
    kpi.qc_pending = parseInt(qcRows[0]?.cnt || 0, 10);

    // На складе готово: сумма qty
    const [whRows] = await db.sequelize.query(`SELECT COALESCE(SUM(qty), 0)::int AS total FROM warehouse_stock`);
    kpi.warehouse_ready = parseInt(whRows[0]?.total || 0, 10);

    // К отгрузке сегодня/завтра: заказы с дедлайном сегодня или завтра
    const [shipRows] = await db.sequelize.query(`
      SELECT COUNT(*) AS cnt FROM orders WHERE deadline IN (:today, :tomorrow)
    `, { replacements: { today, tomorrow } });
    kpi.to_ship = parseInt(shipRows[0]?.cnt || 0, 10);

    // Табло этажей 1..4: план сегодня, факт сегодня, % выполнения, остаток на неделю
    const [floorToday] = await db.sequelize.query(`
      SELECT floor_id,
             COALESCE(SUM(planned_qty), 0)::int AS plan_today,
             COALESCE(SUM(actual_qty), 0)::int AS fact_today
      FROM production_plan_day WHERE date = :today AND floor_id IN (1,2,3,4)
      GROUP BY floor_id
    `, { replacements: { today } });
    const [floorWeek] = await db.sequelize.query(`
      SELECT floor_id,
             COALESCE(SUM(planned_qty), 0)::int AS plan_week,
             COALESCE(SUM(actual_qty), 0)::int AS fact_week
      FROM production_plan_day WHERE date BETWEEN :monday AND :sunday AND floor_id IN (1,2,3,4)
      GROUP BY floor_id
    `, { replacements: { monday, sunday } });
    const weekByFloor = {};
    floorWeek.forEach((r) => { weekByFloor[r.floor_id] = r; });
    const floorNames = { 1: 'Этаж 1', 2: 'Этаж 2', 3: 'Этаж 3', 4: 'Этаж 4' };
    const floor_stats = [1, 2, 3, 4].map((fid) => {
      const t = floorToday.find((r) => r.floor_id === fid) || { plan_today: 0, fact_today: 0 };
      const w = weekByFloor[fid] || { plan_week: 0, fact_week: 0 };
      const plan_today = parseInt(t.plan_today || 0, 10);
      const fact_today = parseInt(t.fact_today || 0, 10);
      const plan_week = parseInt(w.plan_week || 0, 10);
      const fact_week = parseInt(w.fact_week || 0, 10);
      const remainder_week = Math.max(0, plan_week - fact_week);
      const percent = plan_today > 0 ? Math.round((fact_today / plan_today) * 100) : 0;
      return {
        floor_id: fid,
        floor_name: floorNames[fid],
        plan_today,
        fact_today,
        percent,
        remainder_week,
      };
    });

    // Горящие заказы: просрочены или дедлайн <= 3 дня, топ 10 по приоритету
    const threeDaysLater = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
    const hotOrders = await db.Order.findAll({
      where: { deadline: { [Op.lte]: threeDaysLater } },
      include: [
        { model: db.Client, as: 'Client', attributes: ['name'] },
        { model: db.OrderStatus, as: 'OrderStatus', attributes: ['name'] },
      ],
      attributes: ['id', 'title', 'deadline', 'created_at'],
      order: [['deadline', 'ASC']],
      limit: 10,
    });
    const hot_orders = hotOrders.map((o) => ({
      id: o.id,
      title: o.title,
      deadline: o.deadline,
      client_name: o.Client?.name || '—',
      status_name: o.OrderStatus?.name || '—',
      is_overdue: o.deadline && o.deadline < today,
    }));

    // Счётчики по этапам: заказы, у которых этап не DONE (упрощённо — по order_operations)
    const stageKeys = ['procurement', 'cutting', 'sewing', 'qc', 'warehouse', 'shipping'];
    const [stageRows] = await db.sequelize.query(`
      SELECT stage_key, COUNT(DISTINCT order_id) AS cnt
      FROM order_operations
      WHERE stage_key IS NOT NULL AND stage_key != ''
      GROUP BY stage_key
    `);
    const stage_counts = {};
    stageKeys.forEach((k) => { stage_counts[k] = 0; });
    stageRows.forEach((r) => {
      if (stage_counts[r.stage_key] !== undefined) stage_counts[r.stage_key] = parseInt(r.cnt, 10);
    });

    res.json({
      kpi,
      floor_stats,
      hot_orders,
      stage_counts,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/dashboard/summary
 * Возвращает сводку: всего заказов, активные, выполненные, процент выполнения
 */
router.get('/summary', async (req, res, next) => {
  try {
    // Один запрос: агрегация по статусам
    const [rows] = await db.sequelize.query(`
      SELECT 
        (SELECT COUNT(*) FROM orders) as total,
        (SELECT COUNT(*) FROM orders o 
         JOIN order_status os ON os.id = o.status_id 
         WHERE os.name IN ('Принят', 'В работе')) as active,
        (SELECT COUNT(*) FROM orders o 
         JOIN order_status os ON os.id = o.status_id 
         WHERE os.name = 'Готов') as completed
    `);

    const r = rows[0];
    const totalOrders = parseInt(r?.total || 0, 10);
    const activeOrders = parseInt(r?.active || 0, 10);
    const completedOrders = parseInt(r?.completed || 0, 10);

    // Процент выполнения (выполненные / всего * 100)
    const completionPercent =
      totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;

    res.json({
      totalOrders,
      activeOrders,
      completedOrders,
      completionPercent,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
