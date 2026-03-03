/**
 * Роуты заказов
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { logAudit } = require('../utils/audit');
const { trySyncOrderToCloud, queueOrderForSync } = require('../services/cloudSync');
const { STAGES, DEFAULT_STAGE_DAYS } = require('../constants/boardStages');

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

const PROCUREMENT_API_STATUS_TO_DB = {
  draft: 'Ожидает закуп',
  sent: 'Частично',
  received: 'Закуплено',
  canceled: 'Отменено',
};

const PROCUREMENT_DB_STATUS_TO_API = {
  'Ожидает закуп': 'draft',
  'Частично': 'sent',
  'Закуплено': 'received',
  'Отменено': 'canceled',
};

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
 * Нормализация статуса закупа из UI в БД
 */
function mapProcurementStatusToDb(status) {
  const raw = String(status || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'draft' || raw === 'черновик' || raw === 'ожидает закуп') return 'Ожидает закуп';
  if (raw === 'sent' || raw === 'отправлено' || raw === 'частично') return 'Частично';
  if (raw === 'received' || raw === 'получено' || raw === 'закуплено') return 'Закуплено';
  if (raw === 'canceled' || raw === 'отменено') return 'Отменено';
  return null;
}

/**
 * Нормализация статуса закупа из БД в API
 */
function mapProcurementStatusToApi(status) {
  const value = String(status || '').trim();
  if (value === 'Закуплено') return 'received';
  if (value === 'Частично') return 'sent';
  if (value === 'Отменено') return 'canceled';
  return 'draft';
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

      await db.ProcurementRequest.create(
        {
          order_id: order.id,
          status: 'Ожидает закуп',
          created_by: req.user?.id || null,
        },
        { transaction: t }
      );

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
 * GET /api/orders/:id/procurement
 * Возвращает данные закупа по заказу (черновик, если заявки ещё нет)
 */
router.get('/:id/procurement', async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    if (!orderId) return res.status(400).json({ error: 'Некорректный id заказа' });

    const order = await db.Order.findByPk(orderId, {
      include: [
        { model: db.Client, as: 'Client', attributes: ['id', 'name'] },
        { model: db.OrderVariant, as: 'OrderVariants', attributes: ['color', 'quantity'] },
      ],
    });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const orderFloor = order.building_floor_id ?? order.floor_id;
      if (orderFloor != null && Number(orderFloor) !== Number(req.allowedFloorId)) {
        return res.status(403).json({ error: 'Нет доступа к закупу этого заказа' });
      }
    }
    if (req.user.role === 'operator' && req.user.Sewer) {
      const hasMyOps = await db.OrderOperation.count({
        where: { order_id: order.id, sewer_id: req.user.Sewer.id },
      });
      if (!hasMyOps) {
        return res.status(403).json({ error: 'Нет доступа к закупу этого заказа' });
      }
    }

    let request = await db.ProcurementRequest.findOne({
      where: { order_id: order.id },
      include: [{ model: db.ProcurementItem, as: 'ProcurementItems' }],
      order: [[{ model: db.ProcurementItem, as: 'ProcurementItems' }, 'id', 'ASC']],
    });

    if (!request) {
      request = await db.ProcurementRequest.create({
        order_id: order.id,
        status: 'Ожидает закуп',
        created_by: req.user?.id || null,
      });
      request = await db.ProcurementRequest.findByPk(request.id, {
        include: [{ model: db.ProcurementItem, as: 'ProcurementItems' }],
      });
    }

    const items = (request.ProcurementItems || []).map((item) => ({
      id: item.id,
      material_name: item.name || '',
      qty: Number(item.quantity || 0),
      unit: String(item.unit || '').toLowerCase(),
      price: Number(item.price || 0),
      sum: Number(item.total || 0),
      supplier: item.supplier || '',
      comment: item.comment || '',
    }));
    const totalSum = items.reduce((acc, item) => acc + (Number(item.sum) || 0), 0);

    if (Number(request.total_sum || 0) !== Number(totalSum.toFixed(2))) {
      await request.update({ total_sum: Number(totalSum.toFixed(2)) });
    }

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
        status: PROCUREMENT_DB_STATUS_TO_API[request.status] || 'draft',
        status_label: request.status,
        due_date: request.due_date || null,
        total_sum: Number(totalSum.toFixed(2)),
      },
      items,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/orders/:id/procurement
 * Сохранение закупа из карточки заказа
 */
router.put('/:id/procurement', async (req, res, next) => {
  let t;
  try {
    const orderId = Number(req.params.id);
    if (!orderId) return res.status(400).json({ error: 'Некорректный id заказа' });

    if (!['admin', 'manager', 'technologist'].includes(req.user.role)) {
      return res.status(403).json({ error: 'У вас только просмотр закупа' });
    }

    const order = await db.Order.findByPk(orderId, { attributes: ['id', 'floor_id', 'building_floor_id'] });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const orderFloor = order.building_floor_id ?? order.floor_id;
      if (orderFloor != null && Number(orderFloor) !== Number(req.allowedFloorId)) {
        return res.status(403).json({ error: 'Нет доступа к закупу этого заказа' });
      }
    }

    const { due_date, status, items } = req.body || {};
    if (due_date != null && due_date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(due_date))) {
      return res.status(400).json({ error: 'Дата закупа должна быть в формате YYYY-MM-DD' });
    }
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Поле items должно быть массивом' });
    }

    const mappedStatus = status ? PROCUREMENT_API_STATUS_TO_DB[status] : null;
    if (status && !mappedStatus) {
      return res.status(400).json({ error: 'Статус должен быть: draft, sent, received или canceled' });
    }

    const normalizedItems = [];
    for (const [index, raw] of items.entries()) {
      const materialName = String(raw.material_name || '').trim();
      const qty = Number(raw.qty);
      const unit = String(raw.unit || '').trim().toUpperCase();
      const price = Number(raw.price || 0);
      const supplier = raw.supplier ? String(raw.supplier).trim() : null;
      const comment = raw.comment ? String(raw.comment).trim() : null;

      const allowedUnits = ['РУЛОН', 'КГ', 'ТОННА', 'МЕТР', 'ШТ'];
      if (!materialName) return res.status(400).json({ error: `Материал #${index + 1}: укажите название` });
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ error: `Материал #${index + 1}: количество должно быть больше 0` });
      }
      if (!allowedUnits.includes(unit)) {
        return res.status(400).json({ error: `Материал #${index + 1}: единица должна быть рулон/кг/тонн/метр/шт` });
      }
      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ error: `Материал #${index + 1}: цена должна быть >= 0` });
      }

      const sum = Number((qty * price).toFixed(2));
      normalizedItems.push({
        material_name: materialName,
        qty,
        unit,
        price: Number(price.toFixed(2)),
        sum,
        supplier,
        comment,
      });
    }

    t = await db.sequelize.transaction();
    let request = await db.ProcurementRequest.findOne({
      where: { order_id: orderId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!request) {
      request = await db.ProcurementRequest.create(
        { order_id: orderId, status: mappedStatus || 'Ожидает закуп', created_by: req.user?.id || null },
        { transaction: t }
      );
    }

    await request.update(
      {
        due_date: due_date || null,
        status: mappedStatus || request.status,
        total_sum: Number(normalizedItems.reduce((acc, item) => acc + item.sum, 0).toFixed(2)),
      },
      { transaction: t }
    );

    await db.ProcurementItem.destroy({
      where: { procurement_request_id: request.id },
      transaction: t,
    });

    if (normalizedItems.length > 0) {
      await db.ProcurementItem.bulkCreate(
        normalizedItems.map((item) => ({
          procurement_request_id: request.id,
          name: item.material_name,
          quantity: item.qty,
          unit: item.unit,
          price: item.price,
          total: item.sum,
          supplier: item.supplier,
          comment: item.comment,
        })),
        { transaction: t }
      );
    }

    await t.commit();
    await logAudit(req.user.id, 'UPDATE', 'procurement_request', request.id);
    const updatedOrder = await db.Order.findByPk(orderId, {
      include: [{ model: db.Client, as: 'Client', attributes: ['id', 'name'] }],
    });
    const updatedRequest = await db.ProcurementRequest.findByPk(request.id, {
      include: [{ model: db.ProcurementItem, as: 'ProcurementItems' }],
      order: [[{ model: db.ProcurementItem, as: 'ProcurementItems' }, 'id', 'ASC']],
    });

    const outItems = (updatedRequest.ProcurementItems || []).map((item) => ({
      id: item.id,
      material_name: item.name || '',
      qty: Number(item.quantity || 0),
      unit: String(item.unit || '').toLowerCase(),
      price: Number(item.price || 0),
      sum: Number(item.total || 0),
      supplier: item.supplier || '',
      comment: item.comment || '',
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
      procurement: {
        id: updatedRequest.id,
        status: PROCUREMENT_DB_STATUS_TO_API[updatedRequest.status] || 'draft',
        status_label: updatedRequest.status,
        due_date: updatedRequest.due_date || null,
        total_sum: Number(updatedRequest.total_sum || 0),
      },
      items: outItems,
    });
  } catch (err) {
    if (t) await t.rollback().catch(() => {});
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
