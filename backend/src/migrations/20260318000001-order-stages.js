'use strict';

/**
 * Единый источник истины по этапам заказа: Закуп → Раскрой → Пошив → ОТК → Склад → Отгрузка.
 * Статусы: NOT_STARTED, IN_PROGRESS, DONE.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('order_stages', {
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
      stage_key: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'NOT_STARTED',
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      meta: {
        type: Sequelize.JSONB,
        allowNull: true,
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
    await queryInterface.addIndex('order_stages', ['order_id', 'stage_key'], {
      unique: true,
      name: 'order_stages_order_stage_unique',
    });
    await queryInterface.addIndex('order_stages', ['order_id']);
    await queryInterface.addIndex('order_stages', ['stage_key']);
    await queryInterface.addIndex('order_stages', ['status']);

    // Обратное заполнение для существующих заказов: у всех procurement = IN_PROGRESS, остальные NOT_STARTED
    const [orders] = await queryInterface.sequelize.query('SELECT id FROM orders ORDER BY id');
    const now = new Date().toISOString();
    const PIPELINE_STAGES = ['procurement', 'cutting', 'sewing', 'qc', 'warehouse', 'shipping'];
    for (const row of orders || []) {
      for (const stageKey of PIPELINE_STAGES) {
        await queryInterface.sequelize.query(
          `INSERT INTO order_stages (order_id, stage_key, status, started_at, completed_at, created_at, updated_at)
           VALUES (:order_id, :stage_key, :status, :started_at, NULL, NOW(), NOW())`,
          {
            replacements: {
              order_id: row.id,
              stage_key: stageKey,
              status: stageKey === 'procurement' ? 'IN_PROGRESS' : 'NOT_STARTED',
              started_at: stageKey === 'procurement' ? now : null,
            },
          }
        );
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('order_stages');
  },
};
