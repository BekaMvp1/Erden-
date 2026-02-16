/**
 * Роуты для дашборда
 * GET /api/dashboard/summary — сводка по заказам
 */

const express = require('express');
const db = require('../models');

const router = express.Router();

/**
 * GET /api/dashboard/summary
 * Возвращает сводку: всего заказов, активные, выполненные, процент выполнения
 */
router.get('/summary', async (req, res, next) => {
  try {
    // Один запрос: агрегация по статусам
    const [rows] = await db.sequelize.query(`
      SELECT 
        (SELECT COUNT(*) FROM orders) as total,
        (SELECT COUNT(*) FROM orders o 
         JOIN order_status os ON os.id = o.status_id 
         WHERE os.name IN ('Принят', 'В работе')) as active,
        (SELECT COUNT(*) FROM orders o 
         JOIN order_status os ON os.id = o.status_id 
         WHERE os.name = 'Готов') as completed
    `);

    const r = rows[0];
    const totalOrders = parseInt(r?.total || 0, 10);
    const activeOrders = parseInt(r?.active || 0, 10);
    const completedOrders = parseInt(r?.completed || 0, 10);

    // Процент выполнения (выполненные / всего * 100)
    const completionPercent =
      totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;

    res.json({
      totalOrders,
      activeOrders,
      completedOrders,
      completionPercent,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
