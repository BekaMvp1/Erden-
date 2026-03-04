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

const FLOORS = [1, 2, 3, 4];

/**
 * Есть ли пересекающаяся активная задача на том же этаже
 * Пересечение: (start_date <= endDate) AND (end_date >= startDate)
 */
async function hasOverlappingFloorTask(db, floor, excludeTaskId, startDate, endDate) {
  if (!startDate || !endDate) return false;
  const replacements = { floor: Number(floor), startDate, endDate };
  const exclude = excludeTaskId ? 'AND id != :excludeId' : '';
  if (excludeTaskId) replacements.excludeId = parseInt(excludeTaskId, 10);
  const [rows] = await db.sequelize.query(
    `SELECT id FROM cutting_tasks WHERE floor = :floor AND status != 'Готово'
     AND start_date IS NOT NULL AND end_date IS NOT NULL
     AND start_date <= :endDate AND end_date >= :startDate ${exclude} LIMIT 1`,
    { replacements }
  );
  return rows.length > 0;
}

/** Валидация роста: PRESET — 165 или 170, CUSTOM — 120–220 */
function parseHeight(body) {
  const type = body.height_type === 'CUSTOM' ? 'CUSTOM' : 'PRESET';
  let value = parseInt(body.height_value, 10);
  if (type === 'PRESET') {
    if (value !== 165 && value !== 170) value = 170;
  } else {
    if (Number.isNaN(value) || value < 120 || value > 220) value = 170;
  }
  return { height_type: type, height_value: value };
}

/**
 * POST /api/cutting/tasks
 * Добавить задачу на раскрой
 * body: { order_id, cutting_type, floor, operation?, status?, responsible?, start_date?, end_date?, height_type?, height_value? }
 */
router.post('/tasks', async (req, res, next) => {
  try {
    const { order_id, cutting_type, floor, operation, status, responsible, start_date, end_date } = req.body;
    const height = parseHeight(req.body);

    if (!order_id) return res.status(400).json({ error: 'Укажите order_id' });
    if (!cutting_type || String(cutting_type).trim() === '') {
      return res.status(400).json({ error: 'Укажите тип раскроя' });
    }

    const floorNum = floor != null ? parseInt(floor, 10) : null;
    if (floorNum == null || isNaN(floorNum) || !FLOORS.includes(floorNum)) {
      return res.status(400).json({ error: 'Укажите этаж (1–4)' });
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

    if (start_date && end_date) {
      const overlap = await hasOverlappingFloorTask(db, floorNum, null, start_date, end_date);
      if (overlap) {
        return res.status(400).json({ error: 'На этом этаже уже есть активная задача с пересекающимися датами' });
      }
    }

    const task = await db.CuttingTask.create({
      order_id,
      cutting_type: String(cutting_type).trim(),
      floor: floorNum,
      operation: operation ? String(operation).trim() : null,
      status: status || 'Ожидает',
      responsible: responsible ? String(responsible).trim() : null,
      start_date: start_date || null,
      end_date: end_date || null,
      height_type: height.height_type,
      height_value: height.height_value,
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
    const { operation, status, responsible, actual_variants, floor, start_date, end_date } = req.body;
    const height = parseHeight(req.body);

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

    // Этаж можно менять только если задача не завершена
    if (floor !== undefined) {
      if (task.status === 'Готово') {
        return res.status(400).json({ error: 'Нельзя изменить этаж у завершённой задачи' });
      }
      const floorNum = parseInt(floor, 10);
      if (isNaN(floorNum) || !FLOORS.includes(floorNum)) {
        return res.status(400).json({ error: 'Этаж должен быть от 1 до 4' });
      }
      updates.floor = floorNum;
    }
    if (start_date !== undefined) updates.start_date = start_date || null;
    if (end_date !== undefined) updates.end_date = end_date || null;
    if (req.body.height_type !== undefined || req.body.height_value !== undefined) {
      updates.height_type = height.height_type;
      updates.height_value = height.height_value;
    }

    // При смене этажа или дат — проверка пересечений (если задача не завершена и есть даты)
    const newFloor = updates.floor ?? task.floor;
    const newStart = updates.start_date ?? task.start_date;
    const newEnd = updates.end_date ?? task.end_date;
    if (task.status !== 'Готово' && newStart && newEnd) {
      const overlap = await hasOverlappingFloorTask(db, newFloor, taskId, newStart, newEnd);
      if (overlap) {
        return res.status(400).json({ error: 'На этом этаже уже есть активная задача с пересекающимися датами' });
      }
    }

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
