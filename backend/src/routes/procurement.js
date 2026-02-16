/**
 * Роуты закупа
 * RBAC: admin/manager — полный доступ; technologist — просмотр + добавление позиций только для своего этажа; operator — нет доступа
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { logAudit } = require('../utils/audit');

const router = express.Router();

const VALID_UNITS = ['РУЛОН', 'КГ', 'ТОННА'];
const VALID_STATUSES = ['Ожидает закуп', 'Закуплено', 'Частично', 'Отменено'];

/**
 * Проверка доступа к закупу по заказу (для технолога — только свой этаж)
 */
async function checkProcurementAccess(req, orderId) {
  if (['admin', 'manager'].includes(req.user.role)) return true;
  if (req.user.role === 'operator') return false;
  if (req.user.role === 'technologist' && req.allowedFloorId) {
    const order = await db.Order.findByPk(orderId, { attributes: ['floor_id', 'building_floor_id'] });
    if (!order) return false;
    const orderFloor = order.building_floor_id ?? order.floor_id;
    return orderFloor != null && Number(orderFloor) === Number(req.allowedFloorId);
  }
  return true;
}

/**
 * GET /api/procurement?order_id= | ?awaiting=1 | ?list=1
 * order_id — закуп для конкретного заказа
 * awaiting=1 — первый закуп со статусом «Ожидает закуп»
 * list=1 — список всех закупов (для отображения списком)
 */
router.get('/', async (req, res, next) => {
  try {
    const orderId = req.query.order_id;
    const awaiting = req.query.awaiting === '1';
    const list = req.query.list === '1';

    if (list) {
      const requests = await db.ProcurementRequest.findAll({
        include: [
          { model: db.ProcurementItem, as: 'ProcurementItems' },
          {
            model: db.Order,
            as: 'Order',
            include: [
              { model: db.Client, as: 'Client' },
              { model: db.OrderStatus, as: 'OrderStatus' },
              { model: db.OrderVariant, as: 'OrderVariants' },
            ],
          },
        ],
        order: [['created_at', 'DESC']],
      });
      const filtered = [];
      for (const r of requests) {
        const hasAccess = await checkProcurementAccess(req, r.order_id);
        if (hasAccess) filtered.push(r);
      }
      return res.json(filtered);
    }

    let request;

    if (orderId) {
      const hasAccess = await checkProcurementAccess(req, orderId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Нет доступа к закупу этого заказа' });
      }
      request = await db.ProcurementRequest.findOne({
        where: { order_id: orderId },
        include: [
        { model: db.ProcurementItem, as: 'ProcurementItems' },
        {
          model: db.Order,
          as: 'Order',
          include: [
            { model: db.Client, as: 'Client' },
            { model: db.OrderStatus, as: 'OrderStatus' },
            { model: db.OrderVariant, as: 'OrderVariants' },
          ],
        },
      ],
    });
    } else if (awaiting) {
      const where = { status: 'Ожидает закуп' };
      const include = [
        { model: db.ProcurementItem, as: 'ProcurementItems' },
        {
          model: db.Order,
          as: 'Order',
          include: [
            { model: db.Client, as: 'Client' },
            { model: db.OrderStatus, as: 'OrderStatus' },
            { model: db.OrderVariant, as: 'OrderVariants' },
          ],
        },
      ];
      const requests = await db.ProcurementRequest.findAll({
        where,
        include,
        order: [['created_at', 'ASC']],
      });
      for (const r of requests) {
        const hasAccess = await checkProcurementAccess(req, r.order_id);
        if (hasAccess) {
          request = r;
          break;
        }
      }
    } else {
      return res.status(400).json({ error: 'Укажите order_id, awaiting=1 или list=1' });
    }

    if (!request) {
      return res.status(404).json({ error: 'Заявка на закуп не найдена' });
    }

    res.json(request);
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
