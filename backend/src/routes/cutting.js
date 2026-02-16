/**
 * Роуты раскроя
 * MVP: задачи на раскрой по заказам, по типу
 */

const express = require('express');
const db = require('../models');
const { logAudit } = require('../utils/audit');

const router = express.Router();

/**
 * GET /api/cutting/tasks?cutting_type=Аксы|cutting_type=Аутсорс|...
 * Список задач раскроя по типу
 */
router.get('/tasks', async (req, res, next) => {
  try {
    const { cutting_type } = req.query;
    const where = {};
    if (cutting_type) where.cutting_type = cutting_type;

    const tasks = await db.CuttingTask.findAll({
      where,
      include: [
        {
          model: db.Order,
          as: 'Order',
          include: [
            { model: db.Client, as: 'Client' },
            { model: db.OrderStatus, as: 'OrderStatus' },
            { model: db.OrderVariant, as: 'OrderVariants', include: [{ model: db.Size, as: 'Size' }] },
          ],
        },
      ],
      order: [['created_at', 'DESC']],
    });

    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/cutting/tasks
 * Добавить задачу на раскрой
 * body: { order_id, cutting_type, operation?, status?, responsible? }
 */
router.post('/tasks', async (req, res, next) => {
  try {
    const { order_id, cutting_type, operation, status, responsible } = req.body;

    if (!order_id) return res.status(400).json({ error: 'Укажите order_id' });
    if (!cutting_type || String(cutting_type).trim() === '') {
      return res.status(400).json({ error: 'Укажите тип раскроя' });
    }

    const order = await db.Order.findByPk(order_id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    // Технолог — только свой этаж
    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const orderFloor = order.building_floor_id ?? order.floor_id;
      if (orderFloor == null || Number(orderFloor) !== Number(req.allowedFloorId)) {
        return res.status(403).json({ error: 'Нет доступа к этому заказу' });
      }
    }

    const task = await db.CuttingTask.create({
      order_id,
      cutting_type: String(cutting_type).trim(),
      operation: operation ? String(operation).trim() : null,
      status: status || 'Ожидает',
      responsible: responsible ? String(responsible).trim() : null,
    });

    await logAudit(req.user.id, 'CREATE', 'cutting_task', task.id);
    const full = await db.CuttingTask.findByPk(task.id, {
      include: [{ model: db.Order, as: 'Order', include: [{ model: db.Client, as: 'Client' }] }],
    });
    res.status(201).json(full);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/cutting/tasks/:id
 * Редактировать задачу
 */
router.put('/tasks/:id', async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const { operation, status, responsible, actual_variants } = req.body;

    const task = await db.CuttingTask.findByPk(taskId, {
      include: [{ model: db.Order, as: 'Order' }],
    });
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const orderFloor = task.Order?.building_floor_id ?? task.Order?.floor_id;
      if (orderFloor == null || Number(orderFloor) !== Number(req.allowedFloorId)) {
        return res.status(403).json({ error: 'Нет доступа' });
      }
    }

    const updates = {};
    if (operation !== undefined) updates.operation = operation ? String(operation).trim() : null;
    if (status !== undefined) updates.status = String(status).trim() || 'Ожидает';
    if (responsible !== undefined) updates.responsible = responsible ? String(responsible).trim() : null;
    if (actual_variants !== undefined) updates.actual_variants = Array.isArray(actual_variants) ? actual_variants : null;

    await task.update(updates);
    await logAudit(req.user.id, 'UPDATE', 'cutting_task', taskId);
    res.json(task);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/cutting/tasks/:id
 */
router.delete('/tasks/:id', async (req, res, next) => {
  try {
    const task = await db.CuttingTask.findByPk(req.params.id, {
      include: [{ model: db.Order, as: 'Order' }],
    });
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const orderFloor = task.Order?.building_floor_id ?? task.Order?.floor_id;
      if (orderFloor == null || Number(orderFloor) !== Number(req.allowedFloorId)) {
        return res.status(403).json({ error: 'Нет доступа' });
      }
    }

    await task.destroy();
    await logAudit(req.user.id, 'DELETE', 'cutting_task', task.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
