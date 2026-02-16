/**
 * Контроллер Executive Dashboard
 * Управленческая панель и автоматический контроль производства
 * Все вычисления — одним SQL-запросом на показатель (без циклов)
 */

const db = require('../models');

/** Возвращает границы текущей недели (пн-вс) в формате YYYY-MM-DD */
function getWeekBounds() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const mondayStr = monday.toISOString().split('T')[0];
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const sundayStr = sunday.toISOString().split('T')[0];
  return { todayStr, mondayStr, sundayStr };
}

/**
 * GET /api/executive/summary
 * Ключевые показатели для управленческой панели
 */
async function getSummary(req, res, next) {
  try {
    const { todayStr, mondayStr, sundayStr } = getWeekBounds();

    // 1) active_orders — статус != "Готов" (заказ завершён)
    const activeRows = await db.sequelize.query(
      `SELECT COUNT(*)::int as count 
       FROM orders o
       JOIN order_status os ON os.id = o.status_id
       WHERE os.name != 'Готов'`,
      { type: db.sequelize.QueryTypes.SELECT }
    );
    const activeOrders = activeRows[0]?.count ?? 0;

    // 2) overdue_orders — deadline < today AND статус != "Готов"
    const overdueRows = await db.sequelize.query(
      `SELECT COUNT(*)::int as count 
       FROM orders o
       JOIN order_status os ON os.id = o.status_id
       WHERE o.deadline < :today AND os.name != 'Готов'`,
      { replacements: { today: todayStr }, type: db.sequelize.QueryTypes.SELECT }
    );
    const overdueOrders = overdueRows[0]?.count ?? 0;

    // 3) overloaded_floors — daily_capacity этажа vs planned_qty за неделю
    // capacity = sum(sewers.capacity_per_day) по технологам с building_floor_id
    // weekly_capacity = daily_capacity * 7, load = planned_qty / weekly_capacity
    const capacityRows = await db.sequelize.query(
      `SELECT t.building_floor_id as floor_id,
              COALESCE(SUM(s.capacity_per_day), 0)::int as daily_capacity
       FROM technologists t
       JOIN sewers s ON s.technologist_id = t.id
       WHERE t.building_floor_id IS NOT NULL
       GROUP BY t.building_floor_id`,
      { type: db.sequelize.QueryTypes.SELECT }
    );

    const plannedRows = await db.sequelize.query(
      `SELECT floor_id, COALESCE(SUM(planned_qty), 0)::int as planned_qty
       FROM production_plan_day
       WHERE date >= :monday AND date <= :sunday AND floor_id IS NOT NULL
       GROUP BY floor_id`,
      { replacements: { monday: mondayStr, sunday: sundayStr }, type: db.sequelize.QueryTypes.SELECT }
    );

    const capacityMap = (capacityRows || []).reduce((acc, r) => {
      acc[r.floor_id] = r.daily_capacity || 500; // 500 по умолчанию
      return acc;
    }, {});

    const plannedMap = (plannedRows || []).reduce((acc, r) => {
      acc[r.floor_id] = r.planned_qty || 0;
      return acc;
    }, {});

    let overloadedFloors = 0;
    const allFloorIds = new Set([...Object.keys(capacityMap), ...Object.keys(plannedMap)]);
    for (const fid of allFloorIds) {
      const dailyCap = capacityMap[fid] ?? 500;
      const weeklyCap = dailyCap * 7;
      const planned = plannedMap[fid] ?? 0;
      if (weeklyCap > 0 && (planned / weeklyCap) * 100 > 100) {
        overloadedFloors++;
      }
    }

    // 4) week_completion_percent — sum(actual_qty) / sum(planned_qty) * 100
    const completionRows = await db.sequelize.query(
      `SELECT COALESCE(SUM(actual_qty), 0)::int as actual_qty,
              COALESCE(SUM(planned_qty), 0)::int as planned_qty
       FROM production_plan_day
       WHERE date >= :monday AND date <= :sunday`,
      { replacements: { monday: mondayStr, sunday: sundayStr }, type: db.sequelize.QueryTypes.SELECT }
    );
    const actualQty = completionRows[0]?.actual_qty ?? 0;
    const plannedQty = completionRows[0]?.planned_qty ?? 0;
    const weekCompletionPercent = plannedQty > 0 ? Math.round((actualQty / plannedQty) * 100) : 0;

    // 5) finish_delay — этаж финиш: planned_total - actual_total за неделю
    const finishFloorRows = await db.sequelize.query(
      `SELECT DISTINCT oo.floor_id
       FROM order_operations oo
       JOIN operations op ON op.id = oo.operation_id
       WHERE op.category = 'FINISH' AND oo.floor_id IS NOT NULL
       LIMIT 1`,
      { type: db.sequelize.QueryTypes.SELECT }
    );
    const finishFloorRow = finishFloorRows[0];

    let finishDelay = 0;
    if (finishFloorRow?.floor_id) {
      const finishResultRows = await db.sequelize.query(
        `SELECT COALESCE(SUM(planned_qty), 0)::int as planned_qty,
                COALESCE(SUM(actual_qty), 0)::int as actual_qty
         FROM production_plan_day
         WHERE date >= :monday AND date <= :sunday AND floor_id = :floorId`,
        {
          replacements: { monday: mondayStr, sunday: sundayStr, floorId: finishFloorRow.floor_id },
          type: db.sequelize.QueryTypes.SELECT,
        }
      );
      const finishPlanned = finishResultRows[0]?.planned_qty ?? 0;
      const finishActual = finishResultRows[0]?.actual_qty ?? 0;
      finishDelay = finishPlanned - finishActual;
    }

    // 6) new_orders_today — created_at = today
    const newOrdersRows = await db.sequelize.query(
      `SELECT COUNT(*)::int as count 
       FROM orders 
       WHERE DATE(created_at) = :today`,
      { replacements: { today: todayStr }, type: db.sequelize.QueryTypes.SELECT }
    );
    const newOrdersToday = newOrdersRows[0]?.count ?? 0;

    res.json({
      active_orders: activeOrders,
      overdue_orders: overdueOrders,
      overloaded_floors: overloadedFloors,
      week_completion_percent: weekCompletionPercent,
      finish_delay: finishDelay,
      new_orders_today: newOrdersToday,
    });
  } catch (err) {
    console.error('Error in executive/summary:', err);
    next(err);
  }
}

/**
 * GET /api/executive/alerts
 * Предупреждения автоматического контроля
 */
async function getAlerts(req, res, next) {
  try {
    const { todayStr, mondayStr, sundayStr } = getWeekBounds();

    // capacity и planned по этажам
    const capacityRows = await db.sequelize.query(
      `SELECT t.building_floor_id as floor_id,
              bf.name as floor_name,
              COALESCE(SUM(s.capacity_per_day), 0)::int as daily_capacity
       FROM technologists t
       JOIN sewers s ON s.technologist_id = t.id
       LEFT JOIN building_floors bf ON bf.id = t.building_floor_id
       WHERE t.building_floor_id IS NOT NULL
       GROUP BY t.building_floor_id, bf.name`,
      { type: db.sequelize.QueryTypes.SELECT }
    );

    const plannedRows = await db.sequelize.query(
      `SELECT ppd.floor_id, bf.name as floor_name,
              COALESCE(SUM(ppd.planned_qty), 0)::int as planned_qty
       FROM production_plan_day ppd
       LEFT JOIN building_floors bf ON bf.id = ppd.floor_id
       WHERE ppd.date >= :monday AND ppd.date <= :sunday AND ppd.floor_id IS NOT NULL
       GROUP BY ppd.floor_id, bf.name`,
      { replacements: { monday: mondayStr, sunday: sundayStr }, type: db.sequelize.QueryTypes.SELECT }
    );

    const capMap = (capacityRows || []).reduce((acc, r) => {
      acc[r.floor_id] = { daily_capacity: r.daily_capacity || 500, floor_name: r.floor_name };
      return acc;
    }, {});

    const plannedMap = (plannedRows || []).reduce((acc, r) => {
      acc[r.floor_id] = { planned_qty: r.planned_qty || 0, floor_name: r.floor_name };
      return acc;
    }, {});

    const floorLoadMap = [];
    const allIds = new Set([...Object.keys(capMap), ...Object.keys(plannedMap)]);
    let overloadWarning = false;

    for (const fid of allIds) {
      const cap = capMap[fid]?.daily_capacity ?? 500;
      const planned = plannedMap[fid]?.planned_qty ?? 0;
      const weeklyCap = cap * 7;
      const loadPercent = weeklyCap > 0 ? (planned / weeklyCap) * 100 : 0;
      const name = capMap[fid]?.floor_name || plannedMap[fid]?.floor_name || `Этаж ${fid}`;
      floorLoadMap.push({ floor_id: parseInt(fid, 10), floor_name: name, load_percent: loadPercent });
      if (loadPercent > 100) overloadWarning = true;
    }

    // overdue_warning
    const overdueRows = await db.sequelize.query(
      `SELECT COUNT(*)::int as count 
       FROM orders o
       JOIN order_status os ON os.id = o.status_id
       WHERE o.deadline < :today AND os.name != 'Готов'`,
      { replacements: { today: todayStr }, type: db.sequelize.QueryTypes.SELECT }
    );
    const overdueWarning = (overdueRows[0]?.count ?? 0) > 0;

    // finish_risk — выполнение финиша < 80% плана
    let finishRisk = false;
    const finishFloorRows = await db.sequelize.query(
      `SELECT DISTINCT oo.floor_id
       FROM order_operations oo
       JOIN operations op ON op.id = oo.operation_id
       WHERE op.category = 'FINISH' AND oo.floor_id IS NOT NULL
       LIMIT 1`,
      { type: db.sequelize.QueryTypes.SELECT }
    );
    const finishFloorRow = finishFloorRows[0];

    if (finishFloorRow?.floor_id) {
      const finishResultRows = await db.sequelize.query(
        `SELECT COALESCE(SUM(actual_qty), 0)::int as actual_qty,
                COALESCE(SUM(planned_qty), 0)::int as planned_qty
         FROM production_plan_day
         WHERE date >= :monday AND date <= :sunday AND floor_id = :floorId`,
        {
          replacements: { monday: mondayStr, sunday: sundayStr, floorId: finishFloorRow.floor_id },
          type: db.sequelize.QueryTypes.SELECT,
        }
      );
      const finishActual = finishResultRows[0]?.actual_qty ?? 0;
      const finishPlanned = finishResultRows[0]?.planned_qty ?? 0;
      if (finishPlanned > 0) {
        finishRisk = (finishActual / finishPlanned) * 100 < 80;
      }
    }

    // recommended_floor — этаж с минимальной загрузкой + заказ для распределения
    let recommendedFloor = null;
    if (floorLoadMap.length > 0) {
      floorLoadMap.sort((a, b) => a.load_percent - b.load_percent);
      const minFloor = floorLoadMap[0];

      const oldestOrderRows = await db.sequelize.query(
        `SELECT o.id, o.title
         FROM orders o
         JOIN order_status os ON os.id = o.status_id
         WHERE os.name IN ('Принят', 'В работе')
         ORDER BY o.created_at ASC
         LIMIT 1`,
        { type: db.sequelize.QueryTypes.SELECT }
      );
      const oldestOrder = oldestOrderRows[0];

      if (oldestOrder?.id) {
        recommendedFloor = {
          order_id: oldestOrder.id,
          order_title: oldestOrder.title || '',
          suggested_floor_id: minFloor.floor_id,
          suggested_floor_name: minFloor.floor_name || '',
          current_load_percent: Math.round(minFloor.load_percent),
        };
      }
    }

    res.json({
      overload_warning: overloadWarning,
      overdue_warning: overdueWarning,
      finish_risk: finishRisk,
      recommended_floor: recommendedFloor,
    });
  } catch (err) {
    console.error('Error in executive/alerts:', err);
    next(err);
  }
}

module.exports = { getSummary, getAlerts };
