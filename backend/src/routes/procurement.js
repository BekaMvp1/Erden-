/**
 * Роуты закупа
 * RBAC: admin/manager — полный доступ; technologist — просмотр + добавление позиций только для своего этажа; operator — нет доступа
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { logAudit } = require('../utils/audit');

const router = express.Router();

const VALID_UNITS = ['РУЛОН', 'КГ', 'ТОННА', 'МЕТР', 'ШТ'];
const VALID_STATUSES = ['Ожидает закуп', 'Закуплено', 'Частично', 'Отменено'];
const API_STATUS_TO_DB = {
  draft: 'Ожидает закуп',
  sent: 'Частично',
  received: 'Закуплено',
  canceled: 'Отменено',
};
const DB_STATUS_TO_API = {
  'Ожидает закуп': 'draft',
  'Частично': 'sent',
  'Закуплено': 'received',
  'Отменено': 'canceled',
};

/**
 * Оператор может только просматривать закуп
 */
router.use((req, res, next) => {
  if (req.user?.role === 'operator' && req.method !== 'GET') {
    return res.status(403).json({ error: 'Оператор может только просматривать закуп' });
  }
  return next();
});

/**
 * Проверка доступа к закупу по заказу (для технолога — только свой этаж)
 */
async function checkProcurementAccess(req, orderId) {
  if (['admin', 'manager'].includes(req.user.role)) return true;
  if (req.user.role === 'operator' && req.user.Sewer) {
    const myOps = await db.OrderOperation.count({
      where: { order_id: orderId, sewer_id: req.user.Sewer.id },
    });
    return myOps > 0;
  }
  if (req.user.role === 'technologist' && req.allowedFloorId) {
    const order = await db.Order.findByPk(orderId, { attributes: ['floor_id', 'building_floor_id'] });
    if (!order) return false;
    const orderFloor = order.building_floor_id ?? order.floor_id;
    return orderFloor != null && Number(orderFloor) === Number(req.allowedFloorId);
  }
  return true;
}

/**
 * GET /api/procurement
 * Режим списка для страницы «Закуп»: readonly + фильтры
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, q, date_from, date_to } = req.query;
    const where = {};
    const requestedStatus = API_STATUS_TO_DB[status] || status;
    if (requestedStatus && VALID_STATUSES.includes(requestedStatus)) {
      where.status = requestedStatus;
    }
    if (date_from || date_to) {
      where.due_date = {};
      if (date_from) where.due_date[Op.gte] = date_from;
      if (date_to) where.due_date[Op.lte] = date_to;
    }

    const ordersWhere = {};
    if (q && String(q).trim()) {
      const term = `%${String(q).trim()}%`;
      ordersWhere[Op.or] = [
        { title: { [Op.iLike]: term } },
        { tz_code: { [Op.iLike]: term } },
        { model_name: { [Op.iLike]: term } },
        { '$Order->Client.name$': { [Op.iLike]: term } },
      ];
    }

    const requests = await db.ProcurementRequest.findAll({
      where,
      include: [
        { model: db.ProcurementItem, as: 'ProcurementItems', attributes: ['total'] },
        {
          model: db.Order,
          as: 'Order',
          where: ordersWhere,
          include: [
            { model: db.Client, as: 'Client', attributes: ['name'] },
            { model: db.OrderVariant, as: 'OrderVariants', attributes: ['color', 'quantity'] },
          ],
        },
      ],
      order: [['created_at', 'DESC']],
    });

    const out = [];
    for (const r of requests) {
      const hasAccess = await checkProcurementAccess(req, r.order_id);
      if (!hasAccess) continue;

      const colorsMap = (r.Order?.OrderVariants || []).reduce((acc, variant) => {
        const key = String(variant.color || '').trim();
        if (!key) return acc;
        acc[key] = (acc[key] || 0) + Number(variant.quantity || 0);
        return acc;
      }, {});
      const colorsSummary = Object.entries(colorsMap)
        .map(([color, qty]) => `${color}: ${qty}`)
        .join(', ');
      const totalItemsSum = (r.ProcurementItems || []).reduce((sum, item) => sum + Number(item.total || 0), 0);
      const totalSum = Number(r.total_sum || totalItemsSum || 0);

      out.push({
        order_id: r.order_id,
        tz_code: r.Order?.tz_code || '',
        model_name: r.Order?.model_name || '',
        title: r.Order?.title || '',
        client_name: r.Order?.Client?.name || '—',
        colors_summary: colorsSummary || '—',
        procurement: {
          status: DB_STATUS_TO_API[r.status] || 'draft',
          status_label: r.status,
          due_date: r.due_date || null,
          total_sum: Number(totalSum.toFixed(2)),
        },
      });
    }

    res.json(out);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/procurement/items/:itemId
 * Редактировать позицию закупа
 */
router.put('/items/:itemId', async (req, res, next) => {
  try {
    const itemId = parseInt(req.params.itemId, 10);
    const { name, unit, quantity, price, supplier, comment } = req.body;

    const item = await db.ProcurementItem.findByPk(itemId, {
      include: [{ model: db.ProcurementRequest, as: 'ProcurementRequest' }],
    });
    if (!item) {
      return res.status(404).json({ error: 'Позиция не найдена' });
    }

    const hasAccess = await checkProcurementAccess(req, item.ProcurementRequest.order_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Нет доступа к закупу этого заказа' });
    }

    if (req.user.role === 'technologist') {
      return res.status(403).json({ error: 'Технолог может только добавлять позиции, редактирование — у admin/manager' });
    }

    const updates = {};
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'Наименование не может быть пустым' });
      updates.name = String(name).trim();
    }
    if (unit !== undefined) {
      if (!VALID_UNITS.includes(unit)) return res.status(400).json({ error: 'Единица: РУЛОН, КГ или ТОННА' });
      updates.unit = unit;
    }
    if (quantity !== undefined) {
      const qty = parseFloat(quantity);
      if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: 'Количество должно быть > 0' });
      updates.quantity = qty;
    }
    if (price !== undefined) {
      const pr = parseFloat(price);
      if (isNaN(pr) || pr < 0) return res.status(400).json({ error: 'Цена должна быть >= 0' });
      updates.price = pr;
    }
    if (supplier !== undefined) updates.supplier = supplier ? String(supplier).trim() : null;
    if (comment !== undefined) updates.comment = comment ? String(comment).trim() : null;

    const qty = updates.quantity ?? parseFloat(item.quantity);
    const pr = updates.price ?? parseFloat(item.price);
    updates.total = Math.round(qty * pr * 100) / 100;

    await item.update(updates);
    await logAudit(req.user.id, 'UPDATE', 'procurement_item', itemId);

    res.json(item);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/procurement/items/:itemId
 * Удалить позицию закупа
 */
router.delete('/items/:itemId', async (req, res, next) => {
  try {
    const itemId = parseInt(req.params.itemId, 10);

    const item = await db.ProcurementItem.findByPk(itemId, {
      include: [{ model: db.ProcurementRequest, as: 'ProcurementRequest' }],
    });
    if (!item) {
      return res.status(404).json({ error: 'Позиция не найдена' });
    }

    const hasAccess = await checkProcurementAccess(req, item.ProcurementRequest.order_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Нет доступа к закупу этого заказа' });
    }

    if (req.user.role === 'technologist') {
      return res.status(403).json({ error: 'Технолог не может удалять позиции' });
    }

    await item.destroy();
    await logAudit(req.user.id, 'DELETE', 'procurement_item', itemId);

    res.json({ ok: true, message: 'Позиция удалена' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/procurement/:requestId/items
 * Добавить позицию закупа
 */
router.post('/:requestId/items', async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.requestId, 10);
    const { name, unit, quantity, price, supplier, comment } = req.body;

    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: 'Наименование не может быть пустым' });
    }
    if (!unit || !VALID_UNITS.includes(unit)) {
      return res.status(400).json({ error: 'Единица измерения: РУЛОН, КГ или ТОННА' });
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Количество должно быть больше 0' });
    }
    const pr = parseFloat(price);
    if (isNaN(pr) || pr < 0) {
      return res.status(400).json({ error: 'Цена должна быть >= 0' });
    }

    const procurementRequest = await db.ProcurementRequest.findByPk(requestId, {
      include: [{ model: db.Order, as: 'Order' }],
    });
    if (!procurementRequest) {
      return res.status(404).json({ error: 'Заявка на закуп не найдена' });
    }

    const hasAccess = await checkProcurementAccess(req, procurementRequest.order_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Нет доступа к закупу этого заказа' });
    }

    // Технолог может только добавлять, не редактировать/удалять — проверка в PUT/DELETE
    const total = Math.round(qty * pr * 100) / 100;

    const item = await db.ProcurementItem.create({
      procurement_request_id: requestId,
      name: String(name).trim(),
      unit,
      quantity: qty,
      price: pr,
      total,
      supplier: supplier ? String(supplier).trim() : null,
      comment: comment ? String(comment).trim() : null,
    });

    await logAudit(req.user.id, 'CREATE', 'procurement_item', item.id);

    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/procurement/:requestId/status
 * Изменить статус закупа
 */
router.put('/:requestId/status', async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.requestId, 10);
    const { status } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Статус: Ожидает закуп, Закуплено, Частично или Отменено' });
    }

    const procurementRequest = await db.ProcurementRequest.findByPk(requestId);
    if (!procurementRequest) {
      return res.status(404).json({ error: 'Заявка на закуп не найдена' });
    }

    const hasAccess = await checkProcurementAccess(req, procurementRequest.order_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Нет доступа к закупу этого заказа' });
    }

    if (req.user.role === 'technologist') {
      return res.status(403).json({ error: 'Технолог не может менять статус закупа' });
    }

    await procurementRequest.update({ status });
    await logAudit(req.user.id, 'UPDATE', 'procurement_request', requestId);

    res.json(procurementRequest);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
