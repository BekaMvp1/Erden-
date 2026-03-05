'use strict';

/**
 * Добавить статусы READY_FOR_QC и QC_DONE в sewing_batches.status.
 * Цепочка: Завершить пошив → status = READY_FOR_QC → ОТК → status = QC_DONE.
 */

module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(`
      SELECT t.typname
      FROM pg_attribute a
      JOIN pg_type t ON t.oid = a.atttypid
      WHERE a.attrelid = 'sewing_batches'::regclass AND a.attname = 'status' AND a.attnum > 0 AND NOT a.attisdropped
    `);
    const enumTypeName = rows?.[0]?.typname || 'enum_sewing_batches_status';
    try {
      await queryInterface.sequelize.query(`ALTER TYPE "${enumTypeName}" ADD VALUE 'READY_FOR_QC'`);
    } catch (e) {
      if (!/already exists/.test(e.message)) throw e;
    }
    try {
      await queryInterface.sequelize.query(`ALTER TYPE "${enumTypeName}" ADD VALUE 'QC_DONE'`);
    } catch (e) {
      if (!/already exists/.test(e.message)) throw e;
    }

    // Партии DONE без проведённого ОТК считаем «готовы к ОТК»
    await queryInterface.sequelize.query(`
      UPDATE sewing_batches sb SET status = 'READY_FOR_QC'
      WHERE sb.status = 'DONE' AND NOT EXISTS (SELECT 1 FROM qc_batches qb WHERE qb.batch_id = sb.id)
    `);

    // Этап «Планирование» для существующих заказов (если ещё нет)
    const [orderRows] = await queryInterface.sequelize.query(
      `SELECT o.id FROM orders o WHERE NOT EXISTS (
        SELECT 1 FROM order_stages s WHERE s.order_id = o.id AND s.stage_key = 'planning'
      )`
    );
    for (const row of orderRows || []) {
      await queryInterface.sequelize.query(
        `INSERT INTO order_stages (order_id, stage_key, status, started_at, completed_at, created_at, updated_at)
         VALUES (:id, 'planning', 'NOT_STARTED', NULL, NULL, NOW(), NOW())
         ON CONFLICT (order_id, stage_key) DO NOTHING`,
        { replacements: { id: row.id } }
      );
    }
  },

  async down() {
    // В PostgreSQL нельзя удалить значение enum без пересоздания типа — не откатываем
  },
};
