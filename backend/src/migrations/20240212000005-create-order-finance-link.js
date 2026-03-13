'use strict';

/**
 * Миграция: связь заказа с плановыми финансовыми показателями (опционально)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('order_finance_link', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'orders',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      type: {
        type: Sequelize.STRING(10),
        allowNull: false,
      },
      planned_revenue: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
      },
      planned_cost: {
        type: Sequelize.DECIMAL(15, 2),
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
    await queryInterface.addIndex('order_finance_link', ['order_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('order_finance_link');
  },
};
