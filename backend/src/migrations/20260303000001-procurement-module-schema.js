'use strict';

/**
 * Миграция: новая схема модуля закупа (draft/sent/received, material_name, planned_qty, purchased_*)
 * Не ломает существующие данные — миграция с маппингом
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();

    try {
      // 1. procurement_requests: добавить completed_at
      const prTable = await queryInterface.describeTable('procurement_requests');
      if (!prTable.completed_at) {
        await queryInterface.addColumn(
          'procurement_requests',
          'completed_at',
          { type: Sequelize.DATE, allowNull: true },
          { transaction: t }
        );
      }

      // 2. procurement_requests: перевести status на VARCHAR с новыми значениями
      await queryInterface.sequelize.query(
        `ALTER TABLE procurement_requests ADD COLUMN IF NOT EXISTS status_new VARCHAR(20);`,
        { transaction: t }
      );
      await queryInterface.sequelize.query(
        `UPDATE procurement_requests SET status_new = CASE
          WHEN status::text = 'Ожидает закуп' THEN 'draft'
          WHEN status::text = 'Частично' THEN 'sent'
          WHEN status::text = 'Закуплено' THEN 'received'
          WHEN status::text = 'Отменено' THEN 'draft'
          ELSE 'draft'
        END;`,
        { transaction: t }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE procurement_requests DROP COLUMN IF EXISTS status;`,
        { transaction: t }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE procurement_requests RENAME COLUMN status_new TO status;`,
        { transaction: t }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE procurement_requests ALTER COLUMN status SET DEFAULT 'draft';`,
        { transaction: t }
      );
      await queryInterface.sequelize.query(
        `DROP TYPE IF EXISTS enum_procurement_requests_status CASCADE;`,
        { transaction: t }
      );

      // 3. procurement_items: новые колонки
      const piTable = await queryInterface.describeTable('procurement_items');
      if (!piTable.material_name) {
        await queryInterface.addColumn(
          'procurement_items',
          'material_name',
          { type: Sequelize.STRING(200), allowNull: true },
          { transaction: t }
        );
        await queryInterface.sequelize.query(
          `UPDATE procurement_items SET material_name = COALESCE(name, '');`,
          { transaction: t }
        );
        await queryInterface.sequelize.query(
          `ALTER TABLE procurement_items ALTER COLUMN material_name SET NOT NULL;`,
          { transaction: t }
        );
      }
      if (!piTable.planned_qty) {
        await queryInterface.addColumn(
          'procurement_items',
          'planned_qty',
          { type: Sequelize.DECIMAL(12, 3), allowNull: true },
          { transaction: t }
        );
        await queryInterface.sequelize.query(
          `UPDATE procurement_items SET planned_qty = COALESCE(quantity, 0);`,
          { transaction: t }
        );
        await queryInterface.sequelize.query(
          `ALTER TABLE procurement_items ALTER COLUMN planned_qty SET NOT NULL;`,
          { transaction: t }
        );
      }
      if (!piTable.purchased_qty) {
        await queryInterface.addColumn(
          'procurement_items',
          'purchased_qty',
          { type: Sequelize.DECIMAL(12, 3), allowNull: true },
          { transaction: t }
        );
        await queryInterface.sequelize.query(
          `UPDATE procurement_items SET purchased_qty = COALESCE(quantity, 0);`,
          { transaction: t }
        );
        await queryInterface.sequelize.query(
          `ALTER TABLE procurement_items ALTER COLUMN purchased_qty SET NOT NULL, ALTER COLUMN purchased_qty SET DEFAULT 0;`,
          { transaction: t }
        );
      }
      if (!piTable.purchased_price) {
        await queryInterface.addColumn(
          'procurement_items',
          'purchased_price',
          { type: Sequelize.DECIMAL(12, 2), allowNull: true },
          { transaction: t }
        );
        await queryInterface.sequelize.query(
          `UPDATE procurement_items SET purchased_price = COALESCE(price, 0);`,
          { transaction: t }
        );
        await queryInterface.sequelize.query(
          `ALTER TABLE procurement_items ALTER COLUMN purchased_price SET NOT NULL, ALTER COLUMN purchased_price SET DEFAULT 0;`,
          { transaction: t }
        );
      }
      if (!piTable.purchased_sum) {
        await queryInterface.addColumn(
          'procurement_items',
          'purchased_sum',
          { type: Sequelize.DECIMAL(12, 2), allowNull: true },
          { transaction: t }
        );
        await queryInterface.sequelize.query(
          `UPDATE procurement_items SET purchased_sum = COALESCE(total, 0);`,
          { transaction: t }
        );
        await queryInterface.sequelize.query(
          `ALTER TABLE procurement_items ALTER COLUMN purchased_sum SET NOT NULL, ALTER COLUMN purchased_sum SET DEFAULT 0;`,
          { transaction: t }
        );
      }

      // Удалить старые колонки procurement_items если они есть
      if (piTable.name) {
        await queryInterface.removeColumn('procurement_items', 'name', { transaction: t }).catch(() => {});
      }
      if (piTable.quantity) {
        await queryInterface.removeColumn('procurement_items', 'quantity', { transaction: t }).catch(() => {});
      }
      if (piTable.price) {
        await queryInterface.removeColumn('procurement_items', 'price', { transaction: t }).catch(() => {});
      }
      if (piTable.total) {
        await queryInterface.removeColumn('procurement_items', 'total', { transaction: t }).catch(() => {});
      }
      if (piTable.supplier) {
        await queryInterface.removeColumn('procurement_items', 'supplier', { transaction: t }).catch(() => {});
      }
      if (piTable.comment) {
        await queryInterface.removeColumn('procurement_items', 'comment', { transaction: t }).catch(() => {});
      }

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    // Откат упрощённый — воссоздание старых колонок
    await queryInterface.sequelize.query(`
      ALTER TABLE procurement_requests ADD COLUMN IF NOT EXISTS status_old VARCHAR(50);
      UPDATE procurement_requests SET status_old = CASE
        WHEN status = 'draft' THEN 'Ожидает закуп'
        WHEN status = 'sent' THEN 'Частично'
        WHEN status = 'received' THEN 'Закуплено'
        ELSE 'Ожидает закуп'
      END;
      ALTER TABLE procurement_requests DROP COLUMN IF EXISTS status;
      ALTER TABLE procurement_requests RENAME COLUMN status_old TO status;
    `).catch(() => {});
    await queryInterface.removeColumn('procurement_requests', 'completed_at').catch(() => {});
  },
};
