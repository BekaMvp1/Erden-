/**
 * Роуты планирования
 * GET /floors?workshop_id= — этажи по цеху
 * GET /table?workshop_id=&from=&to=&floor_id= — таблица плана (Excel-подобная)
 * PUT /day — обновление плана/факта по дню
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { logAudit } = require('../utils/audit');
const flowCalculatorController = require('../controllers/flowCalculatorController');
const { WORKING_DAYS_PER_WEEK, getWorkingDaysInRange, getWeekStart } = require('../utils/planningUtils');
const { syncWeeklyCacheFromDaily, checkWeeklyIntegrity, recalculateCarry } = require('../utils/planningSync');

const router = express.Router();

// ========== Калькулятор параметров потока ==========
router.post('/flow/calc', flowCalculatorController.calc);
router.post('/flow/apply-auto', flowCalculatorController.applyAuto);

// ========== Планирование по дням (таблица Excel) ==========

/**
 * GET /api/planning/floors?workshop_id=
 * Этажи для цеха: floors_count=1 → пусто или единственный, floors_count=4 → этажи 1..4
 */
router.get('/floors', async (req, res, next) => {
  try {
    const workshopId = req.query.workshop_id;
    if (!workshopId) return res.status(400).json({ error: 'Укажите workshop_id' });

    const workshop = await db.Workshop.findByPk(workshopId);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });

    if (workshop.floors_count === 1) {
      // Аутсорс, Аксы — один этаж, выбор этажа скрыт
      return res.json([]);
    }

    // Наш цех — 4 этажа
    const floors = await db.BuildingFloor.findAll({
      where: { id: { [Op.between]: [1, 4] } },
      order: [['id']],
      attributes: ['id', 'name'],
    });
    res.json(floors);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/planning/plan?order_id=&floor_id=&date_from=&date_to=
 * Единый API плана по периоду: дневные строки из production_plan_day (план) и sewing_fact (факт).
 * Возвращает: [{ date: 'YYYY-MM-DD', planned_qty: number, fact_qty: number }]
 */
router.get('/plan', async (req, res, next) => {
  try {
    const { order_id, floor_id, date_from, date_to } = req.query;
    if (!order_id || floor_id == null || floor_id === '') {
      return res.status(400).json({ error: 'Укажите order_id и floor_id' });
    }
    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'Укажите date_from и date_to' });
    }
    const fromStr = String(date_from).slice(0, 10);
    const toStr = String(date_to).slice(0, 10);
    if (fromStr > toStr) {
      return res.status(400).json({ error: 'date_from не должен быть больше date_to' });
    }

    const oid = Number(order_id);
    const fid = Number(floor_id);

    const planRows = await db.sequelize.query(
      `SELECT date::text AS date, COALESCE(SUM(planned_qty), 0)::int AS planned_qty
       FROM production_plan_day
       WHERE order_id = :oid
         AND ((:fid IS NULL AND floor_id IS NULL) OR floor_id = :fid)
         AND date >= :fromStr AND date <= :toStr
       GROUP BY date
       ORDER BY date`,
      { replacements: { oid, fid: fid || null, fromStr, toStr }, type: db.sequelize.QueryTypes.SELECT }
    );
    let factRows = [];
    if (fid != null && fid !== '' && Number(fid) >= 1 && Number(fid) <= 4) {
      factRows = await db.sequelize.query(
        `SELECT date::text AS date, COALESCE(SUM(fact_qty), 0)::int AS fact_qty
         FROM sewing_fact
         WHERE order_id = :oid AND floor_id = :fid
           AND date >= :fromStr AND date <= :toStr
         GROUP BY date
         ORDER BY date`,
        { replacements: { oid, fid: Number(fid), fromStr, toStr }, type: db.sequelize.QueryTypes.SELECT }
      );
      if (!Array.isArray(factRows)) factRows = [];
    }

    const planByDate = {};
    (planRows || []).forEach((r) => { planByDate[r.date] = Number(r.planned_qty) || 0; });
    const factByDate = {};
    (factRows || []).forEach((r) => { factByDate[r.date] = Number(r.fact_qty) || 0; });

    const dates = [];
    const d = new Date(fromStr + 'T12:00:00');
    const end = new Date(toStr + 'T12:00:00');
    while (d <= end) {
      const dateKey = d.toISOString().slice(0, 10);
      dates.push({
        date: dateKey,
        planned_qty: planByDate[dateKey] ?? 0,
        fact_qty: factByDate[dateKey] ?? 0,
      });
      d.setDate(d.getDate() + 1);
    }
    res.json(dates);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/planning/plan-day
 * body: { order_id, floor_id, date, planned_qty, actual_qty? }
 * Upsert в production_plan_day (план и факт по дням).
 */
router.put('/plan-day', async (req, res, next) => {
  try {
    if (req.user?.role === 'operator') {
      return res.status(403).json({ error: 'Оператор не может редактировать план' });
    }
    const { order_id, floor_id, date, planned_qty, actual_qty } = req.body;
    if (!order_id || !date) {
      return res.status(400).json({ error: 'Укажите order_id и date' });
    }
    const order = await db.Order.findByPk(Number(order_id), { attributes: ['id', 'workshop_id'] });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    const workshop_id = order.workshop_id;
    if (!workshop_id) return res.status(400).json({ error: 'У заказа не указан цех' });
    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });

    let effectiveFloorId = null;
    if (workshop.floors_count === 4 && floor_id != null && floor_id !== '' && floor_id !== 'all') {
      effectiveFloorId = Number(floor_id);
      if (effectiveFloorId < 1 || effectiveFloorId > 4) {
        return res.status(400).json({ error: 'floor_id должен быть от 1 до 4' });
      }
    }

    const dateStr = String(date).slice(0, 10);
    const period = await requireActivePeriodForDate(db, dateStr);
    const planned = Math.max(0, parseInt(planned_qty, 10) || 0);
    const actual = actual_qty != null ? Math.max(0, parseInt(actual_qty, 10) || 0) : null;

    const [row, created] = await db.ProductionPlanDay.findOrCreate({
      where: {
        period_id: period.id,
        order_id: Number(order_id),
        date: dateStr,
        workshop_id: Number(workshop_id),
        floor_id: effectiveFloorId,
      },
      defaults: { planned_qty: planned, actual_qty: actual != null ? actual : 0 },
    });
    if (!created) {
      const upd = { planned_qty: planned };
      if (actual != null) upd.actual_qty = actual;
      await row.update(upd);
    }

    await syncWeeklyCacheFromDaily(db, Number(workshop_id), effectiveFloorId, Number(order_id), [dateStr], period.id);
    await recalculateCarry(db, Number(workshop_id), effectiveFloorId, period.id);

    res.json(row);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/planning/table?workshop_id=&from=&to=&floor_id=&period_id=
 * Таблица плана: заказчик, модель, даты, план, факт, итого. period_id опционален (фильтр по периоду).
 */
router.get('/table', async (req, res, next) => {
  try {
    const { workshop_id, from, to, floor_id, period_id } = req.query;
    if (!workshop_id) return res.status(400).json({ error: 'Укажите workshop_id' });
    if (!from || !to) return res.status(400).json({ error: 'Укажите from и to' });

    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });

    const planWhere = {
      workshop_id: Number(workshop_id),
      date: { [Op.between]: [from, to] },
    };
    if (period_id) planWhere.period_id = Number(period_id);
    if (workshop.floors_count === 4 && floor_id && floor_id !== 'all') {
      planWhere.floor_id = Number(floor_id);
    } else if (workshop.floors_count === 1) {
      planWhere.floor_id = null;
    }

    // Заказы цеха (для отображения даже без плана)
    const orders = await db.Order.findAll({
      where: { workshop_id: Number(workshop_id) },
      include: [{ model: db.Client, as: 'Client' }],
      order: [
        [db.Client, 'name', 'ASC'],
        ['title', 'ASC'],
      ],
    });

    const planDays = await db.ProductionPlanDay.findAll({
      where: planWhere,
      include: [
        {
          model: db.Order,
          as: 'Order',
          include: [{ model: db.Client, as: 'Client' }],
        },
      ],
    });

    // Собираем уникальные даты периода
    const dates = [];
    const d = new Date(from);
    const end = new Date(to);
    while (d <= end) {
      dates.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }

    // Инициализируем строки по заказам
    const byOrder = new Map();
    for (const o of orders) {
      byOrder.set(String(o.id), {
        order_id: o.id,
        client_name: o.Client?.name || '—',
        order_title: o.title || '—',
        days: [],
        total_planned: 0,
        total_actual: 0,
      });
    }

    // Заполняем из плана
    for (const pd of planDays) {
      const o = pd.Order;
      if (!o) continue;
      const row = byOrder.get(String(o.id));
      if (!row) continue;
      const dayIdx = dates.indexOf(pd.date);
      if (dayIdx >= 0) {
        const existing = row.days[dayIdx];
        if (existing) {
          existing.planned_qty = (existing.planned_qty || 0) + (pd.planned_qty || 0);
          existing.actual_qty = (existing.actual_qty || 0) + (pd.actual_qty || 0);
        } else {
          row.days[dayIdx] = {
            date: dates[dayIdx],
            planned_qty: pd.planned_qty || 0,
            actual_qty: pd.actual_qty || 0,
          };
        }
      }
      row.total_planned += pd.planned_qty || 0;
      row.total_actual += pd.actual_qty || 0;
    }

    // Заполняем пустые дни для каждой строки
    const rows = [];
    for (const [, r] of byOrder) {
      const days = dates.map((d) => {
        const found = r.days.find((x) => x && x.date === d);
        return found || { date: d, planned_qty: 0, actual_qty: 0 };
      });
      rows.push({
        ...r,
        days,
      });
    }

    // Сортировка: client_name → order_title
    rows.sort((a, b) => {
      const c = (a.client_name || '').localeCompare(b.client_name || '');
      if (c !== 0) return c;
      return (a.order_title || '').localeCompare(b.order_title || '');
    });

    let planned_sum = 0;
    let actual_sum = 0;
    for (const r of rows) {
      planned_sum += r.total_planned;
      actual_sum += r.total_actual;
    }

    res.json({
      workshop: { id: workshop.id, name: workshop.name, floors_count: workshop.floors_count },
      period: { from, to },
      rows,
      totals: { planned_sum, actual_sum },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/planning/model-table?workshop_id=&order_id=&from=&to=&floor_id=&period_id=
 * Таблица плана по выбранной модели (заказу): даты, план, факт, итого.
 */
router.get('/model-table', async (req, res, next) => {
  try {
    const { workshop_id, order_id, from, to, floor_id, period_id } = req.query;
    if (!workshop_id || !order_id || !from || !to) {
      return res.status(400).json({ error: 'Укажите workshop_id, order_id, from, to' });
    }
    if (from > to) {
      return res.status(400).json({ error: 'Дата начала не может быть позже даты окончания' });
    }

    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });

    const order = await db.Order.findByPk(order_id, {
      include: [{ model: db.Client, as: 'Client' }],
    });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    if (Number(order.workshop_id) !== Number(workshop_id)) {
      return res.status(400).json({ error: 'Заказ не принадлежит выбранному цеху' });
    }

    const planWhere = {
      workshop_id: Number(workshop_id),
      order_id: Number(order_id),
      date: { [Op.between]: [from, to] },
    };
    if (period_id) planWhere.period_id = Number(period_id);
    let floorInfo = null;
    if (workshop.floors_count === 4) {
      const fid = floor_id && floor_id !== 'all' ? Number(floor_id) : null;
      if (!fid || fid < 1 || fid > 4) {
        return res.status(400).json({ error: 'Для цеха «Наш цех» выберите этаж (1–4)' });
      }
      planWhere.floor_id = fid;
      const bf = await db.BuildingFloor.findByPk(fid);
      floorInfo = bf ? { id: bf.id, name: bf.name } : { id: fid, name: `Этаж ${fid}` };
    } else {
      planWhere.floor_id = null;
    }

    const planDays = await db.ProductionPlanDay.findAll({
      where: planWhere,
      order: [['date', 'ASC']],
    });

    const dates = [];
    const d = new Date(from);
    const end = new Date(to);
    while (d <= end) {
      dates.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }

    const byDate = new Map();
    for (const pd of planDays) {
      byDate.set(pd.date, {
        date: pd.date,
        planned_qty: pd.planned_qty || 0,
        actual_qty: pd.actual_qty || 0,
        notes: pd.notes || null,
      });
    }

    const rows = dates.map((date) => {
      const existing = byDate.get(date);
      return existing || { date, planned_qty: 0, actual_qty: 0, notes: null };
    });

    let planned_sum = 0;
    let actual_sum = 0;
    for (const r of rows) {
      planned_sum += r.planned_qty;
      actual_sum += r.actual_qty;
    }

    res.json({
      workshop: { id: workshop.id, name: workshop.name, floors_count: workshop.floors_count },
      order: { id: order.id, title: order.title, client_name: order.Client?.name || '—' },
      period: { from, to },
      floor: floorInfo,
      rows,
      totals: { planned_sum, actual_sum },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/planning/day
 * Создание/обновление строки плана по дню
 */
router.put('/day', async (req, res, next) => {
  try {
    if (req.user.role === 'operator') {
      return res.status(403).json({ error: 'Оператор не может редактировать план' });
    }

    const { order_id, workshop_id, date, floor_id, planned_qty, actual_qty, notes } = req.body;
    if (!order_id || !workshop_id || !date) {
      return res.status(400).json({ error: 'Укажите order_id, workshop_id, date' });
    }

    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });

    let effectiveFloorId = null;
    if (workshop.floors_count === 4) {
      if (floor_id == null || floor_id === '' || floor_id === 'all') {
        return res.status(400).json({ error: 'Для цеха «Наш цех» укажите floor_id (1–4)' });
      }
      const fid = Number(floor_id);
      if (fid < 1 || fid > 4) {
        return res.status(400).json({ error: 'floor_id должен быть от 1 до 4' });
      }
      effectiveFloorId = fid;
    } else {
      effectiveFloorId = null; // Игнорируем переданный floor_id
    }

    const dateStr = String(date).slice(0, 10);
    const period = await requireActivePeriodForDate(db, dateStr);

    const planned = Math.max(0, parseInt(planned_qty, 10) || 0);
    const actual = actual_qty != null ? Math.max(0, parseInt(actual_qty, 10) || 0) : null;
    const notesVal = typeof notes === 'string' ? notes.trim() || null : null;

    const [row, created] = await db.ProductionPlanDay.findOrCreate({
      where: {
        period_id: period.id,
        order_id: Number(order_id),
        date: dateStr,
        workshop_id: Number(workshop_id),
        floor_id: effectiveFloorId,
      },
      defaults: {
        planned_qty: planned,
        actual_qty: actual != null ? actual : 0,
        notes: notesVal,
      },
    });

    if (!created) {
      const updatePayload = { planned_qty: planned, notes: notesVal };
      if (actual != null) updatePayload.actual_qty = actual;
      await row.update(updatePayload);
    }

    await syncWeeklyCacheFromDaily(db, Number(workshop_id), effectiveFloorId, Number(order_id), [dateStr], period.id);
    await recalculateCarry(db, Number(workshop_id), effectiveFloorId, period.id);

    res.json(row);
  } catch (err) {
    next(err);
  }
});

/** PUT /api/planning/daily — body: { floor_id, row_key, date, qty, planned_qty?, actual_qty?, notes? } */
router.put('/daily', async (req, res, next) => {
  const body = { ...req.body };
  if (body.row_key != null) body.order_id = body.row_key;
  if (body.qty != null) body.planned_qty = body.qty;
  try {
    if (req.user?.role === 'operator') return res.status(403).json({ error: 'Оператор не может редактировать план' });
    let { order_id, workshop_id, date, floor_id, planned_qty, actual_qty, notes } = body;
    if (order_id && !workshop_id) {
      const ord = await db.Order.findByPk(order_id);
      if (ord) workshop_id = ord.workshop_id;
    }
    if (!order_id || !workshop_id || !date) return res.status(400).json({ error: 'Укажите order_id (row_key), date и workshop_id (или row_key для заказа)' });
    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });
    let effectiveFloorId = workshop.floors_count === 4 && floor_id != null && floor_id !== 'all' ? Number(floor_id) : null;
    const dateStr = String(date).slice(0, 10);
    const period = await requireActivePeriodForDate(db, dateStr);
    const planned = Math.max(0, parseInt(planned_qty, 10) || 0);
    const actual = Math.max(0, parseInt(actual_qty, 10) || 0);
    const notesVal = typeof notes === 'string' ? notes.trim() || null : null;
    const [row, created] = await db.ProductionPlanDay.findOrCreate({
      where: { period_id: period.id, order_id: Number(order_id), date: dateStr, workshop_id: Number(workshop_id), floor_id: effectiveFloorId },
      defaults: { planned_qty: planned, actual_qty: actual, notes: notesVal },
    });
    if (!created) await row.update({ planned_qty: planned, actual_qty: actual, notes: notesVal });
    await syncWeeklyCacheFromDaily(db, Number(workshop_id), effectiveFloorId, Number(order_id), [dateStr], period.id);
    await recalculateCarry(db, Number(workshop_id), effectiveFloorId, period.id);
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// ========== Мощность ==========

/**
 * PUT /api/planning/capacity
 * Сохранение мощности на неделю для этажа
 */
router.put('/capacity', async (req, res, next) => {
  try {
    if (req.user?.role === 'operator') {
      return res.status(403).json({ error: 'Оператор не может редактировать мощность' });
    }
    const { workshop_id, floor_id, week_start, capacity_week } = req.body;
    if (!workshop_id || !week_start) {
      return res.status(400).json({ error: 'Укажите workshop_id, week_start' });
    }
    const cap = Math.max(0, parseFloat(capacity_week) || 0);
    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });
    const floorId = workshop.floors_count === 4 && floor_id != null && floor_id !== ''
      ? Number(floor_id)
      : null;

    const [row] = await db.WeeklyCapacity.findOrCreate({
      where: {
        workshop_id: Number(workshop_id),
        building_floor_id: floorId,
        week_start: String(week_start).slice(0, 10),
      },
      defaults: { capacity_week: cap },
    });
    await row.update({ capacity_week: cap });
    res.json({ ok: true, capacity_week: cap });
  } catch (err) {
    next(err);
  }
});

// ========== Периоды планирования (месяцы) ==========

/**
 * Найти или создать период по году и месяцу.
 * При создании: перенос остатка (carry) из прошлого периода в первую неделю нового.
 */
async function getOrCreatePeriodForMonth(db, year, month, transaction = null) {
  const opts = transaction ? { transaction } : {};
  let period = await db.PlanningPeriod.findOne({
    where: { year, month },
    ...opts,
  });
  if (period) return { period, created: false };

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  period = await db.PlanningPeriod.create(
    { year, month, start_date: startDate, end_date: endDate, status: 'ACTIVE' },
    opts
  );

  const prev = await db.PlanningPeriod.findOne({
    where: { start_date: { [Op.lt]: startDate } },
    order: [['start_date', 'DESC']],
    ...opts,
  });
  if (!prev) return { period, created: true };

  const prevPlanDays = await db.ProductionPlanDay.findAll({
    where: {
      period_id: prev.id,
      date: { [Op.between]: [prev.start_date, prev.end_date] },
    },
    attributes: ['order_id', 'floor_id', 'workshop_id', 'planned_qty', 'actual_qty'],
    ...opts,
  });
  const byOrderFloor = {};
  for (const r of prevPlanDays) {
    const key = `${r.order_id}_${r.floor_id ?? 0}`;
    if (!byOrderFloor[key]) byOrderFloor[key] = { order_id: r.order_id, floor_id: r.floor_id, workshop_id: r.workshop_id, planned: 0, fact: 0 };
    byOrderFloor[key].planned += r.planned_qty || 0;
    byOrderFloor[key].fact += r.actual_qty || 0;
  }

  const firstWeekStart = getWeekStart(startDate);
  for (const key of Object.keys(byOrderFloor)) {
    const row = byOrderFloor[key];
    const carry = Math.max(0, row.planned - row.fact);
    if (carry <= 0) continue;
    const [rec] = await db.WeeklyCarry.findOrCreate({
      where: {
        period_id: period.id,
        workshop_id: row.workshop_id,
        building_floor_id: row.floor_id,
        week_start: firstWeekStart,
        row_key: row.order_id,
      },
      defaults: { carry_qty: carry },
      ...opts,
    });
    if (rec) await rec.update({ carry_qty: carry }, opts);
  }
  return { period, created: true };
}

/** GET /api/planning/periods — список периодов для переключателя месяцев */
router.get('/periods', async (req, res, next) => {
  try {
    const periods = await db.PlanningPeriod.findAll({
      order: [['year', 'ASC'], ['month', 'ASC']],
      attributes: ['id', 'year', 'month', 'start_date', 'end_date', 'status', 'created_at'],
    });
    res.json(periods);
  } catch (err) {
    next(err);
  }
});

/** POST /api/planning/periods/close — закрыть период. body: { period_id } или query period_id */
router.post('/periods/close', async (req, res, next) => {
  try {
    if (req.user?.role === 'operator') return res.status(403).json({ error: 'Оператор не может закрывать период' });
    const periodId = req.body.period_id ?? req.query.period_id;
    if (!periodId) return res.status(400).json({ error: 'Укажите period_id' });
    const period = await db.PlanningPeriod.findByPk(periodId);
    if (!period) return res.status(404).json({ error: 'Период не найден' });
    await period.update({ status: 'CLOSED' });
    res.json({ ok: true, period: { id: period.id, status: period.status } });
  } catch (err) {
    next(err);
  }
});

/** Получить период по дате; если период закрыт — бросить ошибку (для редактирования). */
async function requireActivePeriodForDate(db, dateStr) {
  const [y, m] = dateStr.slice(0, 10).split('-').map(Number);
  const result = await getOrCreatePeriodForMonth(db, y, m);
  if (result.period.status !== 'ACTIVE') {
    const err = new Error('Период закрыт, редактирование недоступно');
    err.status = 403;
    err.code = 'PERIOD_CLOSED';
    throw err;
  }
  return result.period;
}

// ========== Недельное планирование ==========

/**
 * Возвращает список недель месяца (week_start, week_end)
 * Неделя = понедельник..воскресенье. Включаем все недели, пересекающиеся с месяцем.
 */
function getWeeksOfMonth(year, month) {
  const weeks = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  let d = new Date(firstDay);
  const dayOfWeek = d.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diffToMonday);
  while (d <= lastDay) {
    const weekEnd = new Date(d);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weeks.push({
      week_start: d.toISOString().slice(0, 10),
      week_end: weekEnd.toISOString().slice(0, 10),
    });
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}

/**
 * GET /api/planning?period_id= или ?month=YYYY-MM&workshop_id=&floor_id=
 * Алиас: те же параметры, что и /weekly.
 */
router.get('/', (req, res, next) => {
  req.url = '/weekly';
  return router.handle(req, res, next);
});

/**
 * GET /api/planning/weekly?period_id= или ?month=YYYY-MM&workshop_id=&floor_id=
 * Недельное планирование по периоду. period_id приоритетнее; иначе по month создаётся/находится период.
 */
router.get('/weekly', async (req, res, next) => {
  try {
    const { period_id, month, workshop_id, floor_id, q } = req.query;
    const searchQ = (q || '').trim().toLowerCase();
    if (!workshop_id) {
      return res.status(400).json({ error: 'Укажите workshop_id и period_id или month (YYYY-MM)' });
    }

    let period;
    if (period_id) {
      period = await db.PlanningPeriod.findByPk(period_id);
      if (!period) return res.status(404).json({ error: 'Период не найден' });
    } else if (month) {
      const [y, m] = month.split('-').map(Number);
      if (!y || !m || m < 1 || m > 12) return res.status(400).json({ error: 'Некорректный месяц' });
      const result = await getOrCreatePeriodForMonth(db, y, m);
      period = result.period;
    } else {
      return res.status(400).json({ error: 'Укажите period_id или month' });
    }

    const y = period.year;
    const m = period.month;
    const monthStr = `${y}-${String(m).padStart(2, '0')}`;
    const firstDay = period.start_date;
    const lastDate = period.end_date;

    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });

    let effectiveFloorId = null;
    if (workshop.floors_count === 4) {
      if (floor_id && floor_id !== 'all') {
        const fid = Number(floor_id);
        if (fid >= 1 && fid <= 4) effectiveFloorId = fid;
      }
      if (effectiveFloorId == null) {
        return res.status(400).json({ error: 'Для цеха «Наш цех» выберите этаж (floor_id 1–4)' });
      }
    }

    const weeks = getWeeksOfMonth(y, m);

    const ordersWhere = { workshop_id: Number(workshop_id) };
    if (effectiveFloorId != null) {
      ordersWhere[Op.or] = [
        { building_floor_id: effectiveFloorId },
        { building_floor_id: null },
      ];
    }
    let orders = await db.Order.findAll({
      where: ordersWhere,
      attributes: ['id', 'title', 'tz_code', 'model_name', 'article', 'quantity', 'total_quantity', 'deadline'],
      include: [{ model: db.Client, as: 'Client' }],
      order: [[db.Client, 'name', 'ASC'], ['title', 'ASC']],
    });
    if (searchQ) {
      orders = orders.filter((o) => {
        const clientName = (o.Client?.name || '').toLowerCase();
        const title = (o.title || '').toLowerCase();
        const modelName = (o.model_name || '').toLowerCase();
        const article = (o.article || '').toLowerCase();
        const tzCode = (o.tz_code || '').toLowerCase();
        return (
          clientName.includes(searchQ) ||
          title.includes(searchQ) ||
          modelName.includes(searchQ) ||
          article.includes(searchQ) ||
          tzCode.includes(searchQ) ||
          String(o.id).includes(searchQ)
        );
      });
    }
    const rowKeys = orders.map((o) => o.id);

    const capacityWhere = {
      workshop_id: Number(workshop_id),
      week_start: { [Op.in]: weeks.map((w) => w.week_start) },
    };
    capacityWhere.building_floor_id = effectiveFloorId;
    const capacities = await db.WeeklyCapacity.findAll({ where: capacityWhere });
    const capacityByWeek = {};
    for (const c of capacities) {
      capacityByWeek[c.week_start] = parseFloat(c.capacity_week) || 0;
    }

    const planDayWhere = {
      period_id: period.id,
      workshop_id: Number(workshop_id),
      order_id: { [Op.in]: rowKeys },
      date: { [Op.between]: [firstDay, lastDate] },
    };
    planDayWhere.floor_id = effectiveFloorId;
    const planDays = await db.ProductionPlanDay.findAll({
      where: planDayWhere,
      attributes: ['order_id', 'date', 'planned_qty', 'actual_qty'],
    });

    await recalculateCarry(db, Number(workshop_id), effectiveFloorId, period.id);

    // План (manual) и факт по (order_id, week_start): агрегация из daily
    const manualByOrderWeek = {};
    const factByOrderWeek = {};
    for (const w of weeks) {
      const wStart = new Date(w.week_start + 'T12:00:00');
      const wEnd = new Date(w.week_end + 'T12:00:00');
      for (const oid of rowKeys) {
        let planSum = 0;
        let factSum = 0;
        for (const pd of planDays) {
          if (pd.order_id !== oid) continue;
          const d = new Date(pd.date + 'T12:00:00');
          if (d >= wStart && d <= wEnd) {
            planSum += pd.planned_qty || 0;
            factSum += pd.actual_qty || 0;
          }
        }
        const pk = `${oid}_${w.week_start}`;
        manualByOrderWeek[pk] = planSum;
        factByOrderWeek[pk] = factSum;
      }
    }

    const carryRows = await db.WeeklyCarry.findAll({
      where: {
        period_id: period.id,
        workshop_id: Number(workshop_id),
        building_floor_id: effectiveFloorId,
        row_key: { [Op.in]: rowKeys },
        week_start: { [Op.in]: weeks.map((w) => w.week_start) },
      },
    });
    const carryByKey = {};
    for (const c of carryRows) {
      carryByKey[`${c.row_key}_${c.week_start}`] = parseFloat(c.carry_qty) || 0;
    }

    // Собираем rows: manual_week, carry_week, total_week, fact_week
    const byCustomer = new Map();
    for (const order of orders) {
      const cname = order.Client?.name || '—';
      if (!byCustomer.has(cname)) {
        byCustomer.set(cname, []);
      }
      const items = [];
      for (const w of weeks) {
        const pk = `${order.id}_${w.week_start}`;
        const manual_week = manualByOrderWeek[pk] || 0;
        const carry_week = carryByKey[pk] || 0;
        const total_week = manual_week + carry_week;
        const fact_qty = factByOrderWeek[pk] || 0;
        const remainder = Math.max(0, total_week - fact_qty);
        items.push({
          week_start: w.week_start,
          week_end: w.week_end,
          planned_manual: manual_week,
          planned_carry: carry_week,
          planned_total: total_week,
          fact_qty,
          remainder,
          manual_week,
          carry_week,
          total_week,
          fact_week: fact_qty,
        });
      }
      const month_plan = items.reduce((s, x) => s + x.planned_total, 0);
      const month_fact = items.reduce((s, x) => s + x.fact_qty, 0);
      const total_qty = order.total_quantity ?? order.quantity ?? 0;
      const remainder = Math.max(0, total_qty - month_plan);
      byCustomer.get(cname).push({
        order_id: order.id,
        order_title: order.title,
        model_name: order.model_name || order.title,
        article: order.article || '',
        tz_code: order.tz_code || '',
        total_quantity: total_qty,
        remainder,
        items,
        month_plan,
        month_fact,
      });
    }

    const rows = [];
    for (const [customer_name, ordersList] of byCustomer.entries()) {
      const customer_plan = ordersList.reduce((s, o) => s + o.month_plan, 0);
      const customer_fact = ordersList.reduce((s, o) => s + o.month_fact, 0);
      rows.push({
        customer_name,
        orders: ordersList,
        customer_plan,
        customer_fact,
      });
    }

    // Итоги по неделям: load_plan, load_fact, capacity, free_capacity, overload
    const factByWeek = {};
    for (const w of weeks) {
      let fact_week = 0;
      for (const order of orders) {
        const pk = `${order.id}_${w.week_start}`;
        fact_week += factByOrderWeek[pk] || 0;
      }
      factByWeek[w.week_start] = fact_week;
    }
    const weekTotals = weeks.map((w) => {
      let load_week = 0;
      for (const order of orders) {
        const pk = `${order.id}_${w.week_start}`;
        const manual_week = manualByOrderWeek[pk] || 0;
        const carry_week = carryByKey[pk] || 0;
        load_week += manual_week + carry_week;
      }
      const capacity_week = capacityByWeek[w.week_start] || 0;
      const load_fact = factByWeek[w.week_start] || 0;
      const free_capacity = Math.max(0, capacity_week - load_week);
      const overload = Math.max(0, load_week - (capacity_week || Infinity));
      const utilization = capacity_week > 0 ? (load_week / capacity_week) * 100 : 0;
      return {
        week_start: w.week_start,
        week_end: w.week_end,
        load_week,
        load_fact,
        capacity_week,
        free_capacity,
        overload,
        utilization: Math.round(utilization * 10) / 10,
      };
    });

    const month_plan = rows.reduce((s, r) => s + r.customer_plan, 0);
    const month_fact = rows.reduce((s, r) => s + r.customer_fact, 0);
    const load_month = weekTotals.reduce((s, w) => s + w.load_week, 0);

    res.json({
      workshop: { id: workshop.id, name: workshop.name, floors_count: workshop.floors_count },
      floor_id: effectiveFloorId,
      period: { id: period.id, year: period.year, month: period.month, start_date: period.start_date, end_date: period.end_date, status: period.status },
      month: monthStr,
      weeks,
      week_totals: weekTotals,
      rows,
      totals: {
        month_plan,
        month_fact,
        load_month,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/planning/weekly/manual
 * Изменение недели обновляет daily_plan (распределение по рабочим дням недели)
 */
router.put('/weekly/manual', async (req, res, next) => {
  try {
    if (req.user?.role === 'operator') {
      return res.status(403).json({ error: 'Оператор не может редактировать план' });
    }
    const { workshop_id, building_floor_id, week_start, row_key, planned_manual } = req.body;
    if (!workshop_id || !week_start || !row_key) {
      return res.status(400).json({ error: 'Укажите workshop_id, week_start, row_key' });
    }

    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });

    const floorId = workshop.floors_count === 4 && building_floor_id != null && building_floor_id !== ''
      ? Number(building_floor_id)
      : null;
    const totalForWeek = Math.max(0, Math.round(parseFloat(planned_manual) || 0));

    const wStart = String(week_start).slice(0, 10);
    const wEndDate = new Date(wStart + 'T12:00:00');
    wEndDate.setDate(wEndDate.getDate() + 6);
    const wEnd = wEndDate.toISOString().slice(0, 10);

    const workingDays = getWorkingDaysInRange(wStart, wEnd);
    if (workingDays.length === 0) {
      return res.status(400).json({ error: 'В выбранной неделе нет рабочих дней' });
    }

    const period = await requireActivePeriodForDate(db, wStart);

    const base = Math.floor(totalForWeek / workingDays.length);
    const rest = totalForWeek % workingDays.length;
    const dailyPlans = workingDays.map((d, i) => ({
      date: d,
      planned_qty: base + (i < rest ? 1 : 0),
    }));

    const t = await db.sequelize.transaction();
    try {
      for (const { date, planned_qty } of dailyPlans) {
        const [row] = await db.ProductionPlanDay.findOrCreate({
          where: {
            period_id: period.id,
            order_id: Number(row_key),
            workshop_id: Number(workshop_id),
            floor_id: floorId,
            date,
          },
          defaults: { planned_qty, actual_qty: 0 },
          transaction: t,
        });
        if (row) await row.update({ planned_qty }, { transaction: t });
      }
      await syncWeeklyCacheFromDaily(db, Number(workshop_id), floorId, Number(row_key), workingDays, period.id, t);
      await recalculateCarry(db, Number(workshop_id), floorId, period.id, t);
      await t.commit();
      res.json({ ok: true, message: 'План сохранён' });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/planning/cutting-summary?order_id=
 * План и факт по раскрою для заказа — приходит в Планирование из Раскроя
 */
router.get('/cutting-summary', async (req, res, next) => {
  try {
    const { order_id } = req.query;
    if (!order_id) return res.status(400).json({ error: 'Укажите order_id' });

    const order = await db.Order.findByPk(order_id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    const totalQuantity = order.total_quantity ?? order.quantity ?? 0;
    const cuttingTasks = await db.CuttingTask.findAll({
      where: { order_id: Number(order_id) },
      attributes: ['actual_variants'],
    });
    let cuttingPlannedTotal = 0;
    let cuttingActualTotal = 0;
    for (const t of cuttingTasks) {
      const variants = t.actual_variants || [];
      for (const v of variants) {
        cuttingPlannedTotal += parseInt(v.quantity_planned, 10) || 0;
        cuttingActualTotal += parseInt(v.quantity_actual, 10) || 0;
      }
    }
    if (cuttingPlannedTotal === 0) cuttingPlannedTotal = totalQuantity;

    res.json({
      total_quantity: totalQuantity,
      cutting_planned_total: cuttingPlannedTotal,
      cutting_actual_total: cuttingActualTotal,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/planning/calc-capacity
 * Автоплан: распределение remainder по дням с учётом existing_load и free_capacity.
 * proposed_day = min(remainder_qty, free_capacity_day); если мощность не хватает — остаток, без фейковых чисел.
 */
router.post('/calc-capacity', async (req, res, next) => {
  try {
    const { workshop_id, order_id, from, to, floor_id, capacity_week } = req.body;
    if (!workshop_id || !order_id || !from || !to) {
      return res.status(400).json({ error: 'Укажите workshop_id, order_id, from, to' });
    }
    if (from > to) {
      return res.status(400).json({ error: 'Дата начала не может быть позже даты окончания' });
    }

    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });

    const order = await db.Order.findByPk(order_id, {
      include: [{ model: db.Client, as: 'Client' }],
    });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    if (Number(order.workshop_id) !== Number(workshop_id)) {
      return res.status(400).json({ error: 'Заказ не принадлежит выбранному цеху' });
    }

    let effectiveFloorId = null;
    if (workshop.floors_count === 4) {
      if (floor_id == null || floor_id === '' || floor_id === 'all') {
        return res.status(400).json({ error: 'Для цеха «Наш цех» выберите этаж (1–4)' });
      }
      const fid = Number(floor_id);
      if (fid < 1 || fid > 4) {
        return res.status(400).json({ error: 'floor_id должен быть от 1 до 4' });
      }
      effectiveFloorId = fid;
    }

    // Мощность: из параметра или из БД (weekly_capacity)
    let capacityWeekNum = capacity_week != null && capacity_week !== '' ? parseInt(capacity_week, 10) : null;
    if (capacityWeekNum == null || capacityWeekNum <= 0) {
      const weekStart = getWeekStart(from);
      const capRow = await db.WeeklyCapacity.findOne({
        where: {
          workshop_id: Number(workshop_id),
          building_floor_id: effectiveFloorId,
          week_start: weekStart,
        },
      });
      capacityWeekNum = capRow ? parseFloat(capRow.capacity_week) || 0 : 0;
    }
    if (capacityWeekNum <= 0) {
      return res.status(400).json({
        error: 'Мощность не задана',
        capacity_not_set: true,
      });
    }
    // Мощность не ограничивается жёстко 1000–5000 — любое положительное значение допустимо

    const capacityDay = Math.round(capacityWeekNum / WORKING_DAYS_PER_WEEK);
    const workingDaysList = getWorkingDaysInRange(from, to);
    const workingDaysCount = workingDaysList.length;

    // remainder_qty = total_order_qty - fact_done_qty
    const totalQuantity = order.total_quantity ?? order.quantity ?? 0;
    const actualRows = await db.sequelize.query(
      `SELECT COALESCE(SUM(actual_qty), 0)::int as actual_total
       FROM production_plan_day
       WHERE order_id = :orderId AND (floor_id = :floorId OR (:floorId IS NULL AND floor_id IS NULL))`,
      {
        replacements: { orderId: Number(order_id), floorId: effectiveFloorId },
        type: db.sequelize.QueryTypes.SELECT,
      }
    );
    const planActualTotal = actualRows[0]?.actual_total ?? 0;
    const cuttingTasks = await db.CuttingTask.findAll({
      where: { order_id: Number(order_id) },
      attributes: ['actual_variants'],
    });
    let cutting_fact_qty = 0;
    for (const t of cuttingTasks) {
      for (const v of t.actual_variants || []) {
        cutting_fact_qty += parseInt(v.quantity_actual, 10) || 0;
      }
    }
    // Планирование НЕ зависит от факта раскроя. Раскрой выполняется после планирования.
    const available_to_sew = cutting_fact_qty > 0 ? cutting_fact_qty : totalQuantity;
    // Остаток по заказу; сверху ограничиваем тем, что можно пошить по факту раскроя
    const remainder_qty = Math.max(0, totalQuantity - planActualTotal);
    const remainder_qty_capped = Math.min(remainder_qty, Math.max(0, available_to_sew - planActualTotal));

    // Период планирования — по первой дате диапазона
    const period = await getOrCreatePeriodForMonth(
      db,
      parseInt(from.slice(0, 4), 10),
      parseInt(from.slice(5, 7), 10)
    ).then((r) => r.period);

    // existing_load_day(date) — только из production_plan_day: SUM(planned_qty) по floor_id и дате
    const planDaysAll = await db.ProductionPlanDay.findAll({
      where: {
        period_id: period.id,
        workshop_id: Number(workshop_id),
        floor_id: effectiveFloorId,
        date: { [Op.in]: workingDaysList },
      },
      attributes: ['order_id', 'date', 'planned_qty'],
    });
    const existingLoadDay = {};
    const ourPlanDay = {};
    for (const dt of workingDaysList) {
      existingLoadDay[dt] = 0;
      ourPlanDay[dt] = 0;
    }
    for (const pd of planDaysAll) {
      const q = pd.planned_qty || 0;
      existingLoadDay[pd.date] = (existingLoadDay[pd.date] || 0) + q;
      if (pd.order_id === Number(order_id)) {
        ourPlanDay[pd.date] = q;
      }
    }

    // free_capacity_day = max(0, capacity_day - existing_load_day) — строгая формула
    // Для распределения: доступно под наш заказ = free + наш текущий план (мы заменяем план)
    const proposed = [];
    let remainder = remainder_qty_capped;
    let proposed_sum = 0;

    for (const date of workingDaysList) {
      const existing_load_day = existingLoadDay[date] || 0;
      const free_capacity_day = Math.max(0, capacityDay - existing_load_day);
      const availableForUs = Math.round(free_capacity_day + (ourPlanDay[date] || 0));
      const proposed_day = Math.min(remainder, Math.max(0, availableForUs));
      remainder -= proposed_day;
      proposed_sum += proposed_day;
      proposed.push({ date, planned_qty: proposed_day });
    }

    // Лог: capacity_day, existing_load_day (реальный), free_capacity_day (после формулы)
    if (process.env.NODE_ENV !== 'production') {
      const sampleDates = workingDaysList.slice(0, 3);
      const existing_sample = sampleDates.reduce((o, d) => {
        o[d] = existingLoadDay[d] ?? 0;
        return o;
      }, {});
      const free_sample = sampleDates.reduce((o, d) => {
        o[d] = Math.max(0, capacityDay - (existingLoadDay[d] ?? 0));
        return o;
      }, {});
      console.log('[planning calc-capacity]', {
        capacity_day: capacityDay,
        existing_load_day_sample: existing_sample,
        free_capacity_day_sample: free_sample,
        proposed_sum,
        remainder_after: remainder,
      });
    }

    const overload = remainder > 0;
    const totalCapacity = capacityDay * workingDaysCount;
    const percent = totalCapacity > 0 ? Math.round((proposed_sum / totalCapacity) * 100) : 0;

    res.json({
      total_quantity: totalQuantity,
      actual_total: planActualTotal,
      available_to_sew: available_to_sew,
      remaining: remainder_qty_capped,
      daily_capacity: capacityDay,
      working_days: workingDaysCount,
      total_capacity: totalCapacity,
      capacity_week: capacityWeekNum,
      percent,
      overload,
      remainder_after: overload ? remainder : 0,
      days: proposed,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/planning/apply-capacity
 * Применение рассчитанного плана. Только admin/manager или technologist для своего этажа.
 */
router.post('/apply-capacity', async (req, res, next) => {
  try {
    if (req.user.role === 'operator') {
      return res.status(403).json({ error: 'Оператор не может применять план' });
    }

    const { order_id, workshop_id, floor_id, days } = req.body;
    if (!order_id || !workshop_id || !Array.isArray(days) || days.length === 0) {
      return res.status(400).json({ error: 'Укажите order_id, workshop_id и массив days' });
    }

    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });

    let effectiveFloorId = null;
    if (workshop.floors_count === 4) {
      if (floor_id == null || floor_id === '' || floor_id === 'all') {
        return res.status(400).json({ error: 'Для цеха «Наш цех» укажите floor_id (1–4)' });
      }
      const fid = Number(floor_id);
      if (fid < 1 || fid > 4) {
        return res.status(400).json({ error: 'floor_id должен быть от 1 до 4' });
      }
      effectiveFloorId = fid;

      // Технолог — только для своего этажа
      if (req.user.role === 'technologist') {
        const allowed = req.allowedBuildingFloorId ?? req.allowedFloorId;
        if (allowed != null && Number(allowed) !== fid) {
          return res.status(403).json({ error: 'Технолог может применять план только для своего этажа' });
        }
      }
    }

    const order = await db.Order.findByPk(order_id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    if (Number(order.workshop_id) !== Number(workshop_id)) {
      return res.status(400).json({ error: 'Заказ не принадлежит выбранному цеху' });
    }

    const dateRange = days.reduce(
      (acc, d) => {
        const dt = String(d.date || d).slice(0, 10);
        if (!acc[0] || dt < acc[0]) acc[0] = dt;
        if (!acc[1] || dt > acc[1]) acc[1] = dt;
        return acc;
      },
      [null, null]
    );

    const period = await requireActivePeriodForDate(db, dateRange[0]);

    // Запись плана через UPSERT в транзакции — защита от двойного вызова (например React StrictMode).
    // Уникальность: production_plan_day (period_id, order_id, date, workshop_id, floor_id) — findOrCreate по этим полям.
    const t = await db.sequelize.transaction();
    try {
      const affectedDates = [];
      for (const d of days) {
        const date = String(d.date || d).slice(0, 10);
        const plannedQty = Math.max(0, parseInt(d.planned_qty, 10) || 0);
        const where = {
          period_id: period.id,
          order_id: Number(order_id),
          workshop_id: Number(workshop_id),
          floor_id: effectiveFloorId,
          date,
        };
        const [row, created] = await db.ProductionPlanDay.findOrCreate({
          where,
          defaults: {
            period_id: period.id,
            order_id: Number(order_id),
            workshop_id: Number(workshop_id),
            floor_id: effectiveFloorId,
            date,
            planned_qty: plannedQty,
            actual_qty: 0,
          },
          transaction: t,
        });
        if (!created) {
          await row.update(
            { planned_qty: plannedQty },
            { transaction: t }
          );
        }
        affectedDates.push(date);
      }
      // Удалить дни из диапазона, которых нет в новом списке (семантика «только эти даты в плане»)
      const dateSet = new Set(affectedDates);
      const toDelete = [];
      const nextDayStr = (s) => {
        const d = new Date(s + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + 1);
        return d.toISOString().slice(0, 10);
      };
      for (let cur = dateRange[0]; cur <= dateRange[1]; cur = nextDayStr(cur)) {
        if (!dateSet.has(cur)) toDelete.push(cur);
      }
      if (toDelete.length > 0) {
        await db.ProductionPlanDay.destroy({
          where: {
            period_id: period.id,
            order_id: Number(order_id),
            workshop_id: Number(workshop_id),
            floor_id: effectiveFloorId,
            date: { [Op.in]: toDelete },
          },
          transaction: t,
        });
      }
      await syncWeeklyCacheFromDaily(db, Number(workshop_id), effectiveFloorId, Number(order_id), affectedDates, period.id, t);
      await recalculateCarry(db, Number(workshop_id), effectiveFloorId, period.id, t);

      // Чтобы план отображался в «Информации о заказе», связываем заказ с этажом при применении
      if (effectiveFloorId != null && (order.building_floor_id == null || order.building_floor_id === '')) {
        await order.update({ building_floor_id: effectiveFloorId }, { transaction: t });
      }

      await t.commit();
      res.json({ ok: true, message: 'План применён' });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

/** POST /api/planning/apply-proposed — body: { floor_id, row_key, proposed: [{date, qty}] } */
router.post('/apply-proposed', async (req, res, next) => {
  try {
    const { floor_id, row_key, proposed } = req.body;
    if (!row_key || !Array.isArray(proposed) || proposed.length === 0) {
      return res.status(400).json({ error: 'Укажите row_key и массив proposed' });
    }
    const order = await db.Order.findByPk(row_key);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    req.body = {
      order_id: row_key,
      workshop_id: order.workshop_id,
      floor_id: floor_id ?? null,
      days: proposed.map((p) => ({ date: p.date, planned_qty: p.qty ?? p.planned_qty ?? 0 })),
    };
    next();
  } catch (err) {
    next(err);
  }
}, async (req, res, next) => {
  const { order_id, workshop_id, floor_id, days } = req.body;
  try {
    if (req.user?.role === 'operator') return res.status(403).json({ error: 'Оператор не может применять план' });
    if (!order_id || !workshop_id || !Array.isArray(days) || days.length === 0) {
      return res.status(400).json({ error: 'Укажите order_id, workshop_id и массив days' });
    }
    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });
    let effectiveFloorId = workshop.floors_count === 4 && floor_id != null && floor_id !== 'all' ? Number(floor_id) : null;
    if (workshop.floors_count === 4 && (effectiveFloorId == null || effectiveFloorId < 1 || effectiveFloorId > 4)) {
      return res.status(400).json({ error: 'Для цеха «Наш цех» укажите floor_id (1–4)' });
    }
    const order = await db.Order.findByPk(order_id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    if (Number(order.workshop_id) !== Number(workshop_id)) return res.status(400).json({ error: 'Заказ не принадлежит цеху' });
    const dateRange = days.reduce((a, d) => {
      const dt = String(d.date || d).slice(0, 10);
      return [(a[0] && dt < a[0] ? dt : a[0]) || dt, (a[1] && dt > a[1] ? dt : a[1]) || dt];
    }, [null, null]);
    const period = await requireActivePeriodForDate(db, dateRange[0]);
    const t = await db.sequelize.transaction();
    try {
      const existingRows = await db.ProductionPlanDay.findAll({
        where: { period_id: period.id, order_id, workshop_id, floor_id: effectiveFloorId, date: { [Op.between]: [dateRange[0], dateRange[1]] } },
        transaction: t,
      });
      const actualByDate = existingRows.reduce((a, r) => { a[r.date] = r.actual_qty || 0; return a; }, {});
      await db.ProductionPlanDay.destroy({
        where: { period_id: period.id, order_id, workshop_id, floor_id: effectiveFloorId, date: { [Op.between]: [dateRange[0], dateRange[1]] } },
        transaction: t,
      });
      const affectedDates = [];
      for (const d of days) {
        const date = String(d.date || d).slice(0, 10);
        affectedDates.push(date);
        await db.ProductionPlanDay.create({
          period_id: period.id,
          order_id, workshop_id, floor_id: effectiveFloorId, date,
          planned_qty: Math.max(0, parseInt(d.planned_qty, 10) || 0),
          actual_qty: actualByDate[date] ?? 0,
        }, { transaction: t });
      }
      await syncWeeklyCacheFromDaily(db, workshop_id, effectiveFloorId, order_id, affectedDates, period.id, t);
      await recalculateCarry(db, workshop_id, effectiveFloorId, period.id, t);
      if (effectiveFloorId != null && !order.building_floor_id) {
        await order.update({ building_floor_id: effectiveFloorId }, { transaction: t });
      }
      await t.commit();
      res.json({ ok: true, message: 'План применён' });
    } catch (e) {
      await t.rollback();
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

/** POST /api/planning/recalculate-carry?period_id=&floor_id=&workshop_id= — пересчитать carry по всем строкам периода */
router.post('/recalculate-carry', async (req, res, next) => {
  try {
    const { period_id, floor_id, workshop_id } = req.query;
    if (!period_id || !workshop_id) {
      return res.status(400).json({ error: 'Укажите workshop_id и period_id' });
    }
    const period = await db.PlanningPeriod.findByPk(period_id);
    if (!period) return res.status(404).json({ error: 'Период не найден' });
    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });
    const floorId = workshop.floors_count === 4 && floor_id ? Number(floor_id) : null;
    await recalculateCarry(db, Number(workshop_id), floorId, Number(period_id));
    res.json({ ok: true, message: 'Перенос пересчитан' });
  } catch (err) {
    next(err);
  }
});

/** GET /api/planning/integrity-check — dev: проверка weekly vs daily */
router.get('/integrity-check', async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Недоступно в production' });
    }
    await checkWeeklyIntegrity(db);
    res.json({ ok: true, message: 'Проверка выполнена (см. консоль)' });
  } catch (err) {
    next(err);
  }
});

// ========== Распределение заказов отключено ==========
router.post('/assign', async (req, res) => {
  return res.status(410).json({
    error: 'Функция распределения отключена',
  });
});

/**
 * PUT /api/planning/operations/:id
 * Обновление операции заказа (actual_quantity, planned_date и т.д.)
 */
router.put('/operations/:id', async (req, res, next) => {
  try {
    const orderOp = await db.OrderOperation.findByPk(req.params.id, {
      include: [{ model: db.Order, as: 'Order' }],
    });
    if (!orderOp) {
      return res.status(404).json({ error: 'Операция не найдена' });
    }

    if (req.user.role === 'technologist') {
      const order = await db.Order.findByPk(orderOp.order_id, {
        include: [{ model: db.Technologist, as: 'Technologist' }],
      });
      if (!order.Technologist || order.Technologist.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Нет прав редактировать эту операцию' });
      }
    }

    const { actual_quantity, planned_quantity, planned_date, sewer_id } = req.body;
    const updates = {};
    if (actual_quantity !== undefined) updates.actual_quantity = actual_quantity;
    if (planned_quantity !== undefined) updates.planned_quantity = planned_quantity;
    if (planned_date !== undefined) updates.planned_date = planned_date;
    if (sewer_id !== undefined) updates.sewer_id = sewer_id;

    await orderOp.update(updates);
    await logAudit(req.user.id, 'UPDATE', 'order_operation', orderOp.id);

    const updated = await db.OrderOperation.findByPk(orderOp.id, {
      include: [
        { model: db.Operation, as: 'Operation' },
        { model: db.Sewer, as: 'Sewer', include: [{ model: db.User, as: 'User' }] },
        { model: db.Order, as: 'Order' },
      ],
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/planning/day?date=YYYY-MM-DD
 * План на день
 */
router.get('/day', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Укажите дату (date)' });

    const sewers = await db.Sewer.findAll({
      include: [
        { model: db.User, as: 'User' },
        {
          model: db.Technologist,
          as: 'Technologist',
          include: [{ model: db.Floor, as: 'Floor' }, { model: db.User, as: 'User' }],
        },
      ],
    });

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const filtered = sewers.filter(
        (s) => s.Technologist && s.Technologist.floor_id === req.allowedFloorId
      );
      sewers.length = 0;
      sewers.push(...filtered);
    }

    const result = await Promise.all(
      sewers.map(async (sewer) => {
        let capacity = sewer.capacity_per_day;
        let load = 0;

        const pc = await db.ProductionCalendar.findOne({
          where: { sewer_id: sewer.id, date },
        });
        if (pc) {
          capacity = pc.capacity;
          load = pc.load;
        }

        const orderOps = await db.OrderOperation.findAll({
          where: { sewer_id: sewer.id, planned_date: date },
          include: [
            { model: db.Operation, as: 'Operation' },
            {
              model: db.Order,
              as: 'Order',
              include: [{ model: db.Client, as: 'Client' }],
            },
          ],
        });

        let plannedLoad = 0;
        for (const op of orderOps) {
          plannedLoad += (op.planned_quantity || 0) * parseFloat(op.Operation?.norm_minutes || 0);
        }

        return {
          sewer_id: sewer.id,
          sewer: sewer.User?.name,
          floor: sewer.Technologist?.Floor?.name,
          capacity,
          load,
          planned_load: Math.round(plannedLoad),
          overload: Math.max(0, plannedLoad - capacity),
          operations: orderOps,
        };
      })
    );

    res.json({ date, items: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/planning/week?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
router.get('/week', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Укажите from и to' });

    const sewers = await db.Sewer.findAll({
      include: [
        { model: db.User, as: 'User' },
        {
          model: db.Technologist,
          as: 'Technologist',
          include: [{ model: db.Floor, as: 'Floor' }],
        },
      ],
    });

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const filtered = sewers.filter(
        (s) => s.Technologist && s.Technologist.floor_id === req.allowedFloorId
      );
      sewers.length = 0;
      sewers.push(...filtered);
    }

    const orderOps = await db.OrderOperation.findAll({
      where: {
        sewer_id: { [Op.in]: sewers.map((s) => s.id) },
        planned_date: { [Op.between]: [from, to] },
      },
      include: [
        { model: db.Operation, as: 'Operation' },
        { model: db.Order, as: 'Order' },
        { model: db.Sewer, as: 'Sewer', include: [{ model: db.User, as: 'User' }] },
      ],
    });

    const byDate = {};
    for (const op of orderOps) {
      const d = op.planned_date;
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(op);
    }

    res.json({ from, to, by_date: byDate });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/planning/month?month=YYYY-MM
 */
router.get('/month', async (req, res, next) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ error: 'Укажите month (YYYY-MM)' });

    const [y, m] = month.split('-').map(Number);
    const from = `${month}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${month}-${String(lastDay).padStart(2, '0')}`;

    const sewers = await db.Sewer.findAll({
      include: [
        { model: db.User, as: 'User' },
        {
          model: db.Technologist,
          as: 'Technologist',
          include: [{ model: db.Floor, as: 'Floor' }],
        },
      ],
    });

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const filtered = sewers.filter(
        (s) => s.Technologist && s.Technologist.floor_id === req.allowedFloorId
      );
      sewers.length = 0;
      sewers.push(...filtered);
    }

    const orderOps = await db.OrderOperation.findAll({
      where: {
        sewer_id: { [Op.in]: sewers.map((s) => s.id) },
        planned_date: { [Op.between]: [from, to] },
      },
      include: [
        { model: db.Operation, as: 'Operation' },
        { model: db.Order, as: 'Order' },
        { model: db.Sewer, as: 'Sewer' },
      ],
    });

    const bySewer = {};
    for (const sewer of sewers) {
      bySewer[sewer.id] = {
        sewer: sewer.User?.name,
        floor: sewer.Technologist?.Floor?.name,
        total_planned: 0,
        total_capacity: sewer.capacity_per_day * lastDay,
      };
    }

    for (const op of orderOps) {
      const minutes = (op.planned_quantity || 0) * parseFloat(op.Operation?.norm_minutes || 0);
      if (bySewer[op.sewer_id]) {
        bySewer[op.sewer_id].total_planned += minutes;
      }
    }

    res.json({ month, from, to, by_sewer: bySewer });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
