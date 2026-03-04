/**
 * Роуты закупа — только список (GET)
 * Добавление/редактирование — через OrderDetails и API orders/:id/procurement
 * RBAC: admin/manager/technologist — полный доступ; operator — только просмотр
 */

const { Op } = require('sequelize');
const db = require('../models');

const express = require('express');
const router = express.Router();
const VALID_STATUSES = ['sent', 'received'];

/**
 * Operator может только просматривать
 */
router.use((req, res, next) => {
  if (req.user?.role === 'operator' && req.method !== 'GET') {
    return res.status(403).json({ error: 'Оператор может только просматривать закуп' });
  }
  return next();
});

/**
 * Проверка доступа по роли и этажу
 */
async function checkProcurementAccess(req, orderId) {
  if (['admin', 'manager'].includes(req.user.role)) return true;
  if (req.user.role === 'technologist' && req.allowedFloorId) {
    const order = await db.Order.findByPk(orderId, { attributes: ['floor_id', 'building_floor_id'] });
    if (!order) return false;
    const orderFloor = order.building_floor_id ?? order.floor_id;
    return orderFloor != null && Number(orderFloor) === Number(req.allowedFloorId);
  }
  if (req.user.role === 'operator' && req.user.Sewer) {
    const count = await db.OrderOperation.count({
      where: { order_id: orderId, sewer_id: req.user.Sewer.id },
    });
    return count > 0;
  }
  return true;
}

/**
 * GET /api/procurement
 * Список закупов для страницы «Закуп»
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, q, date_from, date_to } = req.query;
    const where = {};

    if (status && VALID_STATUSES.includes(String(status))) {
      where.status = status;
    } else {
      where.status = { [Op.in]: ['sent', 'received'] };
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
        { '$Order.Client.name$': { [Op.iLike]: term } },
      ];
    }

    const requests = await db.ProcurementRequest.findAll({
      where,
      include: [
        { model: db.ProcurementItem, as: 'ProcurementItems', attributes: ['purchased_sum'] },
        {
          model: db.Order,
          as: 'Order',
          attributes: ['id', 'title', 'tz_code', 'model_name', 'deadline'],
          where: Object.keys(ordersWhere).length ? ordersWhere : undefined,
          required: !!Object.keys(ordersWhere).length,
          include: [{ model: db.Client, as: 'Client', attributes: ['name'] }],
        },
      ],
      order: [['created_at', 'DESC']],
    });

    const out = [];
    for (const r of requests) {
      const hasAccess = await checkProcurementAccess(req, r.order_id);
      if (!hasAccess) continue;

      const itemsSum = (r.ProcurementItems || []).reduce((s, i) => s + Number(i.purchased_sum || 0), 0);
      const totalSum = Number(r.total_sum || itemsSum || 0);

      // Единый дедлайн: due_date заявки или дедлайн заказа (как в модалке)
      const dueDate = r.due_date ?? r.Order?.deadline ?? null;
      out.push({
        order_id: r.order_id,
        procurement_id: r.id,
        tz_code: r.Order?.tz_code || '',
        model_name: r.Order?.model_name || '',
        title: r.Order?.title || '',
        client_name: r.Order?.Client?.name || '—',
        procurement: {
          id: r.id,
          status: r.status || 'draft',
          due_date: dueDate,
          total_sum: Number(totalSum.toFixed(2)),
          updated_at: r.updated_at,
        },
      });
    }

    res.json(out);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/procurement/:id
 * Детали заявки на закуп (для модалки завершения на странице "Закуп")
 */
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Некорректный id заявки' });

    const pr = await db.ProcurementRequest.findByPk(id, {
      include: [
        { model: db.ProcurementItem, as: 'ProcurementItems', order: [['id', 'ASC']] },
        {
          model: db.Order,
          as: 'Order',
          attributes: ['id', 'title', 'tz_code', 'model_name', 'deadline', 'total_quantity', 'quantity'],
          include: [{ model: db.Client, as: 'Client', attributes: ['name'] }],
        },
      ],
    });
    if (!pr) return res.status(404).json({ error: 'Заявка не найдена' });

    const hasAccess = await checkProcurementAccess(req, pr.order_id);
    if (!hasAccess) return res.status(403).json({ error: 'Нет доступа' });

    const items = (pr.ProcurementItems || []).map((item) => ({
      id: item.id,
      material_name: item.material_name || '',
      planned_qty: Number(item.planned_qty || 0),
      unit: String(item.unit || 'шт').toLowerCase(),
      purchased_qty: Number(item.purchased_qty || 0),
      purchased_price: Number(item.purchased_price || 0),
      purchased_sum: Number(item.purchased_sum || 0),
    }));
    const totalSum = items.reduce((acc, i) => acc + Number(i.purchased_sum || 0), 0);

    res.json({
      id: pr.id,
      order_id: pr.order_id,
      order: {
        id: pr.Order?.id,
        title: pr.Order?.title,
        tz_code: pr.Order?.tz_code || '',
        model_name: pr.Order?.model_name || '',
        client_name: pr.Order?.Client?.name || '—',
        total_quantity: pr.Order?.total_quantity ?? pr.Order?.quantity ?? 0,
        deadline: pr.Order?.deadline,
      },
      procurement: {
        id: pr.id,
        status: pr.status || 'draft',
        due_date: pr.due_date ?? pr.Order?.deadline ?? null,
        total_sum: Number(totalSum.toFixed(2)),
        completed_at: pr.completed_at ?? null,
      },
      items,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/procurement/:id/complete
 * Завершение закупа (только purchased_qty, purchased_price). Вызывается со страницы "Закуп".
 * material_name, planned_qty, unit — НЕ меняются.
 */
router.put('/:id/complete', async (req, res, next) => {
  if (req.user?.role === 'operator') {
    return res.status(403).json({ error: 'Оператор может только просматривать закуп' });
  }

  const t = await db.sequelize.transaction();
  try {
    const id = parseInt(req.params.id, 10);
    const { items: bodyItems } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Некорректный id заявки' });

    if (!['admin', 'manager', 'technologist'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Только admin/manager/technologist могут завершать закуп' });
    }

    const pr = await db.ProcurementRequest.findOne({
      where: { id },
      include: [{ model: db.ProcurementItem, as: 'ProcurementItems' }],
      transaction: t,
    });
    if (!pr) return res.status(404).json({ error: 'Заявка не найдена' });

    const hasAccess = await checkProcurementAccess(req, pr.order_id);
    if (!hasAccess) return res.status(403).json({ error: 'Нет доступа' });

    if (pr.status !== 'sent') {
      await t.rollback();
      return res.status(400).json({ error: 'Завершить можно только заявку со статусом sent' });
    }

    // Обновляем только purchased_qty, purchased_price. material_name, planned_qty, unit не трогаем
    let totalSum = 0;
    if (Array.isArray(bodyItems) && bodyItems.length > 0) {
      for (const it of bodyItems) {
        const itemId = it.id ? parseInt(it.id, 10) : null;
        if (!itemId) continue;
        const item = (pr.ProcurementItems || []).find((i) => i.id === itemId);
        if (!item) continue;
        const pqty = Number(it.purchased_qty) || 0;
        const pprice = Number(it.purchased_price) || 0;
        const psum = Number((pqty * pprice).toFixed(2));
        await item.update(
          { purchased_qty: pqty, purchased_price: pprice, purchased_sum: psum },
          { transaction: t }
        );
        totalSum += psum;
      }
    }

    const order = await db.Order.findByPk(pr.order_id, {
      attributes: ['id', 'quantity', 'total_quantity', 'floor_id', 'building_floor_id'],
      transaction: t,
    });

    await pr.update(
      {
        status: 'received',
        completed_at: new Date(),
        ...(totalSum > 0 && { total_sum: Number(totalSum.toFixed(2)) }),
      },
      { transaction: t }
    );

    // Обновить этап procurement в заказе: status = DONE, actual_end_date = today
    const operations = await db.Operation.findAll({ attributes: ['id', 'name'], transaction: t, raw: true });
    const procOp = operations.find((op) => String(op.name || '').toLowerCase().includes('закуп'));
    const procOpId = procOp?.id || (operations[0]?.id ?? null);
    if (procOpId && order) {
      const orderOp = await db.OrderOperation.findOne({
        where: { order_id: pr.order_id, operation_id: procOpId },
        transaction: t,
      });
      if (orderOp) {
        const orderQty = Number(order.total_quantity ?? order.quantity ?? 0);
        const today = new Date().toISOString().slice(0, 10);
        await orderOp.update(
          { actual_qty: orderQty, status: 'DONE', actual_end_date: today },
          { transaction: t }
        );
      }
    }

    const { logAudit } = require('../utils/audit');
    await logAudit(req.user.id, 'UPDATE', 'procurement_request', pr.id);

    await t.commit();
    return res.json({ ok: true, status: 'received' });
  } catch (err) {
    await t.rollback().catch(() => {});
    next(err);
  }
});

module.exports = router;
