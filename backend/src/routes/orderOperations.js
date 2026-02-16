/**
 * Роуты операций заказа
 * GET /floor-tasks?floor_id= — задачи по этажу
 * PUT /:id/status — смена статуса (с проверкой производственной цепочки)
 * PUT /:id/variants — обновление actual_qty
 * POST /:id/complete — завершение операции
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { logAudit } = require('../utils/audit');

const router = express.Router();

const VALID_STATUSES = ['Ожидает', 'В работе', 'Готово'];

/** Проверка прав: operator — только свои, technologist — свой этаж, admin/manager — все */
async function checkOperationAccess(req, orderOp) {
  if (req.user.role === 'admin' || req.user.role === 'manager') return true;
  if (req.user.role === 'operator') {
    return req.user.Sewer && orderOp.sewer_id === req.user.Sewer.id;
  }
  if (req.user.role === 'technologist') {
    const allowed = req.allowedBuildingFloorId ?? req.allowedFloorId;
    return allowed && Number(orderOp.floor_id) === Number(allowed);
  }
  return false;
}

/**
 * Проверка производственной цепочки перед сменой статуса
 * Возвращает { ok: boolean, error?: string }
 */
async function validateStatusChange(orderOp, newStatus, isAdmin) {
  const category = orderOp.Operation?.category;
  const currentStatus = orderOp.status || 'Ожидает';

  // Допустимые переходы: Ожидает → В работе → Готово
  const validTransitions = {
    'Ожидает': ['В работе'],
    'В работе': ['Готово'],
    'Готово': isAdmin ? ['В работе', 'Ожидает'] : [], // admin может откатить
  };
  const allowed = validTransitions[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    if (currentStatus === 'Ожидает' && newStatus === 'Готово') {
      return { ok: false, error: 'Нельзя сразу завершить операцию. Сначала переведите в «В работе».' };
    }
    if (currentStatus === 'Готово' && !isAdmin) {
      return { ok: false, error: 'Нельзя отменить завершённую операцию.' };
    }
    return { ok: false, error: `Недопустимый переход: ${currentStatus} → ${newStatus}` };
  }

  // Получить все операции заказа для проверки цепочки
  const allOps = await db.OrderOperation.findAll({
    where: { order_id: orderOp.order_id },
    include: [{ model: db.Operation, as: 'Operation' }],
  });

  const cuttingOps = allOps.filter((o) => o.Operation?.category === 'CUTTING');
  const sewingOps = allOps.filter((o) => o.Operation?.category === 'SEWING');
  const allCuttingDone = cuttingOps.length === 0 || cuttingOps.every((o) => (o.status || 'Ожидает') === 'Готово');
  const allSewingDone = sewingOps.length === 0 || sewingOps.every((o) => (o.status || 'Ожидает') === 'Готово');

  // SEWING: нельзя завершить, пока раскрой не завершён
  if (category === 'SEWING' && newStatus === 'Готово' && !allCuttingDone) {
    return { ok: false, error: 'Раскрой ещё не завершён. Дождитесь завершения всех операций раскроя.' };
  }

  // FINISH: нельзя начать или завершить, пока раскрой и пошив не завершены
  if (category === 'FINISH' && (newStatus === 'В работе' || newStatus === 'Готово')) {
    if (!allCuttingDone || !allSewingDone) {
      return { ok: false, error: 'Нельзя начать/завершить финишную операцию. Не завершены этапы раскроя или пошива.' };
    }
  }

  return { ok: true };
}

/**
 * Вычислить canStart, canComplete, blockReason для задачи (для frontend)
 */
async function getChainStatus(orderOp) {
  const category = orderOp.Operation?.category;
  const status = orderOp.status || 'Ожидает';

  const allOps = await db.OrderOperation.findAll({
    where: { order_id: orderOp.order_id },
    include: [{ model: db.Operation, as: 'Operation' }],
  });
  const cuttingOps = allOps.filter((o) => o.Operation?.category === 'CUTTING');
  const sewingOps = allOps.filter((o) => o.Operation?.category === 'SEWING');
  const allCuttingDone = cuttingOps.length === 0 || cuttingOps.every((o) => (o.status || 'Ожидает') === 'Готово');
  const allSewingDone = sewingOps.length === 0 || sewingOps.every((o) => (o.status || 'Ожидает') === 'Готово');

  let canStart = true;
  let canComplete = true;
  let blockReason = '';

  if (category === 'SEWING') {
    if (!allCuttingDone) {
      canComplete = false;
      blockReason = 'Раскрой ещё не завершён';
    }
  }
  if (category === 'FINISH') {
    if (!allCuttingDone || !allSewingDone) {
      canStart = false;
      canComplete = false;
      blockReason = 'Дождитесь завершения раскроя и пошива';
    }
  }

  return { canStart, canComplete, blockReason };
}

/**
 * GET /api/order-operations/floor-tasks?floor_id=2|3
 * Задачи раскроя/пошива/финиша по этажу
 * floor_id=1 — только FINISH, floor_id=2,3,4 — CUTTING и SEWING
 */
router.get('/floor-tasks', async (req, res, next) => {
  try {
    const floorId = req.query.floor_id;
    if (!floorId) return res.status(400).json({ error: 'Укажите floor_id' });

    const fid = Number(floorId);
    const floor = await db.BuildingFloor.findByPk(fid);
    if (!floor) return res.status(400).json({ error: 'Этаж не найден' });

    const where = { floor_id: fid };

    if (req.user.role === 'technologist') {
      const allowed = req.allowedBuildingFloorId ?? req.allowedFloorId;
      if (!allowed || fid !== Number(allowed)) {
        return res.status(403).json({ error: 'Нет доступа к этому этажу' });
      }
    }

    // Оператор видит только свои операции (где sewer_id = его Sewer.id)
    if (req.user.role === 'operator' && req.user.Sewer) {
      where.sewer_id = req.user.Sewer.id;
    }

    const tasks = await db.OrderOperation.findAll({
      where,
      include: [
        { model: db.Operation, as: 'Operation' },
        {
          model: db.Order,
          as: 'Order',
          include: [
            { model: db.Client, as: 'Client' },
            { model: db.Technologist, as: 'Technologist', include: [{ model: db.User, as: 'User' }] },
          ],
        },
        { model: db.Sewer, as: 'Sewer', include: [{ model: db.User, as: 'User' }] },
        { model: db.BuildingFloor, as: 'Floor', foreignKey: 'floor_id' },
        { model: db.OrderOperationVariant, as: 'OrderOperationVariants' },
      ],
      order: [
        ['planned_date', 'ASC'],
        ['order_id', 'ASC'],
      ],
    });

    // Добавить canStart, canComplete, blockReason для каждой задачи
    const enriched = await Promise.all(
      tasks.map(async (t) => {
        const chain = await getChainStatus(t);
        return { ...t.toJSON(), ...chain };
      })
    );

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/order-operations/:id/status
 * Смена статуса операции с проверкой производственной цепочки
 * body: { status: 'Ожидает'|'В работе'|'Готово' }
 */
router.put('/:id/status', async (req, res, next) => {
  try {
    const id = req.params.id;
    const { status: newStatus } = req.body;

    if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
      return res.status(400).json({ error: 'Укажите status: Ожидает, В работе или Готово' });
    }

    const orderOp = await db.OrderOperation.findByPk(id, {
      include: [{ model: db.Operation, as: 'Operation' }],
    });
    if (!orderOp) return res.status(404).json({ error: 'Операция не найдена' });

    const canEdit = await checkOperationAccess(req, orderOp);
    if (!canEdit) {
      return res.status(403).json({ error: 'Нет прав менять статус этой операции' });
    }

    const isAdmin = req.user.role === 'admin';
    const validation = await validateStatusChange(orderOp, newStatus, isAdmin);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    await orderOp.update({ status: newStatus });
    await logAudit(req.user.id, 'UPDATE_STATUS', 'order_operation', id);

    const result = await db.OrderOperation.findByPk(id, {
      include: [
        { model: db.Operation, as: 'Operation' },
        { model: db.OrderOperationVariant, as: 'OrderOperationVariants' },
      ],
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/order-operations/:id/variants
 * Обновление actual_qty по строкам цвет/размер
 * body: { variants: [{ color, size, actual_qty }] }
 */
router.put('/:id/variants', async (req, res, next) => {
  try {
    const id = req.params.id;
    const { variants } = req.body;

    if (!Array.isArray(variants)) {
      return res.status(400).json({ error: 'Укажите массив variants' });
    }

    const orderOp = await db.OrderOperation.findByPk(id, {
      include: [
        { model: db.Operation, as: 'Operation' },
        { model: db.OrderOperationVariant, as: 'OrderOperationVariants' },
      ],
    });
    if (!orderOp) return res.status(404).json({ error: 'Операция не найдена' });

    const canEdit = await checkOperationAccess(req, orderOp);
    if (!canEdit) {
      return res.status(403).json({ error: 'Нет прав редактировать эту операцию' });
    }

    const variantsMap = new Map(
      orderOp.OrderOperationVariants.map((v) => [`${v.color}|${v.size}`, v])
    );

    for (const v of variants) {
      const { color, size, actual_qty } = v;
      if (!color || !size) continue;

      const key = `${color}|${size}`;
      const row = variantsMap.get(key);
      if (!row) continue;

      const qty = parseInt(actual_qty, 10);
      if (isNaN(qty) || qty < 0) {
        return res.status(400).json({
          error: `actual_qty для ${color}/${size} должно быть >= 0`,
        });
      }
      if (qty > (row.planned_qty || 0)) {
        return res.status(400).json({
          error: `actual_qty для ${color}/${size} не может превышать план (${row.planned_qty})`,
        });
      }

      await row.update({ actual_qty: qty });
    }

    // Пересчёт actual_total
    const updated = await db.OrderOperationVariant.findAll({
      where: { order_operation_id: id },
    });
    const total = updated.reduce((s, r) => s + (r.actual_qty || 0), 0);
    await orderOp.update({ actual_total: total });

    await logAudit(req.user.id, 'UPDATE', 'order_operation_variants', id);

    const result = await db.OrderOperation.findByPk(id, {
      include: [
        { model: db.Operation, as: 'Operation' },
        { model: db.OrderOperationVariant, as: 'OrderOperationVariants' },
      ],
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/order-operations/:id/complete
 * Завершение операции: проверка actual_qty == planned_qty по всем variants
 */
router.post('/:id/complete', async (req, res, next) => {
  try {
    const id = req.params.id;

    const orderOp = await db.OrderOperation.findByPk(id, {
      include: [
        { model: db.Operation, as: 'Operation' },
        { model: db.OrderOperationVariant, as: 'OrderOperationVariants' },
      ],
    });
    if (!orderOp) return res.status(404).json({ error: 'Операция не найдена' });

    const canEdit = await checkOperationAccess(req, orderOp);
    if (!canEdit) {
      return res.status(403).json({ error: 'Нет прав завершать эту операцию' });
    }

    // Проверка производственной цепочки
    const isAdmin = req.user.role === 'admin';
    const validation = await validateStatusChange(orderOp, 'Готово', isAdmin);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const variants = orderOp.OrderOperationVariants || [];
    if (variants.length > 0) {
      const incomplete = variants.filter((v) => (v.actual_qty || 0) !== (v.planned_qty || 0));
      if (incomplete.length > 0) {
        return res.status(400).json({
          error: 'Не все строки выполнены. Факт должен равняться плану по каждой позиции.',
          incomplete: incomplete.map((v) => ({ color: v.color, size: v.size })),
        });
      }
    } else {
      // Операция без вариантов — проверяем actual_quantity >= planned_quantity
      const actual = orderOp.actual_quantity ?? orderOp.actual_total ?? 0;
      const planned = orderOp.planned_quantity ?? orderOp.planned_total ?? 0;
      if (actual < planned) {
        return res.status(400).json({
          error: `Факт (${actual}) меньше плана (${planned})`,
        });
      }
    }

    const total = variants.reduce((s, r) => s + (r.actual_qty || 0), 0);
    await orderOp.update({
      status: 'Готово',
      actual_total: total,
      actual_quantity: total,
    });

    await logAudit(req.user.id, 'COMPLETE', 'order_operation', id);

    const result = await db.OrderOperation.findByPk(id, {
      include: [
        { model: db.Operation, as: 'Operation' },
        { model: db.OrderOperationVariant, as: 'OrderOperationVariants' },
      ],
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/order-operations/:id/floor
 * Изменение этажа операции (только если !locked_to_floor)
 */
router.put('/:id/floor', async (req, res, next) => {
  try {
    const id = req.params.id;
    const { floor_id } = req.body;

    if (!floor_id) return res.status(400).json({ error: 'Укажите floor_id' });

    const orderOp = await db.OrderOperation.findByPk(id, {
      include: [{ model: db.Operation, as: 'Operation' }],
    });
    if (!orderOp) return res.status(404).json({ error: 'Операция не найдена' });

    if (req.user.role !== 'admin' && req.user.role !== 'manager' && req.user.role !== 'technologist') {
      return res.status(403).json({ error: 'Нет прав менять этаж' });
    }

    if (orderOp.Operation?.locked_to_floor) {
      const floorName = orderOp.Operation?.category === 'FINISH' ? '1 (Финиш/ОТК)' : 'закреплённый';
      return res.status(400).json({
        error: `Эта операция закреплена за этажом ${floorName}. Изменить этаж нельзя.`,
      });
    }

    const floor = await db.BuildingFloor.findByPk(floor_id);
    if (!floor) return res.status(400).json({ error: 'Этаж не найден' });

    if (orderOp.Operation?.category === 'FINISH') {
      return res.status(400).json({ error: 'Финишные операции можно размещать только на 1 этаже' });
    }

    if (Number(floor_id) === 1) {
      return res.status(400).json({ error: 'На 1 этаже только финишные операции' });
    }

    await orderOp.update({ floor_id: Number(floor_id) });
    await logAudit(req.user.id, 'UPDATE', 'order_operation_floor', id);

    const result = await db.OrderOperation.findByPk(id, {
      include: [
        { model: db.Operation, as: 'Operation' },
        { model: db.BuildingFloor, as: 'Floor', foreignKey: 'floor_id' },
      ],
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
