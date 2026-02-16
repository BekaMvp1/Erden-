'use strict';

/**
 * Миграция: заполнить order_operation_variants для существующих операций
 * Копирует матрицу цвет×размер из order_variants для операций без детализации
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const [rows] = await queryInterface.sequelize.query(`
      SELECT oo.id as order_operation_id, ov.color, s.name as size, ov.quantity
      FROM order_operations oo
      JOIN orders o ON o.id = oo.order_id
      JOIN order_variants ov ON ov.order_id = o.id
      JOIN sizes s ON s.id = ov.size_id
      WHERE NOT EXISTS (
        SELECT 1 FROM order_operation_variants oov
        WHERE oov.order_operation_id = oo.id
      )
      ORDER BY oo.id, ov.color, s.name
    `);

    if (!rows || rows.length === 0) return;

    const now = new Date();
    const toInsert = rows.map((r) => ({
      order_operation_id: r.order_operation_id,
      color: r.color,
      size: r.size,
      planned_qty: r.quantity || 0,
      actual_qty: 0,
      created_at: now,
      updated_at: now,
    }));

    // Группируем по order_operation_id чтобы избежать дублей (color, size)
    const seen = new Set();
    const unique = [];
    for (const row of toInsert) {
      const key = `${row.order_operation_id}|${row.color}|${row.size}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(row);
      }
    }

    if (unique.length > 0) {
      await queryInterface.bulkInsert('order_operation_variants', unique);
    }
  },

  async down(queryInterface) {
    // Не удаляем — откат не требуется
  },
};
