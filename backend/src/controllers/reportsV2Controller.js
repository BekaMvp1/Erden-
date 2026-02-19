/**
 * Контроллер отчётов v2
 * Источник данных: только production_plan_day (planned_qty, actual_qty)
 */

const db = require('../models');

/** Форматирование даты YYYY-MM-DD */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * GET /api/reports/v2/kpi
 * KPI: planned_sum, actual_sum, completion_percent, overdue_orders, active_orders, finish_delay
 */
async function getKpi(req, res, next) {
  try {
    const { workshop_id, from, to, floor_id } = req.query;
    if (!workshop_id || !from || !to) {
      return res.status(400).json({ error: 'Укажите workshop_id, from, to' });
    }
    if (from > to) {
      return res.status(400).json({ error: 'Дата начала не может быть позже даты окончания' });
    }

    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });

    let floorCondition = '';
    let floorParam = null;
    if (workshop.floors_count === 4 && floor_id) {
      floorCondition = 'AND floor_id = :floorId';
      floorParam = Number(floor_id);
    } else if (workshop.floors_count === 1) {
      floorCondition = 'AND floor_id IS NULL';
    }

    const planRows = await db.sequelize.query(
      `SELECT COALESCE(SUM(planned_qty), 0)::int as planned_sum,
              COALESCE(SUM(actual_qty), 0)::int as actual_sum
       FROM production_plan_day
       WHERE workshop_id = :workshopId
         AND date BETWEEN :from AND :to
         ${floorCondition}`,
      {
        replacements: {
          workshopId: Number(workshop_id),
          from,
          to,
          ...(floorParam != null && { floorId: floorParam }),
        },
        type: db.sequelize.QueryTypes.SELECT,
      }
    );
    const plannedSum = planRows[0]?.planned_sum ?? 0;
    const actualSum = planRows[0]?.actual_sum ?? 0;
    const completionPercent = plannedSum > 0 ? Math.round((actualSum / plannedSum) * 100) : 0;

    const today = todayStr();
    const overdueRows = await db.sequelize.query(
      `SELECT COUNT(*)::int as count
       FROM orders o
       JOIN order_status os ON os.id = o.status_id
       WHERE o.workshop_id = :workshopId
         AND o.deadline < :today
         AND os.name != 'Готов'`,
      {
        replacements: { workshopId: Number(workshop_id), today },
        type: db.sequelize.QueryTypes.SELECT,
      }
    );
    const overdueOrders = overdueRows[0]?.count ?? 0;

    const activeRows = await db.sequelize.query(
      `SELECT COUNT(*)::int as count
       FROM orders o
       JOIN order_status os ON os.id = o.status_id
       WHERE o.workshop_id = :workshopId
         AND os.name != 'Готов'`,
      {
        replacements: { workshopId: Number(workshop_id) },
        type: db.sequelize.QueryTypes.SELECT,
      }
    );
    const activeOrders = activeRows[0]?.count ?? 0;

    let finishDelay = 0;
    if (workshop.floors_count === 4) {
      const finishRows = await db.sequelize.query(
        `SELECT COALESCE(SUM(planned_qty), 0)::int as planned_sum,
                COALESCE(SUM(actual_qty), 0)::int as actual_sum
         FROM production_plan_day
         WHERE workshop_id = :workshopId
           AND floor_id = 1
           AND date BETWEEN :from AND :to`,
        {
          replacements: { workshopId: Number(workshop_id), from, to },
          type: db.sequelize.QueryTypes.SELECT,
        }
      );
      const fp = finishRows[0]?.planned_sum ?? 0;
      const fa = finishRows[0]?.actual_sum ?? 0;
      finishDelay = fp - fa;
    }

    res.json({
      planned_sum: plannedSum,
      actual_sum: actualSum,
      completion_percent: completionPercent,
      overdue_orders: overdueOrders,
      active_orders: activeOrders,
      finish_delay: finishDelay,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/v2/floors
 * По этажам: floor_id, floor_name, planned_sum, actual_sum, completion_percent
 */
async function getFloors(req, res, next) {
  try {
    const { workshop_id, from, to } = req.query;
    if (!workshop_id || !from || !to) {
      return res.status(400).json({ error: 'Укажите workshop_id, from, to' });
    }

    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });

    if (workshop.floors_count === 1) {
      const rows = await db.sequelize.query(
        `SELECT NULL::int as floor_id, 'Общий' as floor_name,
                COALESCE(SUM(planned_qty), 0)::int as planned_sum,
                COALESCE(SUM(actual_qty), 0)::int as actual_sum
         FROM production_plan_day
         WHERE workshop_id = :workshopId
           AND floor_id IS NULL
           AND date BETWEEN :from AND :to`,
        {
          replacements: { workshopId: Number(workshop_id), from, to },
          type: db.sequelize.QueryTypes.SELECT,
        }
      );
      const r = rows[0];
      const planned = r?.planned_sum ?? 0;
      const actual = r?.actual_sum ?? 0;
      return res.json([
        {
          floor_id: null,
          floor_name: 'Общий',
          planned_sum: planned,
          actual_sum: actual,
          completion_percent: planned > 0 ? Math.round((actual / planned) * 100) : 0,
        },
      ]);
    }

    const rows = await db.sequelize.query(
      `SELECT bf.id as floor_id, bf.name as floor_name,
              COALESCE(SUM(ppd.planned_qty), 0)::int as planned_sum,
              COALESCE(SUM(ppd.actual_qty), 0)::int as actual_sum
       FROM building_floors bf
       LEFT JOIN production_plan_day ppd ON ppd.floor_id = bf.id
         AND ppd.workshop_id = :workshopId
         AND ppd.date BETWEEN :from AND :to
       WHERE bf.id BETWEEN 1 AND 4
       GROUP BY bf.id, bf.name
       ORDER BY bf.id`,
      {
        replacements: { workshopId: Number(workshop_id), from, to },
        type: db.sequelize.QueryTypes.SELECT,
      }
    );

    const result = (rows || []).map((r) => {
      const planned = r.planned_sum ?? 0;
      const actual = r.actual_sum ?? 0;
      return {
        floor_id: r.floor_id,
        floor_name: r.floor_name || `Этаж ${r.floor_id}`,
        planned_sum: planned,
        actual_sum: actual,
        completion_percent: planned > 0 ? Math.round((actual / planned) * 100) : 0,
      };
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/v2/technologists
 * По технологам: привязка к этажу через building_floor_id, данные из production_plan_day по floor
 */
async function getTechnologists(req, res, next) {
  try {
    const { workshop_id, from, to } = req.query;
    if (!workshop_id || !from || !to) {
      return res.status(400).json({ error: 'Укажите workshop_id, from, to' });
    }

    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });

    if (workshop.floors_count === 1) {
      const totalRows = await db.sequelize.query(
        `SELECT COALESCE(SUM(planned_qty), 0)::int as planned_sum,
                COALESCE(SUM(actual_qty), 0)::int as actual_sum
         FROM production_plan_day
         WHERE workshop_id = :workshopId AND floor_id IS NULL AND date BETWEEN :from AND :to`,
        {
          replacements: { workshopId: Number(workshop_id), from, to },
          type: db.sequelize.QueryTypes.SELECT,
        }
      );
      const planned = totalRows[0]?.planned_sum ?? 0;
      const actual = totalRows[0]?.actual_sum ?? 0;
      const techRows = await db.sequelize.query(
        `SELECT t.id as technologist_id, u.name
         FROM technologists t
         JOIN users u ON u.id = t.user_id
         WHERE t.building_floor_id IS NOT NULL`,
        { type: db.sequelize.QueryTypes.SELECT }
      );
      const result = (techRows || []).map((r) => ({
        technologist_id: r.technologist_id,
        name: r.name || '—',
        planned_sum: planned,
        actual_sum: actual,
        completion_percent: planned > 0 ? Math.round((actual / planned) * 100) : 0,
      }));
      return res.json(result);
    }

    const rows = await db.sequelize.query(
      `SELECT t.id as technologist_id, u.name, t.building_floor_id as floor_id,
              COALESCE(SUM(ppd.planned_qty), 0)::int as planned_sum,
              COALESCE(SUM(ppd.actual_qty), 0)::int as actual_sum
       FROM technologists t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN production_plan_day ppd ON ppd.workshop_id = :workshopId
         AND ppd.floor_id = t.building_floor_id
         AND ppd.date BETWEEN :from AND :to
       WHERE t.building_floor_id IS NOT NULL
       GROUP BY t.id, u.name, t.building_floor_id
       ORDER BY t.building_floor_id, u.name`,
      {
        replacements: { workshopId: Number(workshop_id), from, to },
        type: db.sequelize.QueryTypes.SELECT,
      }
    );

    const result = (rows || []).map((r) => {
      const planned = r.planned_sum ?? 0;
      const actual = r.actual_sum ?? 0;
      return {
        technologist_id: r.technologist_id,
        name: r.name || '—',
        planned_sum: planned,
        actual_sum: actual,
        completion_percent: planned > 0 ? Math.round((actual / planned) * 100) : 0,
      };
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/v2/sewers
 * По швеям: production_plan_day не содержит sewer_id — MVP возвращает пустой массив
 */
async function getSewers(req, res, next) {
  try {
    const { workshop_id, from, to } = req.query;
    if (!workshop_id || !from || !to) {
      return res.status(400).json({ error: 'Укажите workshop_id, from, to' });
    }

    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });

    res.json([]);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/v2/orders-late
 * Проблемные заказы: delay_qty = planned_sum - actual_sum (если > 0)
 */
async function getOrdersLate(req, res, next) {
  try {
    const { workshop_id, from, to } = req.query;
    if (!workshop_id || !from || !to) {
      return res.status(400).json({ error: 'Укажите workshop_id, from, to' });
    }

    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });

    const floorCond =
      workshop.floors_count === 1
        ? 'AND ppd.floor_id IS NULL'
        : 'AND ppd.floor_id IS NOT NULL';

    const rows = await db.sequelize.query(
      `SELECT o.id as order_id, c.name as client_name, o.title as order_title,
              o.deadline,
              COALESCE(SUM(ppd.planned_qty), 0)::int as planned_sum,
              COALESCE(SUM(ppd.actual_qty), 0)::int as actual_sum
       FROM orders o
       JOIN order_status os ON os.id = o.status_id
       LEFT JOIN clients c ON c.id = o.client_id
       LEFT JOIN production_plan_day ppd ON ppd.order_id = o.id
         AND ppd.workshop_id = :workshopId
         AND ppd.date BETWEEN :from AND :to
         ${floorCond}
       WHERE o.workshop_id = :workshopId
         AND os.name != 'Готов'
       GROUP BY o.id, c.name, o.title, o.deadline
       HAVING COALESCE(SUM(ppd.planned_qty), 0) - COALESCE(SUM(ppd.actual_qty), 0) > 0
       ORDER BY (COALESCE(SUM(ppd.planned_qty), 0) - COALESCE(SUM(ppd.actual_qty), 0)) DESC`,
      {
        replacements: { workshopId: Number(workshop_id), from, to },
        type: db.sequelize.QueryTypes.SELECT,
      }
    );

    const result = (rows || []).map((r) => {
      const planned = r.planned_sum ?? 0;
      const actual = r.actual_sum ?? 0;
      const delayQty = Math.max(0, planned - actual);
      return {
        order_id: r.order_id,
        client_name: r.client_name || '—',
        order_title: r.order_title || '—',
        deadline: r.deadline,
        planned_sum: planned,
        actual_sum: actual,
        delay_qty: delayQty,
      };
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/v2/plan-fact
 * План/факт по дням для графика
 */
async function getPlanFact(req, res, next) {
  try {
    const { workshop_id, from, to } = req.query;
    if (!workshop_id || !from || !to) {
      return res.status(400).json({ error: 'Укажите workshop_id, from, to' });
    }

    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });

    const floorCond =
      workshop.floors_count === 1
        ? 'AND floor_id IS NULL'
        : 'AND floor_id IS NOT NULL';

    const rows = await db.sequelize.query(
      `SELECT date,
              COALESCE(SUM(planned_qty), 0)::int as planned_sum,
              COALESCE(SUM(actual_qty), 0)::int as actual_sum
       FROM production_plan_day
       WHERE workshop_id = :workshopId
         AND date BETWEEN :from AND :to
         ${floorCond}
       GROUP BY date
       ORDER BY date`,
      {
        replacements: { workshopId: Number(workshop_id), from, to },
        type: db.sequelize.QueryTypes.SELECT,
      }
    );
    res.json(rows || []);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/v2/export.csv
 * Экспорт CSV по типу: floors, technologists, orders-late
 */
async function exportCsv(req, res, next) {
  try {
    const { type, workshop_id, from, to } = req.query;
    const validTypes = ['floors', 'technologists', 'sewers', 'orders-late', 'plan-fact'];
    if (!validTypes.includes(type) || !workshop_id || !from || !to) {
      return res.status(400).json({ error: 'Укажите type (floors|technologists|sewers|orders-late|plan-fact), workshop_id, from, to' });
    }

    let rows = [];
    const mockNext = (err) => {
      if (err) throw err;
    };
    if (type === 'plan-fact') {
      const mockReq = { query: { workshop_id, from, to } };
      const mockRes = { json: (data) => { rows = data; } };
      await getPlanFact(mockReq, mockRes, mockNext);
    } else if (type === 'floors') {
      const mockReq = { query: { workshop_id, from, to } };
      const mockRes = { json: (data) => { rows = data; } };
      await getFloors(mockReq, mockRes, mockNext);
    } else if (type === 'technologists') {
      const mockReq = { query: { workshop_id, from, to } };
      const mockRes = { json: (data) => { rows = data; } };
      await getTechnologists(mockReq, mockRes, mockNext);
    } else if (type === 'sewers') {
      const mockReq = { query: { workshop_id, from, to } };
      const mockRes = { json: (data) => { rows = data; } };
      await getSewers(mockReq, mockRes, mockNext);
    } else if (type === 'orders-late') {
      const mockReq = { query: { workshop_id, from, to } };
      const mockRes = { json: (data) => { rows = data; } };
      await getOrdersLate(mockReq, mockRes, mockNext);
    }

    const csvHeaders =
      type === 'plan-fact'
        ? ['date', 'planned_sum', 'actual_sum']
        : type === 'floors'
          ? ['floor_id', 'floor_name', 'planned_sum', 'actual_sum', 'completion_percent']
          : type === 'technologists'
            ? ['technologist_id', 'name', 'planned_sum', 'actual_sum', 'completion_percent']
            : type === 'sewers'
              ? ['sewer_id', 'name', 'planned_sum', 'actual_sum', 'completion_percent']
              : ['order_id', 'client_name', 'order_title', 'deadline', 'planned_sum', 'actual_sum', 'delay_qty'];

    const escape = (v) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csvLines = [
      csvHeaders.join(','),
      ...(rows || []).map((r) =>
        csvHeaders.map((h) => escape(r[h])).join(',')
      ),
    ];
    const csv = '\uFEFF' + csvLines.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="report-${type}-${from}-${to}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getKpi,
  getFloors,
  getTechnologists,
  getSewers,
  getOrdersLate,
  getPlanFact,
  exportCsv,
};
