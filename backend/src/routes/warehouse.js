/**
 * Роуты склада
 * MVP: остатки, приход/расход, привязка расхода к заказу
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { logAudit } = require('../utils/audit');

const router = express.Router();

const VALID_UNITS = ['РУЛОН', 'КГ', 'ТОННА', 'ШТ'];
const VALID_MOVEMENT_TYPES = ['ПРИХОД', 'РАСХОД'];

/**
 * GET /api/warehouse/items
 * Список складских позиций с остатками
 */
router.get('/items', async (req, res, next) => {
  try {
    const items = await db.WarehouseItem.findAll({
      order: [['name']],
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/warehouse/items
 * Создать позицию (admin/manager)
 */
router.post('/items', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const { name, unit } = req.body;
    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: 'Укажите наименование' });
    }
    if (!unit || !VALID_UNITS.includes(unit)) {
      return res.status(400).json({ error: 'Единица: РУЛОН, КГ, ТОННА или ШТ' });
    }
    const item = await db.WarehouseItem.create({
      name: String(name).trim(),
      unit,
      stock_quantity: 0,
    });
    await logAudit(req.user.id, 'CREATE', 'warehouse_item', item.id);
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/warehouse/movements
 * Приход или расход
 * body: { item_id, type: 'ПРИХОД'|'РАСХОД', quantity, order_id?, comment? }
 */
router.post('/movements', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const { item_id, type, quantity, order_id, comment } = req.body;

    if (!item_id) return res.status(400).json({ error: 'Укажите item_id' });
    if (!type || !VALID_MOVEMENT_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Тип: ПРИХОД или РАСХОД' });
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Количество должно быть больше 0' });
    }

    const item = await db.WarehouseItem.findByPk(item_id, { transaction: t });
    if (!item) {
      await t.rollback();
      return res.status(404).json({ error: 'Позиция не найдена' });
    }

    const currentStock = parseFloat(item.stock_quantity) || 0;
    let newStock;
    if (type === 'ПРИХОД') {
      newStock = currentStock + qty;
    } else {
      if (currentStock < qty) {
        await t.rollback();
        return res.status(400).json({ error: `Недостаточно остатка. На складе: ${currentStock}` });
      }
      newStock = currentStock - qty;
    }

    await db.WarehouseMovement.create({
      item_id,
      type,
      quantity: qty,
      order_id: order_id || null,
      comment: comment ? String(comment).trim() : null,
    }, { transaction: t });

    await item.update({ stock_quantity: newStock }, { transaction: t });
    await t.commit();

    await logAudit(req.user.id, 'CREATE', 'warehouse_movement', item_id);
    const updated = await db.WarehouseItem.findByPk(item_id);
    res.status(201).json(updated);
  } catch (err) {
    await t.rollback();
    next(err);
  }
});

/**
 * GET /api/warehouse/movements
 * История движений (опционально по item_id, order_id)
 */
router.get('/movements', async (req, res, next) => {
  try {
    const { item_id, order_id } = req.query;
    const where = {};
    if (item_id) where.item_id = item_id;
    if (order_id) where.order_id = order_id;

    const movements = await db.WarehouseMovement.findAll({
      where,
      include: [
        { model: db.WarehouseItem, as: 'WarehouseItem' },
        { model: db.Order, as: 'Order', include: [{ model: db.Client, as: 'Client' }] },
      ],
      order: [['created_at', 'DESC']],
      limit: 200,
    });
    res.json(movements);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
