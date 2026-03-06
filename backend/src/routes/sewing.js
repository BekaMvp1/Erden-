/**
 * Роуты пошива: очередь задач по этажам.
 * Единая цепочка: план из production_plan_day, факт из sewing_fact, статус sewing_order_floors, партии sewing_batches.
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');

const router = express.Router();

/** Понедельник недели для даты (ISO) */
function getMonday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

/** Воскресенье недели для даты */
function getSunday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? 0 : 7);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

/** Этажи пошива по умолчанию (fallback если в БД нет подходящих) */
const SEWING_FLOOR_IDS_DEFAULT = [2, 3, 4];

/**
 * Получить id этажей пошива из building_floors: «Производство» или все кроме Финиш/ОТК и Склад.
 */
async function getSewingFloorIds() {
  const floors = await db.BuildingFloor.findAll({ attributes: ['id', 'name'], raw: true });
  const withProizv = (floors || []).filter((f) => f.name && /Производство|производство/i.test(f.name));
  if (withProizv.length > 0) {
    return withProizv.map((f) => f.id).sort((a, b) => a - b);
  }
  const notFinishNotSklad = (floors || []).filter(
    (f) => f.id !== 1 && (!f.name || !/склад/i.test(f.name))
  );
  if (notFinishNotSklad.length > 0) {
    return notFinishNotSklad.map((f) => f.id).sort((a, b) => a - b);
  }
  return SEWING_FLOOR_IDS_DEFAULT;
}

/**
 * PUT /api/sewing/fact
 * Сохранить факт пошива в таблицу sewing_fact (order_id, floor_id, date, fact_qty).
 * Вызывается при нажатии «Сохранить» на странице Пошив.
 * Body: { order_id, floor_id, date, fact_qty }
 */
router.put('/fact', async (req, res, next) => {
  try {
    const sewingFloorIds = await getSewingFloorIds();
    const { order_id, floor_id, date, fact_qty } = req.body;
    if (!order_id || floor_id == null || floor_id === '' || !date) {
      return res.status(400).json({ error: 'Укажите order_id, floor_id и date' });
    }
    const effectiveFloorId = Number(floor_id);
    if (!sewingFloorIds.includes(effectiveFloorId)) {
      return res.status(400).json({ error: 'Укажите этаж пошива (производственный этаж)' });
    }
    const dateStr = String(date).slice(0, 10);
    const qty = Math.max(0, parseInt(fact_qty, 10) || 0);

    await db.SewingFact.upsert(
      {
        order_id: Number(order_id),
        floor_id: effectiveFloorId,
        date: dateStr,
        fact_qty: qty,
      },
      { conflictFields: ['order_id', 'floor_id', 'date'] }
    );
    const row = await db.SewingFact.findOne({
      where: { order_id: Number(order_id), floor_id: effectiveFloorId, date: dateStr },
    });

    res.json(row ? row.get({ plain: true }) : { order_id: Number(order_id), floor_id: effectiveFloorId, date: dateStr, fact_qty: qty });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sewing/plan-dates?order_id=&floor_id=
 * Все даты плана по заказу и этажу (для «Завершить → ОТК»: сохранить факт по всем датам).
 */
router.get('/plan-dates', async (req, res, next) => {
  try {
    const sewingFloorIds = await getSewingFloorIds();
    const order_id = req.query.order_id != null && req.query.order_id !== '' ? Number(req.query.order_id) : null;
    const floor_id = req.query.floor_id != null && req.query.floor_id !== '' ? Number(req.query.floor_id) : null;
    if (!order_id || !floor_id || !sewingFloorIds.includes(floor_id)) {
      return res.status(400).json({ error: 'Укажите order_id и floor_id (производственный этаж)' });
    }
    const planRows = await db.ProductionPlanDay.findAll({
      where: { order_id, floor_id },
      attributes: ['date', 'planned_qty'],
      raw: true,
      order: [['date', 'ASC']],
    });
    const dates = (planRows || []).map((r) => ({
      date: r.date ? String(r.date).slice(0, 10) : null,
      planned_qty: Number(r.planned_qty) || 0,
    })).filter((d) => d.date);
    const factRows = await db.SewingFact.findAll({
      where: { order_id, floor_id },
      attributes: ['date', 'fact_qty'],
      raw: true,
    });
    const factByDate = {};
    (factRows || []).forEach((r) => {
      const d = r.date ? String(r.date).slice(0, 10) : null;
      if (d) factByDate[d] = Number(r.fact_qty) || 0;
    });
    const out = dates.map((d) => ({ date: d.date, planned_qty: d.planned_qty, fact_qty: factByDate[d.date] ?? 0 }));
    res.json({ dates: out });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sewing/fact/bulk
 * Сохранить факт по всем датам одним запросом. Обновляет таблицу sewing_fact.
 * Body: { order_id, floor_id, facts: [ { date, fact_qty }, ... ] } или rows: [ { date, fact_qty? or fact? }, ... ]
 */
router.post('/fact/bulk', async (req, res, next) => {
  try {
    const sewingFloorIds = await getSewingFloorIds();
    const { order_id, floor_id, facts, rows } = req.body;
    const effectiveOrderId = order_id != null && order_id !== '' ? Number(order_id) : NaN;
    const effectiveFloorId = floor_id != null && floor_id !== '' ? Number(floor_id) : NaN;
    if (Number.isNaN(effectiveOrderId) || effectiveOrderId <= 0 || Number.isNaN(effectiveFloorId) || !sewingFloorIds.includes(effectiveFloorId)) {
      return res.status(400).json({
        error: 'Требуются order_id и floor_id (производственный этаж).',
        received: { order_id: req.body.order_id, floor_id: req.body.floor_id },
      });
    }
    // Поддержка формата facts: [{ date, fact_qty }] и legacy rows: [{ date, fact_qty } или { date, fact }]
    const arr = Array.isArray(facts) ? facts : (Array.isArray(rows) ? rows : []);
    const useFacts = Array.isArray(facts);
    const t = await db.sequelize.transaction();
    try {
      for (const r of arr) {
        const dateStr = r.date ? String(r.date).slice(0, 10) : null;
        if (!dateStr) continue;
        const qty = useFacts
          ? Math.max(0, parseInt(r.fact_qty, 10) || 0)
          : Math.max(0, parseInt(r.fact_qty, 10) || parseInt(r.fact, 10) || 0);
        await db.SewingFact.upsert(
          {
            order_id: effectiveOrderId,
            floor_id: effectiveFloorId,
            date: dateStr,
            fact_qty: qty,
          },
          { transaction: t, conflictFields: ['order_id', 'floor_id', 'date'] }
        );
      }
      await t.commit();
      res.json({ ok: true, count: arr.length });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sewing/board
 * Список для UI Пошив: статус из sewing_order_floors, план из Планирования (production_plan_day), факт из sewing_fact.
 * Ключ связки: (order_id, floor_id). plan_rows: [{ date, plan_qty }], fact_rows: [{ date, fact_qty }].
 * Параметры: status, date_from, date_to, q, order_id (опционально)
 */
router.get('/board', async (req, res, next) => {
  try {
    const sewingFloorIds = await getSewingFloorIds();
    const today = new Date().toISOString().slice(0, 10);
    const weekStart = getMonday(today);
    const weekEnd = getSunday(today);
    let date_from = req.query.date_from || weekStart;
    let date_to = req.query.date_to || weekEnd;
    if (date_from > date_to) [date_from, date_to] = [date_to, date_from];
    const statusFilter = (req.query.status || 'IN_PROGRESS').toUpperCase();
    const q = (req.query.q || '').trim();

    const keys = new Set();

    // Ключи (order_id, floor_id) — из sewing_order_floors и раскроя (производственные этажи)
    const orderFloors = await db.SewingOrderFloor.findAll({
      where: { floor_id: { [Op.in]: sewingFloorIds } },
      attributes: ['order_id', 'floor_id', 'status', 'done_batch_id'],
      raw: true,
    });
    orderFloors.forEach((r) => keys.add(`${r.order_id}-${r.floor_id}`));

    const cuttingDone = await db.CuttingTask.findAll({
      where: { status: 'Готово', floor: { [Op.in]: sewingFloorIds } },
      attributes: ['order_id', 'floor'],
      raw: true,
    });
    cuttingDone.forEach((r) => keys.add(`${r.order_id}-${r.floor}`));

    // План по дням — единый источник: Планирование (production_plan_day), ключ (order_id, floor_id, date)
    const orderIdFilter = req.query.order_id ? Number(req.query.order_id) : null;
    const planWhere = {
      floor_id: { [Op.in]: sewingFloorIds },
      date: { [Op.between]: [date_from, date_to] },
    };
    if (orderIdFilter != null) planWhere.order_id = orderIdFilter;
    const planRows = await db.ProductionPlanDay.findAll({
      where: planWhere,
      attributes: ['order_id', 'floor_id', 'date', 'planned_qty'],
      raw: true,
    });
    const planByKey = {};
    (planRows || []).forEach((r) => {
      const k = `${r.order_id}-${r.floor_id}`;
      if (!planByKey[k]) planByKey[k] = [];
      const dateStr = r.date ? String(r.date).slice(0, 10) : null;
      if (dateStr) planByKey[k].push({ date: dateStr, plan_qty: Number(r.planned_qty) || 0 });
    });
    // Чтобы блок этажа появился на Пошиве: добавляем ключи из плана (если запланировали 3 этаж — показываем блок 3)
    Object.keys(planByKey).forEach((k) => keys.add(k));

    // Факт по дням — только из sewing_fact (order_id, floor_id, date)
    const factRows = await db.SewingFact.findAll({
      where: {
        floor_id: { [Op.in]: sewingFloorIds },
        date: { [Op.between]: [date_from, date_to] },
      },
      attributes: ['order_id', 'floor_id', 'date', 'fact_qty'],
      raw: true,
    });
    const factByKey = {};
    factRows.forEach((r) => {
      const k = `${r.order_id}-${r.floor_id}`;
      if (!factByKey[k]) factByKey[k] = [];
      factByKey[k].push({ date: r.date, fact_qty: Number(r.fact_qty) || 0 });
    });

    const statusByKey = {};
    const doneBatchByKey = {};
    orderFloors.forEach((r) => {
      const k = `${r.order_id}-${r.floor_id}`;
      statusByKey[k] = r.status;
      if (r.done_batch_id) doneBatchByKey[k] = r.done_batch_id;
    });

    const orderIds = [...new Set([...keys].map((k) => parseInt(k.split('-')[0], 10)))];
    const orders = await db.Order.findAll({
      where: { id: orderIds },
      attributes: ['id', 'title', 'tz_code', 'model_name', 'deadline', 'workshop_id'],
      include: [{ model: db.Client, as: 'Client', required: false, attributes: ['name'] }],
    });
    const orderMap = {};
    orders.forEach((o) => { orderMap[o.id] = o; });

    if (req.user?.role === 'technologist' && req.allowedBuildingFloorId != null) {
      const allowed = req.allowedBuildingFloorId;
      [...keys].forEach((k) => {
        const [, fidStr] = k.split('-');
        if (parseInt(fidStr, 10) !== allowed) keys.delete(k);
      });
    }

    // Сортируем строки по дате внутри каждой ячейки
    Object.keys(planByKey).forEach((k) => planByKey[k].sort((a, b) => a.date.localeCompare(b.date)));
    Object.keys(factByKey).forEach((k) => factByKey[k].sort((a, b) => a.date.localeCompare(b.date)));

    const itemsByFloor = {};
    sewingFloorIds.forEach((fid) => { itemsByFloor[fid] = []; });
    for (const key of keys) {
      const [orderIdStr, floorIdStr] = key.split('-');
      const order_id = parseInt(orderIdStr, 10);
      const floor_id = parseInt(floorIdStr, 10);
      if (!sewingFloorIds.includes(floor_id)) continue;
      if (orderIdFilter != null && order_id !== orderIdFilter) continue;
      const status = statusByKey[key] || 'IN_PROGRESS';
      if (statusFilter !== 'ALL' && status !== statusFilter) continue;
      const order = orderMap[order_id];
      if (!order) continue;
      const clientName = order.Client?.name || '—';
      const orderTitle = order.title || '—';
      const tzCode = order.tz_code || '';
      const modelName = order.model_name || order.title || '—';
      const order_title = tzCode ? `${tzCode} — ${modelName}` : modelName;
      if (q) {
        const term = q.toLowerCase();
        if (
          !orderTitle.toLowerCase().includes(term) &&
          !modelName.toLowerCase().includes(term) &&
          !clientName.toLowerCase().includes(term) &&
          !String(order.id).includes(term) &&
          !(tzCode && tzCode.toLowerCase().includes(term))
        ) continue;
      }
      const plan_rows = planByKey[key] || [];
      const fact_rows = factByKey[key] || [];
      const plan_sum = plan_rows.reduce((s, r) => s + r.plan_qty, 0);
      const fact_sum = fact_rows.reduce((s, r) => s + r.fact_qty, 0);
      if (process.env.NODE_ENV !== 'production' && plan_sum === 0 && keys.has(key)) {
        console.log('[sewing/board] план пустой при наличии ключа (разрыв цепочки?)', { key, order_id, floor_id });
      }
      if (!itemsByFloor[floor_id]) itemsByFloor[floor_id] = [];
      itemsByFloor[floor_id].push({
        order_id,
        order_title,
        client_name: clientName,
        status,
        done_batch_id: doneBatchByKey[key] || null,
        plan_rows,
        fact_rows,
        totals: { plan_sum, fact_sum },
        order_deadline: order.deadline || null,
        workshop_id: order.workshop_id,
      });
    }

    sewingFloorIds.forEach((fid) => {
      if (itemsByFloor[fid]) {
        itemsByFloor[fid].sort((a, b) => {
          const da = a.order_deadline || '9999-12-31';
          const db_ = b.order_deadline || '9999-12-31';
          return da.localeCompare(db_) || (a.order_title || '').localeCompare(b.order_title || '');
        });
      }
    });

    const floors = sewingFloorIds.map((floor_id) => ({
      floor_id,
      items: itemsByFloor[floor_id],
    }));
    res.json({ floors, period: { date_from, date_to } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sewing/tasks
 * Параметры: floor_id, date_from, date_to, status (all|in_progress|done), q, order_id
 * По умолчанию: текущая неделя, status=in_progress (пошив не завершён)
 * Сортировка: дедлайн заказа ASC, дата задачи ASC
 */
router.get('/tasks', async (req, res, next) => {
  try {
    const sewingFloorIds = await getSewingFloorIds();
    const today = new Date().toISOString().slice(0, 10);
    const weekStart = getMonday(today);
    const weekEnd = getSunday(today);

    let date_from = req.query.date_from || weekStart;
    let date_to = req.query.date_to || weekEnd;
    if (date_from > date_to) {
      [date_from, date_to] = [date_to, date_from];
    }

    const floor_id = req.query.floor_id;
    const statusFilter = String(req.query.status || 'in_progress').toLowerCase();
    const q = (req.query.q || '').trim();
    const order_id = req.query.order_id ? Number(req.query.order_id) : null;

    const planWhere = {
      date: { [Op.between]: [date_from, date_to] },
    };
    if (floor_id && floor_id !== 'all') {
      const fid = Number(floor_id);
      if (sewingFloorIds.includes(fid)) planWhere.floor_id = fid;
    }
    if (order_id) planWhere.order_id = order_id;

    let planDays = await db.ProductionPlanDay.findAll({
      where: planWhere,
      include: [
        {
          model: db.Order,
          as: 'Order',
          required: true,
          attributes: ['id', 'title', 'tz_code', 'model_name', 'deadline', 'workshop_id', 'building_floor_id'],
          include: [
            { model: db.Client, as: 'Client', required: false, attributes: ['name'] },
            { model: db.Workshop, as: 'Workshop', required: false, attributes: ['id', 'name', 'floors_count'] },
          ],
        },
        {
          model: db.BuildingFloor,
          as: 'BuildingFloor',
          required: false,
          attributes: ['id', 'name'],
        },
      ],
      order: [],
    });

    // Ограничение технолога по этажу
    if (req.user?.role === 'technologist' && req.allowedBuildingFloorId != null) {
      planDays = planDays.filter((row) => row.Order && (row.floor_id == null || row.floor_id === req.allowedBuildingFloorId));
    }

    const tasks = [];
    for (const row of planDays) {
      const order = row.Order;
      if (!order) continue;

      const planned_qty = Number(row.planned_qty) || 0;
      const actual_qty = Number(row.actual_qty) || 0;
      let status = 'NOT_STARTED';
      if (planned_qty > 0 && actual_qty >= planned_qty) status = 'DONE';
      else if (actual_qty > 0) status = 'IN_PROGRESS';

      if (statusFilter === 'in_progress' && status === 'DONE') continue;
      if (statusFilter === 'done' && status !== 'DONE') continue;

      const clientName = order.Client?.name || '—';
      const orderTitle = order.title || '—';
      const tzCode = order.tz_code || '';
      const modelName = order.model_name || order.title || '—';
      const orderTzModel = tzCode ? `${tzCode} — ${modelName}` : modelName;

      if (q) {
        const term = q.toLowerCase();
        const match =
          orderTitle.toLowerCase().includes(term) ||
          modelName.toLowerCase().includes(term) ||
          clientName.toLowerCase().includes(term) ||
          String(order.id).includes(term) ||
          (tzCode && tzCode.toLowerCase().includes(term));
        if (!match) continue;
      }

      const floorName = row.BuildingFloor?.name || (row.floor_id ? `Этаж ${row.floor_id}` : '—');

      tasks.push({
        id: row.id,
        order_id: order.id,
        order_title: orderTitle,
        order_tz_model: orderTzModel,
        client_name: clientName,
        floor_id: row.floor_id,
        floor_name: floorName,
        date: row.date,
        planned_qty,
        actual_qty,
        status,
        workshop_id: order.workshop_id,
        workshop_name: order.Workshop?.name || null,
        order_deadline: order.deadline || null,
      });
    }

    // Дополнительно: заказы с завершённым раскроем по производственным этажам, которых ещё нет в плане
    const seenOrderFloor = new Set(tasks.map((t) => `${t.order_id}-${t.floor_id ?? 'n'}`));
    const cuttingDone = await db.CuttingTask.findAll({
      where: {
        status: 'Готово',
        floor: { [Op.in]: sewingFloorIds },
      },
      attributes: ['order_id', 'floor'],
      raw: true,
    });
    const orderFloorFromCutting = [];
    const seenCut = new Set();
    for (const c of cuttingDone) {
      if (order_id != null && c.order_id !== order_id) continue;
      const fid = c.floor;
      const key = `${c.order_id}-${fid}`;
      if (seenOrderFloor.has(key) || seenCut.has(key)) continue;
      seenCut.add(key);
      orderFloorFromCutting.push({ order_id: c.order_id, floor_id: fid });
    }
    if (orderFloorFromCutting.length > 0) {
      const orderIds = [...new Set(orderFloorFromCutting.map((o) => o.order_id))];
      const orders = await db.Order.findAll({
        where: { id: orderIds },
        attributes: ['id', 'title', 'tz_code', 'model_name', 'deadline', 'workshop_id'],
        include: [
          { model: db.Client, as: 'Client', required: false, attributes: ['name'] },
          { model: db.Workshop, as: 'Workshop', required: false, attributes: ['id', 'name'] },
        ],
      });
      const orderMap = {};
      orders.forEach((o) => { orderMap[o.id] = o; });
      const floors = await db.BuildingFloor.findAll({
        where: { id: sewingFloorIds },
        attributes: ['id', 'name'],
      });
      const floorNameById = {};
      floors.forEach((f) => { floorNameById[f.id] = f.name; });
      for (const { order_id, floor_id } of orderFloorFromCutting) {
        const order = orderMap[order_id];
        if (!order) continue;
        if (req.user?.role === 'technologist' && req.allowedBuildingFloorId != null && req.allowedBuildingFloorId !== floor_id) continue;
        const clientName = order.Client?.name || '—';
        const orderTitle = order.title || '—';
        const tzCode = order.tz_code || '';
        const modelName = order.model_name || order.title || '—';
        const orderTzModel = tzCode ? `${tzCode} — ${modelName}` : modelName;
        if (q) {
          const term = q.toLowerCase();
          const match =
            orderTitle.toLowerCase().includes(term) ||
            modelName.toLowerCase().includes(term) ||
            clientName.toLowerCase().includes(term) ||
            String(order.id).includes(term) ||
            (tzCode && tzCode.toLowerCase().includes(term));
          if (!match) continue;
        }
        const floorName = floorNameById[floor_id] || `Этаж ${floor_id}`;
        let d = new Date(date_from + 'T12:00:00');
        const end = new Date(date_to + 'T12:00:00');
        while (d <= end) {
          const dateStr = d.toISOString().slice(0, 10);
          const syntheticId = `cut-${order_id}-${floor_id}-${dateStr}`;
          tasks.push({
            id: syntheticId,
            order_id: order.id,
            order_title: orderTitle,
            order_tz_model: orderTzModel,
            client_name: clientName,
            floor_id,
            floor_name: floorName,
            date: dateStr,
            planned_qty: 0,
            actual_qty: 0,
            status: 'NOT_STARTED',
            workshop_id: order.workshop_id,
            workshop_name: order.Workshop?.name || null,
            order_deadline: order.deadline || null,
          });
          d.setDate(d.getDate() + 1);
        }
      }
    }

    // Сортировка: дедлайн заказа ASC, дата задачи ASC
    tasks.sort((a, b) => {
      const deadlineA = a.order_deadline || '9999-12-31';
      const deadlineB = b.order_deadline || '9999-12-31';
      if (deadlineA !== deadlineB) return deadlineA.localeCompare(deadlineB);
      return (a.date || '').localeCompare(b.date || '');
    });

    res.json({ tasks, period: { date_from, date_to } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sewing/complete-status?order_id=&floor_id=
 * Проверка: завершён ли пошив по заказу (и этажу). Партия DONE уже создана.
 */
router.get('/complete-status', async (req, res, next) => {
  try {
    const order_id = req.query.order_id ? Number(req.query.order_id) : null;
    const floor_id = req.query.floor_id != null && req.query.floor_id !== '' ? Number(req.query.floor_id) : null;
    if (!order_id) return res.status(400).json({ error: 'Укажите order_id' });

    const where = { order_id, status: 'DONE' };
    if (floor_id != null && floor_id !== '') where.floor_id = Number(floor_id);

    const batch = await db.SewingBatch.findOne({ where, attributes: ['id'] });
    res.json({ completed: !!batch });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sewing/complete
 * Ежедневное поступление в ОТК: партия по периоду date_from/date_to.
 * fact_sum и plan_sum считаются по фильтру df/dt. Завершение разрешено при fact_sum > 0 (без требования закрыть весь план).
 * Дубликат за тот же (order_id, floor_id, date_from, date_to) — возврат существующего batch_id.
 * Body: { order_id, floor_id, date_from?, date_to? }
 * Ответ: { ok: true, batch_id }
 */
router.post('/complete', async (req, res, next) => {
  try {
    const sewingFloorIds = await getSewingFloorIds();
    const { order_id, floor_id, date_from, date_to } = req.body;
    if (!order_id || floor_id == null || floor_id === '') {
      return res.status(400).json({ error: 'Укажите order_id и floor_id' });
    }
    const effectiveFloorId = Number(floor_id);
    if (!sewingFloorIds.includes(effectiveFloorId)) {
      return res.status(400).json({ error: 'Укажите этаж пошива (производственный этаж).' });
    }

    const df = date_from ? String(date_from).slice(0, 10) : null;
    const dt = date_to ? String(date_to).slice(0, 10) : null;
    const replacements = {
      order_id: Number(order_id),
      floor_id: effectiveFloorId,
      df,
      dt,
    };

    const order = await db.Order.findByPk(Number(order_id), {
      attributes: ['id', 'model_id', 'workshop_id'],
    });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    const [factAgg] = await db.sequelize.query(
      `SELECT COALESCE(SUM(fact_qty), 0)::int AS fact_sum
       FROM sewing_fact
       WHERE order_id = :order_id AND floor_id = :floor_id
         AND (:df IS NULL OR date >= :df)
         AND (:dt IS NULL OR date <= :dt)`,
      { replacements }
    );
    const fact_sum = Number(factAgg?.[0]?.fact_sum) || 0;

    if (fact_sum <= 0) {
      return res.status(400).json({
        error: 'Нет факта пошива за выбранный период. Введите факт по датам и нажмите «Сохранить факты».',
      });
    }

    const [planAgg] = await db.sequelize.query(
      `SELECT COALESCE(SUM(planned_qty), 0)::int AS plan_sum
       FROM production_plan_day
       WHERE order_id = :order_id AND floor_id = :floor_id
         AND (:df IS NULL OR date >= :df)
         AND (:dt IS NULL OR date <= :dt)`,
      { replacements }
    );
    const plan_sum = Number(planAgg?.[0]?.plan_sum) || 0;

    // Не допускать дублей за тот же период: если партия уже есть — вернуть её batch_id
    if (df != null && dt != null) {
      const existingBatch = await db.SewingBatch.findOne({
        where: {
          order_id: Number(order_id),
          floor_id: effectiveFloorId,
          date_from: df,
          date_to: dt,
        },
        attributes: ['id'],
      });
      if (existingBatch) {
        return res.status(200).json({ ok: true, batch_id: existingBatch.id });
      }
    }

    const t = await db.sequelize.transaction();
    try {
      const now = new Date();
      const dfStr = (df || now.toISOString().slice(0, 10)).replace(/-/g, '');
      const dtStr = (dt || df || now.toISOString().slice(0, 10)).replace(/-/g, '');
      const batchCode = `AUTO-${order_id}-${effectiveFloorId}-${dfStr}-${dtStr}`;

      const batch = await db.SewingBatch.create(
        {
          order_id: Number(order_id),
          model_id: order.model_id || null,
          floor_id: effectiveFloorId,
          batch_code: batchCode,
          date_from: df || null,
          date_to: dt || null,
          qty: fact_sum,
          started_at: now,
          finished_at: now,
          status: 'READY_FOR_QC',
        },
        { transaction: t }
      );

      // Одна запись в sewing_batch_items с общим количеством (fact_sum). sewing_fact не содержит model_size_id — берём размер модели заказа.
      let model_size_id = null;
      if (order.model_id) {
        const firstSize = await db.ModelSize.findOne({
          where: { model_id: order.model_id },
          attributes: ['id', 'size_id'],
        });
        if (firstSize) model_size_id = firstSize.id;
      }
      if (model_size_id == null) {
        const anySize = await db.ModelSize.findOne({ attributes: ['id', 'size_id'], order: [['id']] });
        if (anySize) model_size_id = anySize.id;
      }
      if (model_size_id == null) {
        await t.rollback();
        return res.status(400).json({
          error: 'В справочнике нет размеров модели. Добавьте модель и размеры (Склад → Модели изделий), затем завершите пошив снова.',
        });
      }
      const sizeId = (await db.ModelSize.findByPk(model_size_id, { attributes: ['size_id'], raw: true }))?.size_id ?? null;
      await db.SewingBatchItem.create(
        {
          batch_id: batch.id,
          model_size_id,
          size_id: sizeId,
          planned_qty: plan_sum,
          fact_qty: fact_sum,
        },
        { transaction: t }
      );

      // Ежедневная партия: не переводим sewing_order_floors и order_stages в DONE — партия сразу в pending ОТК
      await t.commit();
      res.json({ ok: true, batch_id: batch.id });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/sewing/ensure-batch удалён: партия создаётся только через POST /api/sewing/complete (факт из sewing_fact).

module.exports = router;
