'use strict';

/**
 * Миграция: операции заказа (распределение по швеям)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('order_operations', {
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
      operation_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'operations',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      sewer_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'sewers',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      planned_quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      actual_quantity: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      planned_date: {
        type: Sequelize.DATEONLY,
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

    await queryInterface.addIndex('order_operations', ['order_id']);
    await queryInterface.addIndex('order_operations', ['operation_id']);
    await queryInterface.addIndex('order_operations', ['sewer_id']);
    await queryInterface.addIndex('order_operations', ['planned_date']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('order_operations');
  },
};
