'use strict';

/**
 * Миграция: заказы
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('orders', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'clients',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      deadline: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      status_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'order_status',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      floor_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'floors',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      technologist_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'technologists',
          key: 'id',
        },
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

    await queryInterface.addIndex('orders', ['client_id']);
    await queryInterface.addIndex('orders', ['status_id']);
    await queryInterface.addIndex('orders', ['floor_id']);
    await queryInterface.addIndex('orders', ['technologist_id']);
    await queryInterface.addIndex('orders', ['deadline']);
    await queryInterface.addIndex('orders', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('orders');
  },
};
