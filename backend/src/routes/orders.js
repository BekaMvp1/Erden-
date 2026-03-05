/**
 * Роуты заказов
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { logAudit } = require('../utils/audit');
const { trySyncOrderToCloud, queueOrderForSync } = require('../services/cloudSync');
const { STAGES, DEFAULT_STAGE_DAYS } = require('../constants/boardStages');
const { PIPELINE_STAGES, PIPELINE_DISPLAY } = require('../constants/pipelineStages');
const { normalizeSizeCode, findSizeIdByCode } = require('../utils/sizeNormalize');

const router = express.Router();

/**
 * Добавить дни к дате в формате YYYY-MM-DD
 */
function addDaysToIso(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Нормализация строки для поиска по ключевым словам
 */
function normalizeText(value) {
  return String(value || '').toLowerCase();
}

/**
 * Собрать заголовок заказа из TZ/MODEL
 */
function buildOrderTitle(tzCode, modelName) {
  const tz = String(tzCode || '').trim();
  const model = String(modelName || '').trim();
  if (tz && model) return `${tz} — ${model}`;
  if (tz) return tz;
  if (model) return model;
  return '';
}

/**
 * Нормализовать поля TZ/MODEL с обратной совместимостью по title
 */
function resolveOrderNameFields({ title, tz_code, model_name }) {
  const rawTitle = String(title || '').trim();
  let tzCode = String(tz_code || '').trim();
  let modelName = String(model_name || '').trim();

  if ((!tzCode || !modelName) && rawTitle.includes('—')) {
    const [left, ...right] = rawTitle.split('—');
    tzCode = tzCode || String(left || '').trim();
    modelName = modelName || String(right.join('—') || '').trim();
  }
  if ((!tzCode || !modelName) && rawTitle.includes('-')) {
    const [left, ...right] = rawTitle.split('-');
    tzCode = tzCode || String(left || '').trim();
    modelName = modelName || String(right.join('-') || '').trim();
  }

  const finalTitle = buildOrderTitle(tzCode, modelName) || rawTitle;
  return { title: finalTitle, tz_code: tzCode, model_name: modelName };
}

const PROCUREMENT_VALID_STATUSES = ['draft', 'sent', 'received'];
const PROCUREMENT_VALID_UNITS = ['шт', 'метр', 'кг', 'тонн', 'рулон'];

/**
 * Сформировать итоговый title из TZ/MODEL
 */
function buildOrderTitle(tzCode, modelName, fallbackTitle) {
  const tz = String(tzCode || '').trim();
  const model = String(modelName || '').trim();
  if (tz && model) return `${tz} — ${model}`;
  if (fallbackTitle != null && String(fallbackTitle).trim()) return String(fallbackTitle).trim();
  return [tz, model].filter(Boolean).join(' — ');
}

/**
 * Нормализация единиц измерения
 */
function normalizeProcurementUnit(unit) {
  const value = String(unit || '').trim().toLowerCase();
  if (!value) return null;
  const map = {
    'рулон': 'рулон',
    'рулоны': 'рулон',
    'kg': 'кг',
    'кг': 'кг',
    'тонн': 'тонн',
    'тонна': 'тонн',
    'тонны': 'тонн',
    'метр': 'метр',
    'м': 'метр',
    'шт': 'шт',
    'штук': 'шт',
    'РУЛОН': 'рулон',
    'КГ': 'кг',
    'ТОННА': 'тонн',
  };
  return map[value] || null;
}

function toDecimalNumber(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const factor = 10 ** digits;
  return Math.round(num * factor) / factor;
}

/**
 * Подбор operation_id для этапов панели
 */
async function resolveStageOperationIds(transaction) {
  const operations = await db.Operation.findAll({
    attributes: ['id', 'name', 'category'],
    transaction,
    raw: true,
  });
  if (!operations.length) {
    throw new Error('В справочнике операций нет данных. Невозможно создать этапы заказа.');
  }

  const byName = (keywords) =>
    operations.find((op) => keywords.some((k) => normalizeText(op.name).includes(k)))?.id;
  const byCategory = (category) =>
    operations.find((op) => String(op.category || '').toUpperCase() === category)?.id;
  const firstOperationId = operations[0].id;

  return {
    procurement: byName(['закуп']) || firstOperationId,
    warehouse: byName(['склад']) || firstOperationId,
    cutting: byName(['раскрой', 'крой']) || byCategory('CUTTING') || firstOperationId,
    sewing: byName(['пошив', 'стач', 'шв']) || byCategory('SEWING') || firstOperationId,
    qc: byName(['отк', 'контрол']) || byCategory('FINISH') || firstOperationId,
    packing: byName(['упаков']) || firstOperationId,
    fg_warehouse: byName(['склад гп', 'гп']) || firstOperationId,
    shipping: byName(['отгруз']) || firstOperationId,
  };
}

/**
 * POST /api/orders
 * Создание заказа (статус = Принят, без распределения)
 * Формат с вариантами: client_id, tz_code, model_name, total_quantity, deadline, planned_month, floor_id, sizes[], variants[]
 * Формат legacy: client_id, title, quantity, deadline, planned_month, floor_id, color (без матрицы)
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      client_id,
      title,
      tz_code,
      model_name,
      article,
      quantity,
      total_quantity,
      deadline,
      comment,
      planned_month,
      floor_id,
      workshop_id,
      color,
      size_in_numbers,
      size_in_letters,
      sizes,
      variants,
      photos,
      start_date,
    } = req.body;

    const nameFields = resolveOrderNameFields({ title, tz_code, model_name });
    if (!client_id || !nameFields.title || !deadline) {
      return res.status(400).json({ error: 'Укажите client_id, tz_code, model_name, deadline' });
    }
    if (!nameFields.tz_code || !nameFields.model_name) {
      return res.status(400).json({ error: 'Поля "ТЗ / Код модели" и "Название модели" обязательны' });
    }
    if (!planned_month) {
      return res.status(400).json({ error: 'Укажите planned_month (месяц плана)' });
    }
    if (!workshop_id) {
      return res.status(400).json({ error: 'Укажите workshop_id (цех)' });
    }

    const statusAccepted = await db.OrderStatus.findOne({ where: { name: 'Принят' } });
    if (!statusAccepted) {
      return res.status(500).json({ error: 'Статус "Принят" не найден в справочнике' });
    }

    let qty;
    let sizeIdsMap = {};
    let variantsToInsert = [];

    // Режим с матрицей цвет×размер
    if (sizes && Array.isArray(sizes) && variants && Array.isArray(variants)) {
      const totalQty = parseInt(total_quantity, 10);
      if (isNaN(totalQty) || totalQty <= 0) {
        return res.status(400).json({ error: 'total_quantity должно быть > 0' });
      }
      if (sizes.length === 0) {
        return res.status(400).json({ error: 'Укажите хотя бы один размер' });
      }
      if (variants.length === 0) {
        return res.status(400).json({ error: 'Укажите хотя бы один вариант (цвет+размер+количество)' });
      }

      // Проверка дублей и суммы
      const seen = new Set();
      let sumQty = 0;
      for (const v of variants) {
        const colorStr = String(v.color || '').trim();
        const sizeStr = String(v.size || '').trim();
        const q = parseInt(v.quantity, 10) || 0;
        if (q < 0) {
          return res.status(400).json({ error: `Количество не может быть отрицательным: ${colorStr} / ${sizeStr}` });
        }
        const key = `${colorStr}|${sizeStr}`;
        if (seen.has(key)) {
          return res.status(400).json({ error: `Дубликат: цвет "${colorStr}" и размер "${sizeStr}"` });
        }
        seen.add(key);
        sumQty += q;
      }
      if (sumQty !== totalQty) {
        return res.status(400).json({
          error: `Сумма матрицы (${sumQty}) не равна общему количеству (${totalQty})`,
        });
      }

      // Получаем или создаём размеры
      for (const sizeName of sizes) {
        const name = String(sizeName || '').trim();
        if (!name) continue;
        let size = await db.Size.findOne({ where: { name } });
        if (!size) {
          size = await db.Size.create({ name, is_active: true });
        }
        sizeIdsMap[name] = size.id;
      }

      variantsToInsert = variants
        .filter((v) => (parseInt(v.quantity, 10) || 0) > 0)
        .map((v) => ({
          color: String(v.color || '').trim(),
          size: String(v.size || '').trim(),
          quantity: parseInt(v.quantity, 10) || 0,
        }));

      for (const v of variantsToInsert) {
        if (!sizeIdsMap[v.size]) {
          return res.status(400).json({ error: `Размер "${v.size}" не найден в списке размеров заказа` });
        }
      }

      qty = totalQty;
    } else {
      // Legacy: один цвет, общее количество
      if (!quantity && !total_quantity) {
        return res.status(400).json({ error: 'Укажите quantity или total_quantity' });
      }
      qty = parseInt(quantity || total_quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ error: 'Количество должно быть > 0' });
      }
      if (!color || String(color).trim() === '') {
        return res.status(400).json({ error: 'Укажите color (цвет изделия)' });
      }
    }

    const t = await db.sequelize.transaction();
    let order;
    try {
      const photosArr = Array.isArray(photos) ? photos.filter((p) => typeof p === 'string' && p.length > 0 && p.length < 4 * 1024 * 1024).slice(0, 10) : [];
      order = await db.Order.create(
        {
          client_id: parseInt(client_id, 10),
          title: nameFields.title,
          tz_code: nameFields.tz_code,
          model_name: nameFields.model_name,
          article: article ? String(article).trim() : null,
          quantity: qty,
          total_quantity: qty,
          deadline,
          comment: comment || null,
          planned_month: String(planned_month).trim(),
          workshop_id: parseInt(workshop_id, 10),
          floor_id: floor_id ? parseInt(floor_id, 10) : null,
          color: color ? String(color).trim() : null,
          size_in_numbers: size_in_numbers ? String(size_in_numbers).trim() : null,
          size_in_letters: size_in_letters ? String(size_in_letters).trim() : null,
          status_id: statusAccepted.id,
          photos: photosArr,
        },
        { transaction: t }
      );

      for (const v of variantsToInsert) {
        await db.OrderVariant.create(
          {
            order_id: order.id,
            color: v.color,
            size_id: sizeIdsMap[v.size],
            quantity: v.quantity,
          },
          { transaction: t }
        );
      }

      // Закуп создаётся при сохранении плана (без черновика)

      // Создаём 8 этапов панели с плановыми сроками
      const operationIdsByStage = await resolveStageOperationIds(t);
      const startDateIso =
        start_date && /^\d{4}-\d{2}-\d{2}$/.test(String(start_date))
          ? String(start_date)
          : new Date().toISOString().slice(0, 10);
      let currentDate = startDateIso;

      for (const stage of STAGES) {
        const stageKey = stage.key;
        const days = Math.max(0, Number(DEFAULT_STAGE_DAYS[stageKey]) || 0);
        const plannedStartDate = currentDate;
        const plannedEndDate = days > 0 ? addDaysToIso(plannedStartDate, days - 1) : null;

        await db.OrderOperation.create(
          {
            order_id: order.id,
            operation_id: operationIdsByStage[stageKey],
            status: 'Ожидает',
            planned_quantity: qty,
            actual_quantity: 0,
            stage_key: stageKey,
            planned_qty: qty,
            actual_qty: 0,
            planned_start_date: plannedStartDate,
            planned_end_date: plannedEndDate,
            planned_days: days,
            actual_start_date: null,
            actual_end_date: null,
          },
          { transaction: t }
        );

        currentDate = plannedEndDate ? addDaysToIso(plannedEndDate, 1) : currentDate;
      }

      // Производственная цепочка: Закуп → Планирование → Раскрой → Пошив → ОТК → Склад → Отгрузка
      const now = new Date();
      for (const stageKey of PIPELINE_STAGES) {
        await db.OrderStage.create(
          {
            order_id: order.id,
            stage_key: stageKey,
            status: stageKey === 'procurement' ? 'IN_PROGRESS' : 'NOT_STARTED',
            started_at: stageKey === 'procurement' ? now : null,
            completed_at: null,
            meta: null,
          },
          { transaction: t }
        );
      }

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    await logAudit(req.user.id, 'CREATE', 'order', order.id);

    if (process.env.SYNC_TO_CLOUD === 'true' && process.env.CLOUD_DATABASE_URL) {
      const synced = await trySyncOrderToCloud(order);
      if (!synced) {
        try {
          await queueOrderForSync(order, 'Initial sync failed');
        } catch (qErr) {
          console.error('Queue order for sync failed:', qErr.message);
        }
      }
    }

    const full = await db.Order.findByPk(order.id, {
      include: [
        { model: db.Client, as: 'Client' },
        { model: db.OrderStatus, as: 'OrderStatus' },
        { model: db.OrderVariant, as: 'OrderVariants', include: [{ model: db.Size, as: 'Size' }] },
      ],
    });

    res.status(201).json(full);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders
 * Список заказов с фильтрацией (status_id, search по клиенту и названию, пагинация)
 * search — ILIKE по clients.name, orders.title, orders.tz_code, orders.model_name
 */
router.get('/', async (req, res, next) => {
  try {
    const ordersCount = await db.Order.count();
    console.log('Orders count in DB:', ordersCount);

    const { status_id, floor_id, client_id, search, page, limit } = req.query;
    const andConditions = [];

    if (status_id) andConditions.push({ status_id });
    if (floor_id) andConditions.push({ floor_id });
    if (client_id) andConditions.push({ client_id });

    // Ограничение для технолога: свой этаж или нераспределённые (floor_id = null)
    if (req.user.role === 'technologist' && req.allowedFloorId) {
      andConditions.push({ [Op.or]: [{ floor_id: null }, { floor_id: req.allowedFloorId }] });
    }

    // Ограничение для оператора (швеи) — только заказы со своими операциями
    if (req.user.role === 'operator' && req.user.Sewer) {
      const myOrderIds = await db.OrderOperation.findAll({
        where: { sewer_id: req.user.Sewer.id },
        attributes: ['order_id'],
        raw: true,
      }).then((rows) => [...new Set(rows.map((r) => r.order_id))]);
      if (myOrderIds.length === 0) {
        return res.json([]);
      }
      andConditions.push({ id: { [Op.in]: myOrderIds } });
    }

    // Поиск по клиенту и названию (ILIKE, нечувствительно к регистру)
    if (search && String(search).trim()) {
      const term = `%${String(search).trim()}%`;
      andConditions.push({
        [Op.or]: [
          { '$Client.name$': { [Op.iLike]: term } },
          { title: { [Op.iLike]: term } },
          { tz_code: { [Op.iLike]: term } },
          { model_name: { [Op.iLike]: term } },
        ],
      });
    }

    const where = andConditions.length > 0 ? { [Op.and]: andConditions } : {};

    const include = [
      { model: db.Client, as: 'Client', required: !!search },
      { model: db.OrderStatus, as: 'OrderStatus' },
      { model: db.Floor, as: 'Floor' },
      { model: db.BuildingFloor, as: 'BuildingFloor' },
      { model: db.Technologist, as: 'Technologist', include: [{ model: db.User, as: 'User' }] },
    ];

    const order = [['created_at', 'DESC']];
    const limitVal = limit ? Math.min(parseInt(limit, 10) || 100, 500) : undefined;
    const offsetVal = page && limitVal ? (Math.max(1, parseInt(page, 10)) - 1) * limitVal : undefined;

    const options = { where, include, order };
    if (limitVal) options.limit = limitVal;
    if (offsetVal !== undefined) options.offset = offsetVal;

    const orders = await db.Order.findAll(options);

    res.json(orders);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders/by-workshop?workshop_id=
 * Список заказов (моделей) по цеху для планирования.
 * Только активные заказы (не «Готово»), сортировка по client_name, title.
 */
router.get('/by-workshop', async (req, res, next) => {
  try {
    const workshopId = req.query.workshop_id;
    if (!workshopId) return res.status(400).json({ error: 'Укажите workshop_id' });

    const statusReady = await db.OrderStatus.findOne({ where: { name: 'Готов' }, attributes: ['id'] });
    const where = { workshop_id: Number(workshopId) };
    if (statusReady) {
      where.status_id = { [Op.ne]: statusReady.id };
    }

    const orders = await db.Order.findAll({
      where,
      include: [{ model: db.Client, as: 'Client' }],
      order: [
        [db.Client, 'name', 'ASC'],
        ['title', 'ASC'],
      ],
      attributes: ['id', 'title', 'client_id'],
    });

    const result = orders.map((o) => ({
      id: o.id,
      title: o.title,
      client_name: o.Client?.name || '—',
    }));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders/:id/stages
 * Статусы этапов пайплайна заказа (источник истины: order_stages).
 * Если записей нет (старые заказы) — создаём с procurement IN_PROGRESS и возвращаем.
 */
router.get('/:id/stages', async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    if (!orderId) return res.status(400).json({ error: 'Некорректный id заказа' });

    let stages = await db.OrderStage.findAll({
      where: { order_id: orderId },
      attributes: ['id', 'order_id', 'stage_key', 'status', 'started_at', 'completed_at', 'meta'],
      raw: true,
    });

    if (!stages || stages.length === 0) {
      const order = await db.Order.findByPk(orderId);
      if (!order) return res.status(404).json({ error: 'Заказ не найден' });
      const now = new Date();
      for (const stageKey of PIPELINE_STAGES) {
        await db.OrderStage.create({
          order_id: orderId,
          stage_key: stageKey,
          status: stageKey === 'procurement' ? 'IN_PROGRESS' : 'NOT_STARTED',
          started_at: stageKey === 'procurement' ? now : null,
          completed_at: null,
          meta: null,
        });
      }
      stages = await db.OrderStage.findAll({
        where: { order_id: orderId },
        attributes: ['id', 'order_id', 'stage_key', 'status', 'started_at', 'completed_at', 'meta'],
        raw: true,
      });
    }

    // Дозаполнить этап planning для старых заказов (если его не было)
    const hasPlanning = stages.some((s) => s.stage_key === 'planning');
    if (!hasPlanning) {
      await db.OrderStage.create({
        order_id: orderId,
        stage_key: 'planning',
        status: 'NOT_STARTED',
        started_at: null,
        completed_at: null,
        meta: null,
      });
      stages = await db.OrderStage.findAll({
        where: { order_id: orderId },
        attributes: ['id', 'order_id', 'stage_key', 'status', 'started_at', 'completed_at', 'meta'],
        raw: true,
      });
    }

    // Порядок: Закуп → Планирование → Раскрой → Пошив → ОТК → Склад → Отгрузка
    const orderByKey = {};
    PIPELINE_DISPLAY.forEach((p, i) => { orderByKey[p.key] = i; });
    stages.sort((a, b) => (orderByKey[a.stage_key] ?? 99) - (orderByKey[b.stage_key] ?? 99));

    res.json(stages);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders/:id/procurement
 * Возвращает данные закупа по заказу (пустой draft, если заявки ещё нет)
 */
router.get('/:id/procurement', async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    if (!orderId) return res.status(400).json({ error: 'Некорректный id заказа' });

    const order = await db.Order.findByPk(orderId, {
      include: [{ model: db.Client, as: 'Client', attributes: ['id', 'name'] }],
    });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const orderFloor = order.building_floor_id ?? order.floor_id;
      if (orderFloor != null && Number(orderFloor) !== Number(req.allowedFloorId)) {
        return res.status(403).json({ error: 'Нет доступа к закупу этого заказа' });
      }
    }
    if (req.user.role === 'operator') {
      const hasMyOps = await db.OrderOperation.count({
        where: { order_id: order.id, sewer_id: req.user.Sewer?.id },
      });
      if (req.user.Sewer && !hasMyOps) {
        return res.status(403).json({ error: 'Нет доступа к закупу этого заказа' });
      }
    }

    let request = await db.ProcurementRequest.findOne({
      where: { order_id: order.id },
      include: [{ model: db.ProcurementItem, as: 'ProcurementItems' }],
      order: [[{ model: db.ProcurementItem, as: 'ProcurementItems' }, 'id', 'ASC']],
    });

    if (!request) {
      return res.json({
        order_id: order.id,
        order: {
          id: order.id,
          title: order.title,
          tz_code: order.tz_code || '',
          model_name: order.model_name || '',
          client_name: order.Client?.name || '—',
          total_quantity: order.total_quantity ?? order.quantity ?? 0,
          deadline: order.deadline,
        },
        procurement: { id: null, status: null, due_date: null, total_sum: 0, completed_at: null },
        items: [],
      });
    }

    const items = (request.ProcurementItems || []).map((item) => ({
      id: item.id,
      material_name: item.material_name || '',
      planned_qty: Number(item.planned_qty || 0),
      unit: String(item.unit || 'шт').toLowerCase(),
      purchased_qty: Number(item.purchased_qty || 0),
      purchased_price: Number(item.purchased_price || 0),
      purchased_sum: Number(item.purchased_sum || 0),
    }));
    const totalSum = items.reduce((acc, item) => acc + (Number(item.purchased_sum) || 0), 0);

    return res.json({
      order_id: order.id,
      order: {
        id: order.id,
        title: order.title,
        tz_code: order.tz_code || '',
        model_name: order.model_name || '',
        client_name: order.Client?.name || '—',
        total_quantity: order.total_quantity ?? order.quantity ?? 0,
        deadline: order.deadline,
      },
      procurement: {
        id: request.id,
        status: String(request.status || 'draft'),
        due_date: request.due_date ?? order.deadline ?? null,
        total_sum: Number(totalSum.toFixed(2)),
        completed_at: request.completed_at ?? null,
        updated_at: request.updated_at ?? null,
      },
      items,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Обработчик сохранения плана закупа (только material_name, planned_qty, unit)
 */
async function saveProcurementPlanHandler(req, res, next) {
  let t;
  try {
    const orderId = Number(req.params.id);
    if (!orderId) return res.status(400).json({ error: 'Некорректный id заказа' });

    if (!['admin', 'manager', 'technologist'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Только admin/manager/technologist могут редактировать план закупа' });
    }

    const order = await db.Order.findByPk(orderId, {
      attributes: ['id', 'title', 'tz_code', 'model_name', 'deadline', 'total_quantity', 'quantity', 'client_id', 'floor_id', 'building_floor_id'],
    });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const orderFloor = order.building_floor_id ?? order.floor_id;
      if (orderFloor != null && Number(orderFloor) !== Number(req.allowedFloorId)) {
        return res.status(403).json({ error: 'Нет доступа к закупу этого заказа' });
      }
    }

    const { due_date, items } = req.body || {};
    if (due_date != null && due_date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(due_date))) {
      return res.status(400).json({ error: 'Дата закупа должна быть в формате YYYY-MM-DD' });
    }
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Поле items должно быть массивом' });
    }

    // Только план: material_name, planned_qty, unit. purchased_* не меняем в этом эндпоинте
    const normalizedItems = [];
    for (const [index, raw] of items.entries()) {
      const materialName = String(raw.material_name || '').trim();
      const plannedQty = Number(raw.planned_qty);
      const unit = String(raw.unit || 'шт').trim().toLowerCase();

      if (!materialName) return res.status(400).json({ error: `Материал #${index + 1}: укажите название` });
      if (!Number.isFinite(plannedQty) || plannedQty <= 0) {
        return res.status(400).json({ error: `Материал #${index + 1}: план должен быть > 0` });
      }
      if (!PROCUREMENT_VALID_UNITS.includes(unit)) {
        return res.status(400).json({ error: `Материал #${index + 1}: единица должна быть шт/метр/кг/тонн/рулон` });
      }

      normalizedItems.push({ material_name: materialName, planned_qty: plannedQty, unit });
    }

    t = await db.sequelize.transaction();
    let request = await db.ProcurementRequest.findOne({
      where: { order_id: orderId },
      transaction: t,
    });

    const editableStatuses = ['draft', 'Ожидает закуп', 'sent'];
    if (request && !editableStatuses.includes(String(request.status || ''))) {
      await t.rollback();
      return res.status(400).json({ error: 'Редактировать план можно только до завершения закупа' });
    }

    if (!request && normalizedItems.length === 0) {
      await t.rollback();
      const orderEmpty = await db.Order.findByPk(orderId, {
        include: [{ model: db.Client, as: 'Client', attributes: ['id', 'name'] }],
      });
      return res.json({
        order_id: orderId,
        order: {
          id: orderEmpty.id,
          title: orderEmpty.title,
          tz_code: orderEmpty.tz_code || '',
          model_name: orderEmpty.model_name || '',
          client_name: orderEmpty.Client?.name || '—',
          total_quantity: orderEmpty.total_quantity ?? orderEmpty.quantity ?? 0,
          deadline: orderEmpty.deadline,
        },
        procurement: { id: null, status: null, due_date: null, total_sum: 0, completed_at: null },
        items: [],
      });
    }

    if (!request) {
      request = await db.ProcurementRequest.create(
        { order_id: orderId, status: 'sent' },
        { transaction: t }
      );
    }

    await db.ProcurementItem.destroy({
      where: { procurement_request_id: request.id },
      transaction: t,
    });

    if (normalizedItems.length > 0) {
      await db.ProcurementItem.bulkCreate(
        normalizedItems.map((item) => ({
          procurement_request_id: request.id,
          material_name: item.material_name,
          planned_qty: item.planned_qty,
          unit: item.unit,
          purchased_qty: 0,
          purchased_price: 0,
          purchased_sum: 0,
        })),
        { transaction: t }
      );
      await request.update(
        { due_date: due_date || null, status: 'sent', total_sum: 0 },
        { transaction: t }
      );
    } else {
      // Черновик не нужен — при пустых items удаляем закуп целиком (items уже очищены выше)
      await request.destroy({ transaction: t });
    }

    await t.commit();
    if (normalizedItems.length > 0) {
      await logAudit(req.user.id, 'UPDATE', 'procurement_request', request.id);
    } else {
      await logAudit(req.user.id, 'DELETE', 'procurement_request', request.id);
    }

    const updatedOrder = await db.Order.findByPk(orderId, {
      include: [{ model: db.Client, as: 'Client', attributes: ['id', 'name'] }],
    });
    const prAfterSave = await db.ProcurementRequest.findOne({
      where: { order_id: orderId },
      include: [{ model: db.ProcurementItem, as: 'ProcurementItems' }],
      order: [[{ model: db.ProcurementItem, as: 'ProcurementItems' }, 'id', 'ASC']],
    });

    const outItems = (prAfterSave?.ProcurementItems || []).map((item) => ({
      id: item.id,
      material_name: item.material_name || '',
      planned_qty: Number(item.planned_qty || 0),
      unit: String(item.unit || 'шт').toLowerCase(),
      purchased_qty: Number(item.purchased_qty || 0),
      purchased_price: Number(item.purchased_price || 0),
      purchased_sum: Number(item.purchased_sum || 0),
    }));

    return res.json({
      order_id: orderId,
      order: {
        id: updatedOrder.id,
        title: updatedOrder.title,
        tz_code: updatedOrder.tz_code || '',
        model_name: updatedOrder.model_name || '',
        client_name: updatedOrder.Client?.name || '—',
        total_quantity: updatedOrder.total_quantity ?? updatedOrder.quantity ?? 0,
        deadline: updatedOrder.deadline,
      },
      procurement: prAfterSave
        ? {
            id: prAfterSave.id,
            status: prAfterSave.status,
            due_date: prAfterSave.due_date || null,
            total_sum: Number(prAfterSave.total_sum || 0),
            completed_at: prAfterSave.completed_at || null,
            updated_at: prAfterSave.updated_at || null,
          }
        : { id: null, status: null, due_date: null, total_sum: 0, completed_at: null, updated_at: null },
      items: outItems,
    });
  } catch (err) {
    if (t) await t.rollback().catch(() => {});
    next(err);
  }
}

router.put('/:id/procurement/plan', saveProcurementPlanHandler);
router.put('/:id/procurement', saveProcurementPlanHandler);

/**
 * DELETE /api/orders/:id/procurement
 * Удалить закуп целиком (draft или sent, до завершения). Позволяет начать закуп заново.
 */
router.delete('/:id/procurement', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const orderId = Number(req.params.id);
    if (!orderId) return res.status(400).json({ error: 'Некорректный id заказа' });

    if (!['admin', 'manager', 'technologist'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Только admin/manager/technologist могут удалять закуп' });
    }

    const order = await db.Order.findByPk(orderId, { attributes: ['id', 'floor_id', 'building_floor_id'] });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const orderFloor = order.building_floor_id ?? order.floor_id;
      if (orderFloor != null && Number(orderFloor) !== Number(req.allowedFloorId)) {
        return res.status(403).json({ error: 'Нет доступа' });
      }
    }

    const request = await db.ProcurementRequest.findOne({
      where: { order_id: orderId },
      transaction: t,
    });
    if (!request) return res.status(404).json({ error: 'Закуп не найден' });

    const deletableStatuses = ['draft', 'Ожидает закуп', 'sent'];
    if (!deletableStatuses.includes(String(request.status || ''))) {
      await t.rollback();
      return res.status(400).json({ error: 'Удалить можно только до завершения закупа' });
    }

    await db.ProcurementItem.destroy({
      where: { procurement_request_id: request.id },
      transaction: t,
    });
    await request.destroy({ transaction: t });
    await t.commit();
    await logAudit(req.user.id, 'DELETE', 'procurement_request', request.id);

    return res.json({ ok: true, message: 'Закуп удалён' });
  } catch (err) {
    await t.rollback().catch(() => {});
    next(err);
  }
});

/**
 * POST /api/orders/:id/procurement/complete
 * Отметить закуп как выполненный (status = received, completed_at = now)
 * + обновить order_operation с stage_key='procurement': actual_qty = order.quantity, status = 'DONE', actual_end_date = today
 */
router.post('/:id/procurement/complete', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const orderId = Number(req.params.id);
    const { items: bodyItems } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'Некорректный id заказа' });

    if (!['admin', 'manager', 'technologist'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Только admin/manager/technologist могут отметить закуп как выполненный' });
    }

    const order = await db.Order.findByPk(orderId, {
      attributes: ['id', 'quantity', 'total_quantity', 'floor_id', 'building_floor_id'],
      transaction: t,
    });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const orderFloor = order.building_floor_id ?? order.floor_id;
      if (orderFloor != null && Number(orderFloor) !== Number(req.allowedFloorId)) {
        return res.status(403).json({ error: 'Нет доступа' });
      }
    }

    const pr = await db.ProcurementRequest.findOne({
      where: { order_id: orderId },
      include: [{ model: db.ProcurementItem, as: 'ProcurementItems' }],
      transaction: t,
    });
    if (!pr) return res.status(404).json({ error: 'Закуп не найден' });
    if (pr.status !== 'sent') {
      return res.status(400).json({ error: 'Отметить как закуплено можно только после отправки (sent)' });
    }

    // Обновить/создать позиции: purchased_qty, purchased_price, и при необходимости material_name, planned_qty, unit
    let totalSum = 0;
    const validUnits = ['шт', 'метр', 'кг', 'тонн', 'рулон'];
    if (Array.isArray(bodyItems) && bodyItems.length > 0) {
      for (const it of bodyItems) {
        const materialName = String(it.material_name || '').trim();
        const plannedQty = Number(it.planned_qty);
        const unit = String(it.unit || 'шт').trim().toLowerCase();
        const pqty = Number(it.purchased_qty) || 0;
        const pprice = Number(it.purchased_price) || 0;
        const psum = Number((pqty * pprice).toFixed(2));
        const id = it.id ? parseInt(it.id, 10) : null;
        if (id) {
          const item = (pr.ProcurementItems || []).find((i) => i.id === id);
          if (!item) continue;
          const patch = { purchased_qty: pqty, purchased_price: pprice, purchased_sum: psum };
          if (materialName && Number.isFinite(plannedQty) && plannedQty >= 0 && validUnits.includes(unit)) {
            patch.material_name = materialName;
            patch.planned_qty = plannedQty;
            patch.unit = unit;
          }
          await item.update(patch, { transaction: t });
          totalSum += psum;
        } else if (materialName && Number.isFinite(plannedQty) && plannedQty >= 0 && validUnits.includes(unit)) {
          const newItem = await db.ProcurementItem.create(
            {
              procurement_request_id: pr.id,
              material_name: materialName,
              planned_qty: plannedQty,
              unit,
              purchased_qty: pqty,
              purchased_price: pprice,
              purchased_sum: psum,
            },
            { transaction: t }
          );
          totalSum += psum;
        }
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const orderQty = Number(order.total_quantity ?? order.quantity ?? 0);

    await pr.update(
      {
        status: 'received',
        completed_at: new Date(),
        ...(totalSum > 0 && { total_sum: Number(totalSum.toFixed(2)) }),
      },
      { transaction: t }
    );

    const stageIds = await resolveStageOperationIds(t);
    const procOpId = stageIds.procurement;
    if (procOpId) {
      const orderOp = await db.OrderOperation.findOne({
        where: { order_id: orderId, operation_id: procOpId },
        transaction: t,
      });
      if (orderOp) {
        await orderOp.update(
          {
            actual_qty: orderQty,
            status: 'DONE',
            actual_end_date: today,
          },
          { transaction: t }
        );
      }
    }

    // Цепочка: закуп DONE → планирование IN_PROGRESS
    const now = new Date();
    const procStage = await db.OrderStage.findOne({ where: { order_id: orderId, stage_key: 'procurement' }, transaction: t });
    if (procStage) {
      await procStage.update({ status: 'DONE', completed_at: now }, { transaction: t });
    }
    const planStage = await db.OrderStage.findOne({ where: { order_id: orderId, stage_key: 'planning' }, transaction: t });
    if (planStage) {
      await planStage.update({ status: 'IN_PROGRESS', started_at: now }, { transaction: t });
    }

    await t.commit();
    await logAudit(req.user.id, 'UPDATE', 'procurement_request', pr.id);

    return res.json({ ok: true, status: 'received' });
  } catch (err) {
    await t.rollback().catch(() => {});
    next(err);
  }
});

/**
 * POST /api/orders/:id/planning/complete
 * Завершить планирование: проверка что production_plan_day заполнен, planning = DONE, cutting = IN_PROGRESS.
 */
router.post('/:id/planning/complete', async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    if (!orderId) return res.status(400).json({ error: 'Некорректный id заказа' });

    if (!['admin', 'manager', 'technologist'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Только admin/manager/technologist могут завершить планирование' });
    }

    const order = await db.Order.findByPk(orderId);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    const planStage = await db.OrderStage.findOne({ where: { order_id: orderId, stage_key: 'planning' } });
    if (!planStage) return res.status(400).json({ error: 'Этап планирования не найден. Обновите этапы заказа.' });
    if (planStage.status !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'Планирование можно завершить только когда этап в статусе В работе' });
    }

    const planCount = await db.ProductionPlanDay.count({ where: { order_id: orderId }, col: 'id' });
    if (planCount === 0) {
      return res.status(400).json({
        error: 'Нет плана в Планировании. Заполните production_plan_day по заказу и нажмите «Завершить планирование».',
      });
    }

    const now = new Date();
    await planStage.update({ status: 'DONE', completed_at: now });
    const cutStage = await db.OrderStage.findOne({ where: { order_id: orderId, stage_key: 'cutting' } });
    if (cutStage) await cutStage.update({ status: 'IN_PROGRESS', started_at: now });

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orders/:id/warehouse/complete
 * Завершить этап Склад: warehouse = DONE, shipping = IN_PROGRESS.
 */
router.post('/:id/warehouse/complete', async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    if (!orderId) return res.status(400).json({ error: 'Некорректный id заказа' });

    if (!['admin', 'manager', 'technologist'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Только admin/manager/technologist могут завершить этап Склад' });
    }

    const order = await db.Order.findByPk(orderId);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    const whStage = await db.OrderStage.findOne({ where: { order_id: orderId, stage_key: 'warehouse' } });
    if (!whStage) return res.status(400).json({ error: 'Этап склад не найден' });
    if (whStage.status !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'Склад можно завершить только когда этап в статусе В работе' });
    }

    const now = new Date();
    await whStage.update({ status: 'DONE', completed_at: now });
    const shipStage = await db.OrderStage.findOne({ where: { order_id: orderId, stage_key: 'shipping' } });
    if (shipStage) await shipStage.update({ status: 'IN_PROGRESS', started_at: now });

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/orders/:orderId/operations/:opId/actual
 * Фиксация факта по операции. operator — только свои, technologist — свой этаж, admin/manager — все.
 */
router.put('/:orderId/operations/:opId/actual', async (req, res, next) => {
  try {
    const { orderId, opId } = req.params;
    const { actual_quantity } = req.body;

    const val = parseInt(actual_quantity, 10);
    if (isNaN(val) || val < 0) {
      return res.status(400).json({ error: 'actual_quantity должен быть числом >= 0' });
    }

    const orderOp = await db.OrderOperation.findByPk(opId, {
      include: [
        { model: db.Order, as: 'Order', include: [{ model: db.Technologist, as: 'Technologist' }] },
        { model: db.Operation, as: 'Operation' },
        { model: db.Sewer, as: 'Sewer', include: [{ model: db.User, as: 'User' }] },
      ],
    });

    if (!orderOp) {
      return res.status(404).json({ error: 'Операция не найдена' });
    }
    if (Number(orderOp.order_id) !== Number(orderId)) {
      return res.status(400).json({ error: 'Операция не принадлежит этому заказу' });
    }

    // Проверка прав: operator — только свои операции
    if (req.user.role === 'operator') {
      if (!req.user.Sewer || orderOp.sewer_id !== req.user.Sewer.id) {
        return res.status(403).json({ error: 'Нет прав редактировать эту операцию' });
      }
    }
    // technologist — только свой этаж
    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const orderFloorId = orderOp.Order?.floor_id;
      if (orderFloorId != null && orderFloorId !== req.allowedFloorId) {
        return res.status(403).json({ error: 'Нет прав редактировать операции другого этажа' });
      }
    }

    await orderOp.update({ actual_quantity: val });
    await logAudit(req.user.id, 'UPDATE_ACTUAL', 'order_operation', orderOp.id);

    const updated = await db.OrderOperation.findByPk(opId, {
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
 * POST /api/orders/:id/complete
 * Завершение заказа. Только technologist (свой этаж), manager, admin.
 * В транзакции: проверка actual >= planned для всех операций, статус "Готов", completed_at.
 */
router.post('/:id/complete', async (req, res, next) => {
  let t;
  try {
    const orderId = req.params.id;

    if (req.user.role === 'operator') {
      return res.status(403).json({ error: 'Швея не может завершать заказы' });
    }

    t = await db.sequelize.transaction();

    const order = await db.Order.findByPk(orderId, {
      include: [
        { model: db.OrderStatus, as: 'OrderStatus' },
        { model: db.Technologist, as: 'Technologist' },
        {
          model: db.OrderOperation,
          as: 'OrderOperations',
          include: [
            { model: db.Operation, as: 'Operation' },
            { model: db.Sewer, as: 'Sewer', include: [{ model: db.User, as: 'User' }] },
          ],
        },
      ],
      transaction: t,
    });

    if (!order) {
      await t.rollback();
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    if (order.OrderStatus?.name === 'Готов') {
      await t.rollback();
      return res.status(400).json({ error: 'Заказ уже завершён' });
    }

    // technologist — только заказы своего этажа
    if (req.user.role === 'technologist' && req.allowedFloorId) {
      if (order.floor_id != null && order.floor_id !== req.allowedFloorId) {
        await t.rollback();
        return res.status(403).json({ error: 'Нет прав завершать заказы другого этажа' });
      }
    }

    const ops = order.OrderOperations || [];
    if (ops.length === 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Нельзя завершить заказ без операций' });
    }

    // Проверка: все операции должны быть в статусе «Готово» (производственная цепочка)
    const notFinishedOps = ops.filter((o) => (o.status || 'Ожидает') !== 'Готово');
    if (notFinishedOps.length > 0) {
      await t.rollback();
      return res.status(400).json({
        error: 'Не все операции завершены. Завершите операции по цепочке: раскрой → пошив → финиш.',
        notFinished: notFinishedOps.map((o) => o.Operation?.name),
      });
    }

    const problematic = [];
    let plannedTotal = 0;
    let actualTotal = 0;

    for (const op of ops) {
      const plan = op.planned_quantity || 0;
      const actual = op.actual_quantity ?? null;
      plannedTotal += plan * parseFloat(op.Operation?.norm_minutes || 0);
      actualTotal += (actual ?? 0) * parseFloat(op.Operation?.norm_minutes || 0);

      if (actual === null || actual < plan) {
        problematic.push({
          operation: op.Operation?.name,
          sewer: op.Sewer?.User?.name,
          planned: plan,
          actual: actual ?? 0,
        });
      }
    }

    if (problematic.length > 0) {
      await t.rollback();
      return res.status(400).json({
        error: 'Не все операции выполнены. Заполните факт по операциям.',
        problematic,
      });
    }

    const statusReady = await db.OrderStatus.findOne({
      where: { name: 'Готов' },
      transaction: t,
    });
    if (!statusReady) {
      await t.rollback();
      return res.status(500).json({ error: 'Статус "Готов" не найден в справочнике' });
    }

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const isOverdue = order.deadline && order.deadline < today;

    await order.update(
      {
        status_id: statusReady.id,
        completed_at: now,
      },
      { transaction: t }
    );

    await t.commit();

    await logAudit(req.user.id, 'COMPLETE', 'order', orderId);

    const updated = await db.Order.findByPk(orderId, {
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

    res.json({
      ok: true,
      order: updated,
      summary: {
        planned_total: Math.round(plannedTotal),
        actual_total: Math.round(actualTotal),
        is_overdue: !!isOverdue,
      },
    });
  } catch (err) {
    if (t) await t.rollback().catch(() => {});
    next(err);
  }
});

/**
 * PUT /api/orders/:id
 * Редактирование заказа (admin/manager — все поля; technologist — свой цех до завершения)
 */
router.put('/:id', async (req, res, next) => {
  try {
    const orderId = req.params.id;

    const order = await db.Order.findByPk(orderId, {
      include: [
        { model: db.OrderStatus, as: 'OrderStatus' },
        { model: db.OrderOperation, as: 'OrderOperations', attributes: ['id', 'sewer_id'] },
      ],
    });
    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    // Operator — только заказы со своими операциями; не может менять status_id
    if (req.user.role === 'operator') {
      const hasMyOps = order.OrderOperations?.some(
        (op) => req.user.Sewer && op.sewer_id === req.user.Sewer.id
      );
      if (!hasMyOps) {
        return res.status(403).json({ error: 'Нет прав редактировать этот заказ' });
      }
    }

    if (order.OrderStatus?.name === 'Готов') {
      if (req.user.role !== 'admin' && req.user.role !== 'manager') {
        return res.status(403).json({ error: 'Завершённый заказ может редактировать только admin/manager' });
      }
    }

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      if (order.floor_id != null && order.floor_id !== req.allowedFloorId) {
        return res.status(403).json({ error: 'Нет прав редактировать заказ другого цеха' });
      }
    }

    const {
      client_id,
      title,
      tz_code,
      model_name,
      article,
      quantity,
      total_quantity,
      deadline,
      comment,
      planned_month,
      floor_id,
      color,
      size_in_numbers,
      size_in_letters,
      status_id,
      sizes,
      variants,
    } = req.body;

    const updates = {};
    if (client_id != null) updates.client_id = parseInt(client_id, 10);
    const hasNameInput = title != null || tz_code != null || model_name != null;
    if (hasNameInput) {
      const merged = resolveOrderNameFields({
        title: title != null ? title : order.title,
        tz_code: tz_code != null ? tz_code : order.tz_code,
        model_name: model_name != null ? model_name : order.model_name,
      });
      if (!merged.title || !merged.tz_code || !merged.model_name) {
        return res.status(400).json({ error: 'Поля "ТЗ / Код модели" и "Название модели" обязательны' });
      }
      updates.title = merged.title;
      updates.tz_code = merged.tz_code;
      updates.model_name = merged.model_name;
    }
    if (article !== undefined) updates.article = article ? String(article).trim() : null;
    if (deadline != null) updates.deadline = deadline;
    if (comment !== undefined) updates.comment = comment ? String(comment).trim() : null;
    if (planned_month !== undefined) updates.planned_month = planned_month ? String(planned_month).trim() : null;
    if (floor_id !== undefined) updates.floor_id = floor_id ? parseInt(floor_id, 10) : null;
    if (color !== undefined) updates.color = color ? String(color).trim() : null;
    if (size_in_numbers !== undefined) updates.size_in_numbers = size_in_numbers ? String(size_in_numbers).trim() : null;
    if (size_in_letters !== undefined) updates.size_in_letters = size_in_letters ? String(size_in_letters).trim() : null;
    if (status_id != null && ['admin', 'manager'].includes(req.user.role)) {
      updates.status_id = parseInt(status_id, 10);
    }

    const { order_height_type, order_height_value } = req.body;
    if (order_height_type !== undefined || order_height_value !== undefined) {
      const type = order_height_type === 'CUSTOM' ? 'CUSTOM' : 'PRESET';
      let value = type === 'PRESET' ? 170 : (parseInt(order_height_value, 10) || 170);
      if (type === 'PRESET' && (order_height_value === 165 || order_height_value === '165')) value = 165;
      else if (type === 'PRESET') value = 170;
      else value = Math.min(220, Math.max(120, value));
      updates.order_height_type = type;
      updates.order_height_value = value;
    }

    let qty = null;
    let sizeIdsMap = {};
    let variantsToInsert = [];

    if (sizes && Array.isArray(sizes) && variants && Array.isArray(variants)) {
      const totalQty = parseInt(total_quantity ?? quantity, 10);
      if (isNaN(totalQty) || totalQty <= 0) {
        return res.status(400).json({ error: 'total_quantity должно быть > 0' });
      }
      if (sizes.length === 0) {
        return res.status(400).json({ error: 'Укажите хотя бы один размер' });
      }
      if (variants.length === 0) {
        return res.status(400).json({ error: 'Укажите хотя бы один вариант (цвет+размер+количество)' });
      }

      const seen = new Set();
      let sumQty = 0;
      for (const v of variants) {
        const colorStr = String(v.color || '').trim();
        const sizeStr = String(v.size || '').trim();
        const q = parseInt(v.quantity, 10) || 0;
        if (q < 0) {
          return res.status(400).json({ error: `Количество не может быть отрицательным: ${colorStr} / ${sizeStr}` });
        }
        const key = `${colorStr}|${sizeStr}`;
        if (seen.has(key)) {
          return res.status(400).json({ error: `Дубликат: цвет "${colorStr}" и размер "${sizeStr}"` });
        }
        seen.add(key);
        sumQty += q;
      }
      if (sumQty !== totalQty) {
        return res.status(400).json({
          error: `Сумма матрицы (${sumQty}) не равна общему количеству (${totalQty})`,
        });
      }

      for (const sizeName of sizes) {
        const name = String(sizeName || '').trim();
        if (!name) continue;
        let size = await db.Size.findOne({ where: { name } });
        if (!size) {
          size = await db.Size.create({ name, is_active: true });
        }
        sizeIdsMap[name] = size.id;
      }

      variantsToInsert = variants
        .filter((v) => (parseInt(v.quantity, 10) || 0) > 0)
        .map((v) => ({
          color: String(v.color || '').trim(),
          size: String(v.size || '').trim(),
          quantity: parseInt(v.quantity, 10) || 0,
        }));

      for (const v of variantsToInsert) {
        if (!sizeIdsMap[v.size]) {
          return res.status(400).json({ error: `Размер "${v.size}" не найден в списке размеров заказа` });
        }
      }

      qty = totalQty;
    } else if (quantity != null || total_quantity != null) {
      qty = parseInt(quantity ?? total_quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ error: 'Количество должно быть > 0' });
      }
    }

    if (qty != null) {
      updates.quantity = qty;
      updates.total_quantity = qty;
    }

    if (Object.keys(updates).length === 0 && variantsToInsert.length === 0) {
      return res.status(400).json({ error: 'Нет данных для обновления' });
    }

    const t = await db.sequelize.transaction();
    try {
      await order.update(updates, { transaction: t });

      if (variantsToInsert.length > 0) {
        await db.OrderVariant.destroy({ where: { order_id: orderId }, transaction: t });
        for (const v of variantsToInsert) {
          await db.OrderVariant.create(
            {
              order_id: orderId,
              color: v.color,
              size_id: sizeIdsMap[v.size],
              quantity: v.quantity,
            },
            { transaction: t }
          );
        }
      }

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
    await logAudit(req.user.id, 'UPDATE', 'order', orderId);

    const updated = await db.Order.findByPk(orderId, {
      include: [
        { model: db.Client, as: 'Client' },
        { model: db.OrderStatus, as: 'OrderStatus' },
        { model: db.Floor, as: 'Floor' },
        { model: db.Technologist, as: 'Technologist', include: [{ model: db.User, as: 'User' }] },
        { model: db.OrderVariant, as: 'OrderVariants', include: [{ model: db.Size, as: 'Size' }] },
      ],
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/orders/:id
 * Удаление заказа (только admin/manager)
 */
router.delete('/:id', async (req, res, next) => {
  let t;
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ error: 'Удалять заказы могут только admin и manager' });
    }

    const orderId = req.params.id;
    t = await db.sequelize.transaction();

    const order = await db.Order.findByPk(orderId, { transaction: t });
    if (!order) {
      await t.rollback();
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    const pr = await db.ProcurementRequest.findOne({ where: { order_id: orderId }, transaction: t });
    if (pr) {
      await db.ProcurementItem.destroy({ where: { procurement_request_id: pr.id }, transaction: t });
      await pr.destroy({ transaction: t });
    }
    await db.OrderVariant.destroy({ where: { order_id: orderId }, transaction: t });
    await db.OrderOperation.destroy({ where: { order_id: orderId }, transaction: t });
    await db.OrderFinanceLink.destroy({ where: { order_id: orderId }, transaction: t });
    await db.FinanceFact.update({ order_id: null }, { where: { order_id: orderId }, transaction: t });
    await order.destroy({ transaction: t });

    await t.commit();
    await logAudit(req.user.id, 'DELETE', 'order', orderId);

    res.json({ ok: true, message: 'Заказ удалён' });
  } catch (err) {
    if (t) await t.rollback().catch(() => {});
    next(err);
  }
});

/**
 * GET /api/orders/:id/rostovka — ростовка заказа (размерная матрица по size_id).
 * Права: admin/manager/technologist.
 */
router.get('/:id/rostovka', async (req, res, next) => {
  try {
    if (['operator'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const order = await db.Order.findByPk(req.params.id, { attributes: ['id', 'quantity'] });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    const rows = await db.OrderRostovka.findAll({
      where: { order_id: order.id },
      include: [{ model: db.Size, as: 'Size', attributes: ['id', 'name', 'code', 'type'] }],
      order: [['Size', 'sort_order', 'ASC']],
    });
    const total = rows.reduce((s, r) => s + Number(r.planned_qty || 0), 0);
    res.json({ items: rows, order_quantity: order.quantity, total });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/orders/:id/rostovka — сохранить ростовку. body: { items: [{ size_id или code, planned_qty }] }.
 * Правило: SUM(planned_qty) должен равняться orders.quantity. Размеры только из справочника (code нормализуется).
 */
router.put('/:id/rostovka', async (req, res, next) => {
  try {
    if (['operator'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const order = await db.Order.findByPk(req.params.id, { attributes: ['id', 'quantity'] });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    const orderQty = Number(order.quantity) || 0;
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Укажите items: массив { size_id или code, planned_qty }' });
    }
    const sizesList = await db.Size.findAll({ where: { is_active: true }, attributes: ['id', 'code', 'name'] });
    const rawSizes = sizesList.map((s) => ({ id: s.id, code: (s.code || s.name || '').toString().trim().toUpperCase() }));

    const toUpsert = [];
    let sum = 0;
    for (const it of items) {
      let sizeId = it.size_id != null ? Number(it.size_id) : null;
      if (!sizeId && it.code != null) {
        const code = normalizeSizeCode(String(it.code));
        sizeId = findSizeIdByCode(code, sizesList);
      }
      if (!sizeId) continue;
      const qty = Math.max(0, parseFloat(it.planned_qty) || 0);
      if (qty <= 0) continue;
      toUpsert.push({ size_id: sizeId, planned_qty: qty });
      sum += qty;
    }
    if (Math.abs(sum - orderQty) > 0.001) {
      return res.status(400).json({
        error: `Сумма по размерам (${sum}) должна равняться количеству заказа (${orderQty})`,
        total: sum,
        order_quantity: orderQty,
      });
    }
    await db.OrderRostovka.destroy({ where: { order_id: order.id } });
    for (const it of toUpsert) {
      await db.OrderRostovka.create({
        order_id: order.id,
        size_id: it.size_id,
        planned_qty: it.planned_qty,
      });
    }
    const rows = await db.OrderRostovka.findAll({
      where: { order_id: order.id },
      include: [{ model: db.Size, as: 'Size', attributes: ['id', 'name', 'code', 'type'] }],
      order: [['Size', 'sort_order', 'ASC']],
    });
    res.json({ items: rows, order_quantity: orderQty, total: sum });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders/:id
 * Детали заказа (включая variants, sizes, colors)
 */
router.get('/:id', async (req, res, next) => {
  try {
    const order = await db.Order.findByPk(req.params.id, {
      include: [
        { model: db.Client, as: 'Client' },
        { model: db.Workshop, as: 'Workshop' },
        { model: db.OrderStatus, as: 'OrderStatus' },
        { model: db.Floor, as: 'Floor' },
        { model: db.BuildingFloor, as: 'BuildingFloor' },
        { model: db.Technologist, as: 'Technologist', include: [{ model: db.User, as: 'User' }] },
        {
          model: db.OrderOperation,
          as: 'OrderOperations',
          include: [
            { model: db.Operation, as: 'Operation' },
            { model: db.Sewer, as: 'Sewer', include: [{ model: db.User, as: 'User' }] },
            { model: db.BuildingFloor, as: 'Floor', foreignKey: 'floor_id' },
            { model: db.OrderOperationVariant, as: 'OrderOperationVariants' },
          ],
        },
        {
          model: db.OrderVariant,
          as: 'OrderVariants',
          include: [{ model: db.Size, as: 'Size' }],
        },
        {
          model: db.OrderRostovka,
          as: 'OrderRostovkas',
          include: [{ model: db.Size, as: 'Size', attributes: ['id', 'name', 'code', 'type', 'sort_order'] }],
          required: false,
        },
        {
          model: db.CuttingTask,
          as: 'CuttingTasks',
          required: false,
        },
      ],
    });

    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    // Технолог видит только заказы своего этажа или нераспределённые
    if (req.user.role === 'technologist') {
      const allowed = req.allowedBuildingFloorId ?? req.allowedFloorId;
      if (allowed) {
        const orderFloor = order.building_floor_id ?? order.floor_id;
        if (orderFloor != null && Number(orderFloor) !== Number(allowed)) {
          return res.status(403).json({ error: 'Нет доступа к этому заказу' });
        }
      }
    }

    // Оператор видит только заказы со своими операциями
    if (req.user.role === 'operator' && req.user.Sewer) {
      const hasMyOps = order.OrderOperations?.some((op) => op.sewer_id === req.user.Sewer.id);
      if (!hasMyOps) {
        return res.status(403).json({ error: 'Нет доступа к этому заказу' });
      }
    }

    const plain = order.get ? order.get({ plain: true }) : order;
    const variants = plain.OrderVariants || [];
    const sizes = [...new Set(variants.map((v) => v.Size?.name).filter(Boolean))].sort();
    const colors = [...new Set(variants.map((v) => v.color).filter(Boolean))].sort();

    res.json({
      ...plain,
      variants: variants.map((v) => ({
        color: v.color,
        size: v.Size?.name,
        quantity: v.quantity,
      })),
      sizes,
      colors,
      photos: plain.photos || [],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orders/:id/photos
 * Добавить фото к заказу (body: { photo: "data:image/...;base64,..." })
 */
router.post('/:id/photos', async (req, res, next) => {
  try {
    const order = await db.Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    if (req.user.role === 'technologist') {
      const allowed = req.allowedBuildingFloorId ?? req.allowedFloorId;
      if (allowed) {
        const orderFloor = order.building_floor_id ?? order.floor_id;
        if (orderFloor != null && Number(orderFloor) !== Number(allowed)) {
          return res.status(403).json({ error: 'Нет доступа' });
        }
      }
    }
    if (req.user.role === 'operator') {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const { photo } = req.body;
    if (!photo || typeof photo !== 'string') {
      return res.status(400).json({ error: 'Укажите photo (base64)' });
    }
    if (photo.length > 3 * 1024 * 1024) {
      return res.status(400).json({ error: 'Фото слишком большое (макс 3 МБ)' });
    }

    const photos = Array.isArray(order.photos) ? [...order.photos] : [];
    if (photos.length >= 10) {
      return res.status(400).json({ error: 'Максимум 10 фото' });
    }
    photos.push(photo);
    await order.update({ photos });

    res.json({ photos });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/orders/:id/photos/:index
 * Удалить фото по индексу
 */
router.delete('/:id/photos/:index', async (req, res, next) => {
  try {
    const order = await db.Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    if (req.user.role === 'technologist') {
      const allowed = req.allowedBuildingFloorId ?? req.allowedFloorId;
      if (allowed) {
        const orderFloor = order.building_floor_id ?? order.floor_id;
        if (orderFloor != null && Number(orderFloor) !== Number(allowed)) {
          return res.status(403).json({ error: 'Нет доступа' });
        }
      }
    }
    if (req.user.role === 'operator') {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const idx = parseInt(req.params.index, 10);
    const photos = Array.isArray(order.photos) ? [...order.photos] : [];
    if (isNaN(idx) || idx < 0 || idx >= photos.length) {
      return res.status(400).json({ error: 'Неверный индекс' });
    }
    photos.splice(idx, 1);
    await order.update({ photos });

    res.json({ photos });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
