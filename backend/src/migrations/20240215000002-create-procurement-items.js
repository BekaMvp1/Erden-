'use strict';

/**
 * Миграция: позиции закупа (ткань, фурнитура и т.д.)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('procurement_items', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      procurement_request_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'procurement_requests',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      unit: {
        type: Sequelize.ENUM('РУЛОН', 'КГ', 'ТОННА'),
        allowNull: false,
      },
      quantity: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: false,
      },
      price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      total: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      supplier: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      comment: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('procurement_items', ['procurement_request_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('procurement_items');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_procurement_items_unit";');
  },
};
