/**
 * Роуты пошива: очередь задач по этажам
 * GET /tasks — список задач (план/факт по дням) с фильтрами
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

const SEWING_FLOOR_IDS = [2, 3, 4];

/**
 * GET /api/sewing/board
 * Единый список для UI Пошив: статус из sewing_order_floors, план/факт из production_plan_day.
 * Параметры: status (IN_PROGRESS | DONE | all), date_from, date_to, q
 * Ответ: { floors: [ { floor_id, items: [ { order_id, order_title, client_name, status, done_batch_id, plan_rows, fact_rows, totals } ] } ], period: { date_from, date_to } }
 */
router.get('/board', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const weekStart = getMonday(today);
    const weekEnd = getSunday(today);
    let date_from = req.query.date_from || weekStart;
    let date_to = req.query.date_to || weekEnd;
    if (date_from > date_to) [date_from, date_to] = [date_to, date_from];
    const statusFilter = (req.query.status || 'IN_PROGRESS').toUpperCase();
    const q = (req.query.q || '').trim();

    // Все пары (order_id, floor_id) по плану в диапазоне дат (только этажи 2–4)
    const planDays = await db.ProductionPlanDay.findAll({
      where: {
        date: { [Op.between]: [date_from, date_to] },
        floor_id: { [Op.in]: SEWING_FLOOR_IDS },
      },
      attributes: ['order_id', 'floor_id', 'date', 'planned_qty', 'actual_qty'],
      raw: true,
    });
    const keys = new Set();
    planDays.forEach((r) => keys.add(`${r.order_id}-${r.floor_id}`));

    // Добавить пары из sewing_order_floors (завершённые без плана в диапазоне)
    const orderFloors = await db.SewingOrderFloor.findAll({
      where: { floor_id: { [Op.in]: SEWING_FLOOR_IDS } },
      attributes: ['order_id', 'floor_id', 'status', 'done_batch_id'],
      raw: true,
    });
    orderFloors.forEach((r) => keys.add(`${r.order_id}-${r.floor_id}`));

    // Добавить пары из раскроя (Готово), чтобы показывать в «В работе»
    const cuttingDone = await db.CuttingTask.findAll({
      where: { status: 'Готово', floor: { [Op.in]: SEWING_FLOOR_IDS } },
      attributes: ['order_id', 'floor'],
      raw: true,
    });
    cuttingDone.forEach((r) => keys.add(`${r.order_id}-${r.floor}`));

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

    const planByKey = {};
    const factByKey = {};
    planDays.forEach((r) => {
      const k = `${r.order_id}-${r.floor_id}`;
      if (!planByKey[k]) planByKey[k] = [];
      planByKey[k].push({ date: r.date, plan_qty: Number(r.planned_qty) || 0 });
      if (!factByKey[k]) factByKey[k] = [];
      factByKey[k].push({ date: r.date, fact_qty: Number(r.actual_qty) || 0 });
    });

    const itemsByFloor = { 2: [], 3: [], 4: [] };
    for (const key of keys) {
      const [orderIdStr, floorIdStr] = key.split('-');
      const order_id = parseInt(orderIdStr, 10);
      const floor_id = parseInt(floorIdStr, 10);
      if (!SEWING_FLOOR_IDS.includes(floor_id)) continue;
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

    SEWING_FLOOR_IDS.forEach((fid) => {
      itemsByFloor[fid].sort((a, b) => {
        const da = a.order_deadline || '9999-12-31';
        const db_ = b.order_deadline || '9999-12-31';
        return da.localeCompare(db_) || (a.order_title || '').localeCompare(b.order_title || '');
      });
    });

    const floors = SEWING_FLOOR_IDS.map((floor_id) => ({
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
      if (fid >= 1 && fid <= 4) planWhere.floor_id = fid;
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

    // Дополнительно: заказы с завершённым раскроем (статус «Готово») по этажам 2–4,
    // которых ещё нет в плане — показываем в Пошиве, чтобы можно было ввести факт без предварительного планирования.
    const seenOrderFloor = new Set(tasks.map((t) => `${t.order_id}-${t.floor_id ?? 'n'}`));
    const cuttingDone = await db.CuttingTask.findAll({
      where: {
        status: 'Готово',
        floor: { [Op.in]: [2, 3, 4] },
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
        where: { id: [2, 3, 4] },
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
 * Завершить пошив: факт >= план, создать партию DONE, обновить sewing_order_floors.
 * Body: { order_id, floor_id, date_from?, date_to? }
 * Ответ: { ok: true, batch_id }
 */
router.post('/complete', async (req, res, next) => {
  try {
    const { order_id, floor_id, date_from, date_to } = req.body;
    if (!order_id || floor_id == null || floor_id === '') {
      return res.status(400).json({ error: 'Укажите order_id и floor_id' });
    }
    const effectiveFloorId = Number(floor_id);
    if (!SEWING_FLOOR_IDS.includes(effectiveFloorId)) {
      return res.status(400).json({ error: 'Укажите этаж пошива (2, 3 или 4).' });
    }

    const order = await db.Order.findByPk(Number(order_id), {
      attributes: ['id', 'model_id', 'workshop_id'],
    });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    // Суммируем план/факт по всем дням для этого заказа и этажа (не только за выбранный период)
    const planRows = await db.ProductionPlanDay.findAll({
      where: { order_id: Number(order_id), floor_id: effectiveFloorId },
      attributes: ['planned_qty', 'actual_qty'],
      raw: true,
    });
    const total_plan = planRows.reduce((s, r) => s + (Number(r.planned_qty) || 0), 0);
    const total_fact = planRows.reduce((s, r) => s + (Number(r.actual_qty) || 0), 0);

    if (total_fact < total_plan) {
      return res.status(400).json({ error: 'Факт меньше плана. Завершение невозможно.' });
    }
    if (total_fact <= 0) {
      return res.status(400).json({ error: 'Нет факта пошива. Введите факт по датам и нажмите «Сохранить факт».' });
    }

    const existingDone = await db.SewingOrderFloor.findOne({
      where: { order_id: Number(order_id), floor_id: effectiveFloorId, status: 'DONE' },
    });
    if (existingDone) {
      return res.status(400).json({ error: 'Пошив по этому заказу и этажу уже завершён.', batch_id: existingDone.done_batch_id });
    }

    const t = await db.sequelize.transaction();
    try {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const batchCode = `AUTO-${order_id}-${effectiveFloorId}-${todayStr}`;

      const batch = await db.SewingBatch.create(
        {
          order_id: Number(order_id),
          model_id: order.model_id || null,
          floor_id: effectiveFloorId,
          batch_code: batchCode,
          started_at: now,
          finished_at: now,
          status: 'DONE',
        },
        { transaction: t }
      );

      const replacements = { order_id: Number(order_id), floor_id: effectiveFloorId };
      let dateClause = '';
      if (date_from && date_to) {
        dateClause = ' AND date BETWEEN :date_from AND :date_to';
        replacements.date_from = String(date_from).slice(0, 10);
        replacements.date_to = String(date_to).slice(0, 10);
      }
      const [sizeRows] = await db.sequelize.query(
        `SELECT model_size_id, SUM(fact_qty)::numeric AS fact_qty
         FROM sewing_plans
         WHERE order_id = :order_id AND floor_id = :floor_id ${dateClause}
         GROUP BY model_size_id
         HAVING SUM(fact_qty) > 0`,
        { replacements, transaction: t }
      );

      if (sizeRows && sizeRows.length > 0) {
        const modelSizeIds = [...new Set(sizeRows.map((r) => r.model_size_id))];
        const modelSizes = await db.ModelSize.findAll({
          where: { id: modelSizeIds },
          attributes: ['id', 'size_id'],
          raw: true,
        });
        const sizeIdByModel = {};
        modelSizes.forEach((ms) => { sizeIdByModel[ms.id] = ms.size_id || null; });
        for (const row of sizeRows) {
          const factQty = Number(row.fact_qty) || 0;
          if (factQty <= 0) continue;
          await db.SewingBatchItem.create(
            {
              batch_id: batch.id,
              model_size_id: row.model_size_id,
              size_id: sizeIdByModel[row.model_size_id] ?? null,
              planned_qty: 0,
              fact_qty: factQty,
            },
            { transaction: t }
          );
        }
      } else {
        let model_size_id = null;
        if (order.model_id) {
          const firstSize = await db.ModelSize.findOne({
            where: { model_id: order.model_id },
            attributes: ['id'],
          });
          if (firstSize) model_size_id = firstSize.id;
        }
        if (model_size_id == null) {
          const anySize = await db.ModelSize.findOne({ attributes: ['id'], order: [['id']] });
          if (anySize) model_size_id = anySize.id;
        }
        await db.SewingBatchItem.create(
          {
            batch_id: batch.id,
            model_size_id,
            size_id: null,
            planned_qty: total_plan,
            fact_qty: total_fact,
          },
          { transaction: t }
        );
      }

      await db.SewingOrderFloor.upsert(
        {
          order_id: Number(order_id),
          floor_id: effectiveFloorId,
          status: 'DONE',
          done_at: now,
          done_batch_id: batch.id,
        },
        { transaction: t, conflictFields: ['order_id', 'floor_id'] }
      );

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

module.exports = router;
