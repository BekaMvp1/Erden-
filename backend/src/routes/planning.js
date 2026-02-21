/**
 * Роуты планирования и распределения
 * POST /assign — ручное распределение заказа
 * GET /floors?workshop_id= — этажи по цеху
 * GET /table?workshop_id=&from=&to=&floor_id= — таблица плана (Excel-подобная)
 * PUT /day — обновление плана/факта по дню
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { logAudit } = require('../utils/audit');
const flowCalculatorController = require('../controllers/flowCalculatorController');

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
 * GET /api/planning/table?workshop_id=&from=&to=&floor_id=
 * Таблица плана: заказчик, модель, даты, план, факт, итого
 */
router.get('/table', async (req, res, next) => {
  try {
    const { workshop_id, from, to, floor_id } = req.query;
    if (!workshop_id) return res.status(400).json({ error: 'Укажите workshop_id' });
    if (!from || !to) return res.status(400).json({ error: 'Укажите from и to' });

    const workshop = await db.Workshop.findByPk(workshop_id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });

    const planWhere = {
      workshop_id: Number(workshop_id),
      date: { [Op.between]: [from, to] },
    };
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
 * GET /api/planning/model-table?workshop_id=&order_id=&from=&to=&floor_id=
 * Таблица плана по выбранной модели (заказу): даты, план, факт, итого.
 */
router.get('/model-table', async (req, res, next) => {
  try {
    const { workshop_id, order_id, from, to, floor_id } = req.query;
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

    const planned = Math.max(0, parseInt(planned_qty, 10) || 0);
    const actual = Math.max(0, parseInt(actual_qty, 10) || 0);
    const notesVal = typeof notes === 'string' ? notes.trim() || null : null;

    const [row, created] = await db.ProductionPlanDay.findOrCreate({
      where: {
        order_id: Number(order_id),
        date: String(date).slice(0, 10),
        workshop_id: Number(workshop_id),
        floor_id: effectiveFloorId,
      },
      defaults: {
        planned_qty: planned,
        actual_qty: actual,
        notes: notesVal,
      },
    });

    if (!created) {
      await row.update({ planned_qty: planned, actual_qty: actual, notes: notesVal });
    }

    res.json(row);
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
 * Расчёт плана по мощности: remaining, daily_capacity, working_days, total_capacity, percent, overload, days
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
    const capWeek = capacity_week != null && capacity_week !== '' ? parseInt(capacity_week, 10) : null;
    if (capWeek != null && (capWeek < 1000 || capWeek > 5000)) {
      return res.status(400).json({ error: 'Мощность в неделю должна быть от 1000 до 5000 ед' });
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

    // 1) total_quantity, actual_total, remaining
    const totalQuantity = order.total_quantity ?? order.quantity ?? 0;
    const actualRows = await db.sequelize.query(
      `SELECT COALESCE(SUM(actual_qty), 0)::int as actual_total
       FROM production_plan_day
       WHERE order_id = :orderId AND (floor_id = :floorId OR (:floorId IS NULL AND floor_id IS NULL))`,
      {
        replacements: {
          orderId: Number(order_id),
          floorId: effectiveFloorId,
        },
        type: db.sequelize.QueryTypes.SELECT,
      }
    );
    const planActualTotal = actualRows[0]?.actual_total ?? 0;

    // План и факт по раскрою — из CuttingTask.actual_variants
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
    // Если нет плана из раскроя — используем общее кол-во заказа
    if (cuttingPlannedTotal === 0) {
      cuttingPlannedTotal = totalQuantity;
    }

    const actualTotal = Math.max(planActualTotal, cuttingActualTotal);
    // Для Предложенного плана: распределяем ФАКТ по раскрою (не план) по мощностям
    const remaining = cuttingActualTotal > 0
      ? cuttingActualTotal
      : cuttingPlannedTotal > 0
        ? cuttingPlannedTotal
        : Math.max(0, totalQuantity - actualTotal);

    const fromDate = new Date(from);
    const toDate = new Date(to);
    const dates = [];
    let d = new Date(fromDate);
    while (d <= toDate) {
      dates.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    const workingDays = dates.length;

    // 2) daily_capacity, total_capacity
    // Если задана мощность в неделю (capacity_week): total = capacity_week * (дней / 7), daily = capacity_week / 7
    let dailyCapacity = 200; // по умолчанию
    let totalCapacity;
    const capacityWeekNum = capacity_week != null && capacity_week !== '' ? parseInt(capacity_week, 10) : null;
    if (capacityWeekNum && capacityWeekNum > 0) {
      totalCapacity = Math.round(capacityWeekNum * (workingDays / 7));
      dailyCapacity = Math.round(capacityWeekNum / 7);
    } else {
      if (effectiveFloorId) {
        const capRows = await db.sequelize.query(
          `SELECT COALESCE(SUM(s.capacity_per_day), 0)::int as daily_capacity
           FROM technologists t
           JOIN sewers s ON s.technologist_id = t.id
           WHERE t.building_floor_id = :floorId
           GROUP BY t.building_floor_id`,
          {
            replacements: { floorId: effectiveFloorId },
            type: db.sequelize.QueryTypes.SELECT,
          }
        );
        dailyCapacity = capRows[0]?.daily_capacity ?? 200;
      }
      totalCapacity = dailyCapacity * workingDays;
    }

    // 3) overload, percent
    const percent = totalCapacity > 0 ? Math.round((remaining / totalCapacity) * 100) : 0;
    const overload = remaining > totalCapacity;

    // 4) days — равномерное распределение, сумма = ровно remaining (257+258+... = 1800)
    let days = [];
    if (!overload && workingDays > 0) {
      if (remaining > 0) {
        const base = Math.floor(remaining / workingDays);
        const rest = remaining % workingDays;
        days = dates.map((date, i) => {
          const plannedQty = base + (i < rest ? 1 : 0);
          return { date, planned_qty: plannedQty };
        });
      } else {
        days = dates.map((date) => ({ date, planned_qty: 0 }));
      }
    }

    res.json({
      total_quantity: totalQuantity,
      actual_total: actualTotal,
      cutting_planned_total: cuttingPlannedTotal,
      cutting_actual_total: cuttingActualTotal,
      plan_actual_total: planActualTotal,
      remaining,
      daily_capacity: dailyCapacity,
      working_days: workingDays,
      total_capacity: totalCapacity,
      capacity_week: capacityWeekNum || null,
      percent,
      overload,
      days,
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

    const t = await db.sequelize.transaction();
    try {
      const existingRows = await db.ProductionPlanDay.findAll({
        where: {
          order_id: Number(order_id),
          workshop_id: Number(workshop_id),
          floor_id: effectiveFloorId,
          date: { [Op.between]: [dateRange[0], dateRange[1]] },
        },
        transaction: t,
      });
      const actualByDate = (existingRows || []).reduce((acc, r) => {
        acc[r.date] = r.actual_qty || 0;
        return acc;
      }, {});

      await db.ProductionPlanDay.destroy({
        where: {
          order_id: Number(order_id),
          workshop_id: Number(workshop_id),
          floor_id: effectiveFloorId,
          date: { [Op.between]: [dateRange[0], dateRange[1]] },
        },
        transaction: t,
      });

      for (const d of days) {
        const date = String(d.date || d).slice(0, 10);
        const plannedQty = Math.max(0, parseInt(d.planned_qty, 10) || 0);
        const actualQty = actualByDate[date] ?? 0;
        await db.ProductionPlanDay.create(
          {
            order_id: Number(order_id),
            workshop_id: Number(workshop_id),
            floor_id: effectiveFloorId,
            date,
            planned_qty: plannedQty,
            actual_qty: actualQty,
          },
          { transaction: t }
        );
      }

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

// ========== Распределение заказов ==========

/**
 * POST /api/planning/assign
 * Ручное распределение заказа. Вся логика в одной транзакции.
 * Проверки: заказ, статус, этаж, технолог, швеи, операции, planned_quantity > 0, planned_date.
 */
router.post('/assign', async (req, res, next) => {
  let t;
  try {
    t = await db.sequelize.transaction();
    const { order_id, floor_id, building_floor_id, technologist_id, operations } = req.body;
    const distFloorId = building_floor_id || floor_id;

    // 1. Базовые проверки входных данных
    if (!order_id || !distFloorId || !technologist_id || !Array.isArray(operations)) {
      await t.rollback();
      return res.status(400).json({
        error: 'Укажите order_id, building_floor_id (или floor_id), technologist_id и массив operations',
      });
    }

    if (operations.length === 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Добавьте хотя бы одну операцию' });
    }

    // 2. Заказ существует и не завершён
    const order = await db.Order.findByPk(order_id, {
      include: [{ model: db.OrderStatus, as: 'OrderStatus' }],
      transaction: t,
    });
    if (!order) {
      await t.rollback();
      return res.status(400).json({ error: 'Заказ не найден' });
    }

    const statusName = order.OrderStatus?.name;
    if (statusName === 'Готов') {
      await t.rollback();
      return res.status(400).json({ error: 'Нельзя распределять завершённый заказ' });
    }
    if (statusName !== 'Принят' && statusName !== 'В работе') {
      await t.rollback();
      return res.status(400).json({
        error: 'Заказ можно распределять только со статусом "Принят" или "В работе"',
      });
    }

    // 3. Проверка прав доступа
    if (req.user.role === 'technologist') {
      const allowed = req.allowedBuildingFloorId ?? req.allowedFloorId;
      if (!allowed || Number(distFloorId) !== Number(allowed)) {
        await t.rollback();
        return res.status(403).json({ error: 'Нет прав распределять заказы на этот этаж' });
      }
    }

    // 4. Этаж существует (building_floors)
    const buildingFloor = await db.BuildingFloor.findByPk(distFloorId, { transaction: t });
    if (!buildingFloor) {
      await t.rollback();
      return res.status(400).json({ error: 'Этаж не найден' });
    }

    // 5. Технолог принадлежит этому этажу
    const technologist = await db.Technologist.findByPk(technologist_id, {
      include: [{ model: db.BuildingFloor, as: 'BuildingFloor' }],
      transaction: t,
    });
    if (!technologist) {
      await t.rollback();
      return res.status(400).json({ error: 'Технолог не найден' });
    }
    // Разрешён любой из 4 технологов (добавленных вручную)

    // 6. Швеи технолога (для проверки)
    const sewersOfTech = await db.Sewer.findAll({
      where: { technologist_id },
      attributes: ['id'],
      transaction: t,
    });
    const sewerIds = new Set(sewersOfTech.map((s) => s.id));

    // 7. Операции справочника с default_floor_id, category, locked_to_floor
    const allOps = await db.Operation.findAll({
      attributes: ['id', 'default_floor_id', 'category', 'locked_to_floor'],
      transaction: t,
    });
    const opsMap = new Map(allOps.map((o) => [o.id, o]));
    const validOpIds = new Set(allOps.map((o) => o.id));

    // 8. Варианты заказа (цвет×размер) для копирования в order_operation_variants
    const orderVariants = await db.OrderVariant.findAll({
      where: { order_id },
      include: [{ model: db.Size, as: 'Size' }],
      transaction: t,
    });

    // 9. Проверка каждой операции и защита от дублей
    const seen = new Set();
    const toCreate = [];

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const { operation_id, sewer_id, planned_quantity, planned_date, floor_id: opFloorId } = op;

      if (!operation_id) {
        await t.rollback();
        return res.status(400).json({
          error: `Операция ${i + 1}: укажите операцию`,
        });
      }

      const operation = opsMap.get(Number(operation_id));
      if (!operation) {
        await t.rollback();
        return res.status(400).json({
          error: `Операция ${i + 1}: неверный идентификатор операции`,
        });
      }

      // sewer_id обязателен для SEWING/CUTTING, опционален для FINISH
      const isFinish = operation.category === 'FINISH';
      if (!isFinish && !sewer_id) {
        await t.rollback();
        return res.status(400).json({
          error: `Операция ${i + 1}: укажите швею`,
        });
      }
      if (sewer_id && !sewerIds.has(Number(sewer_id))) {
        await t.rollback();
        return res.status(400).json({
          error: `Операция ${i + 1}: швея не принадлежит выбранному технологу`,
        });
      }

      const qty = parseInt(planned_quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        await t.rollback();
        return res.status(400).json({
          error: `Операция ${i + 1}: количество должно быть больше 0`,
        });
      }

      const dateStr = String(planned_date || '').trim();
      if (!dateStr) {
        await t.rollback();
        return res.status(400).json({
          error: `Операция ${i + 1}: укажите дату планирования`,
        });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        await t.rollback();
        return res.status(400).json({
          error: `Операция ${i + 1}: неверный формат даты (требуется YYYY-MM-DD)`,
        });
      }

      const key = `${order_id}-${operation_id}-${dateStr}`;
      if (seen.has(key)) {
        await t.rollback();
        return res.status(400).json({
          error: `Операция ${i + 1}: дубликат (та же операция на ту же дату)`,
        });
      }
      seen.add(key);

      // Определение этажа: FINISH+locked -> 1, иначе из запроса или default
      let floorId;
      if (operation.locked_to_floor && operation.category === 'FINISH') {
        floorId = 1; // Финиш всегда на 1 этаже
      } else if (opFloorId && [2, 3, 4].includes(Number(opFloorId))) {
        floorId = Number(opFloorId);
      } else {
        floorId = operation.default_floor_id || distFloorId;
      }

      toCreate.push({
        order_id,
        operation_id: Number(operation_id),
        sewer_id: sewer_id ? Number(sewer_id) : null,
        floor_id: floorId,
        planned_quantity: qty,
        planned_total: qty,
        actual_total: 0,
        planned_date: dateStr,
        status: 'Ожидает',
        operation, // для проверки category при создании variants
        orderVariants,
      });
    }

    // 10. Удаление старого распределения (включая variants)
    const existingOps = await db.OrderOperation.findAll({
      where: { order_id },
      attributes: ['id'],
      transaction: t,
    });
    for (const oo of existingOps) {
      await db.OrderOperationVariant.destroy({ where: { order_operation_id: oo.id }, transaction: t });
    }
    await db.OrderOperation.destroy({ where: { order_id }, transaction: t });

    // 11. Создание order_operations и order_operation_variants
    for (const row of toCreate) {
      const { operation, orderVariants: variants, ...createData } = row;
      const oo = await db.OrderOperation.create(createData, { transaction: t });

      // Для CUTTING, SEWING и FINISH — копировать матрицу цвет×размер (кол-во план по вариантам)
      if ((operation.category === 'CUTTING' || operation.category === 'SEWING' || operation.category === 'FINISH') && variants && variants.length > 0) {
        for (const v of variants) {
          await db.OrderOperationVariant.create(
            {
              order_operation_id: oo.id,
              color: v.color,
              size: v.Size?.name || String(v.size_id),
              planned_qty: v.quantity || 0,
              actual_qty: 0,
            },
            { transaction: t }
          );
        }
      }
    }

    // 11. Обновление заказа
    const statusInWork = await db.OrderStatus.findOne({
      where: { name: 'В работе' },
      transaction: t,
    });
    if (!statusInWork) {
      await t.rollback();
      return res.status(500).json({ error: 'Статус "В работе" не найден в справочнике' });
    }

    await order.update(
      {
        building_floor_id: distFloorId,
        technologist_id,
        status_id: statusInWork.id,
      },
      { transaction: t }
    );

    // Запись в журнал распределений по этажам
    await db.OrderFloorDistribution.create(
      {
        order_id,
        floor_id: technologist.floor_id,
        building_floor_id: distFloorId,
        technologist_id,
        distributed_by: req.user.id,
      },
      { transaction: t }
    );

    await t.commit();

    // 12. Аудит после успешного коммита
    await logAudit(req.user.id, 'ASSIGN', 'order', order_id);

    const updated = await db.Order.findByPk(order_id, {
      include: [
        { model: db.Client, as: 'Client' },
        { model: db.OrderStatus, as: 'OrderStatus' },
        { model: db.Floor, as: 'Floor' },
        { model: db.Technologist, as: 'Technologist', include: [{ model: db.User, as: 'User' }] },
        {
          model: db.OrderOperation,
          as: 'OrderOperations',
          include: [
            { model: db.Operation, as: 'Operation' },
            { model: db.Sewer, as: 'Sewer', include: [{ model: db.User, as: 'User' }] },
          ],
        },
      ],
    });

    res.json(updated);
  } catch (err) {
    if (t) await t.rollback().catch(() => {});
    next(err);
  }
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
