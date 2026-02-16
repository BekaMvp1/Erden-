/**
 * Роуты настроек
 */

const express = require('express');
const db = require('../models');
const { logAudit } = require('../utils/audit');

const router = express.Router();

/**
 * POST /api/settings/delete-all-orders
 * Удаление всех заказов (только admin)
 */
router.post('/delete-all-orders', async (req, res, next) => {
  let t;
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Только администратор может удалять все заказы' });
    }

    t = await db.sequelize.transaction();

    const orders = await db.Order.findAll({ attributes: ['id'], transaction: t });
    const orderIds = orders.map((o) => o.id);

    for (const id of orderIds) {
      await db.OrderOperation.destroy({ where: { order_id: id }, transaction: t });
      await db.OrderFinanceLink.destroy({ where: { order_id: id }, transaction: t });
      await db.OrderFloorDistribution.destroy({ where: { order_id: id }, transaction: t });
    }
    await db.FinanceFact.update({ order_id: null }, { where: { order_id: orderIds }, transaction: t });
    await db.Order.destroy({ where: {}, transaction: t });

    await t.commit();
    await logAudit(req.user.id, 'DELETE_ALL', 'orders', orderIds.length);

    res.json({ ok: true, message: `Удалено заказов: ${orderIds.length}` });
  } catch (err) {
    if (t) await t.rollback().catch(() => {});
    next(err);
  }
});

module.exports = router;
