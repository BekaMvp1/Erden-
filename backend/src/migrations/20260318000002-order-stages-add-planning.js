'use strict';

/**
 * Добавляет этап planning в order_stages для заказов, у которых его ещё нет
 * (в исходной миграции order_stages были только 6 этапов без planning).
 */

module.exports = {
  async up(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT DISTINCT order_id FROM order_stages WHERE stage_key = 'planning'`
    );
    const hasPlanning = new Set((existing || []).map((r) => r.order_id));

    const [orders] = await queryInterface.sequelize.query('SELECT id FROM orders ORDER BY id');
    for (const row of orders || []) {
      if (hasPlanning.has(row.id)) continue;
      await queryInterface.sequelize.query(
        `INSERT INTO order_stages (order_id, stage_key, status, started_at, completed_at, created_at, updated_at)
         VALUES (:order_id, 'planning', 'NOT_STARTED', NULL, NULL, NOW(), NOW())
         ON CONFLICT (order_id, stage_key) DO NOTHING`,
        {
          replacements: { order_id: row.id },
        }
      );
    }
  },

  async down() {
    // Не удаляем строки planning: откат необязателен, данные не мешают
  },
};
