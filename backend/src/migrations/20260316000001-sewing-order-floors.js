'use strict';

/**
 * Единый статус пошива по заказу+этаж (2/3/4).
 * Один источник правды: sewing_order_floors.status (IN_PROGRESS | DONE).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sewing_order_floors', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      floor_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'building_floors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      status: {
        type: Sequelize.ENUM('IN_PROGRESS', 'DONE'),
        allowNull: false,
        defaultValue: 'IN_PROGRESS',
      },
      done_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      done_batch_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'sewing_batches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
    await queryInterface.addIndex('sewing_order_floors', ['order_id', 'floor_id'], {
      unique: true,
      name: 'sewing_order_floors_order_floor_unique',
    });
    await queryInterface.addIndex('sewing_order_floors', ['status']);

    // Заполнить из существующих партий DONE
    const [doneBatches] = await queryInterface.sequelize.query(`
      SELECT id, order_id, floor_id, finished_at
      FROM sewing_batches
      WHERE status = 'DONE' AND floor_id IS NOT NULL AND floor_id IN (2, 3, 4)
    `);
    for (const r of doneBatches || []) {
      await queryInterface.sequelize.query(
        `INSERT INTO sewing_order_floors (order_id, floor_id, status, done_at, done_batch_id, created_at, updated_at)
         VALUES (:order_id, :floor_id, 'DONE', :done_at, :batch_id, NOW(), NOW())
         ON CONFLICT (order_id, floor_id) DO UPDATE SET status = 'DONE', done_at = :done_at, done_batch_id = :batch_id, updated_at = NOW()`,
        {
          replacements: {
            order_id: r.order_id,
            floor_id: r.floor_id,
            done_at: r.finished_at || new Date(),
            batch_id: r.id,
          },
        }
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sewing_order_floors');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_sewing_order_floors_status";');
  },
};
