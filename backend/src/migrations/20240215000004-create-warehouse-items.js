'use strict';

/**
 * Миграция: складские позиции (остатки)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('warehouse_items', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      unit: {
        type: Sequelize.ENUM('РУЛОН', 'КГ', 'ТОННА', 'ШТ'),
        allowNull: false,
      },
      stock_quantity: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('warehouse_items');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_warehouse_items_unit";');
  },
};
