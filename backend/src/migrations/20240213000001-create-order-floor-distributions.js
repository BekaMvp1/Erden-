'use strict';

/**
 * Миграция: распределение заказов по этажам (цехам пошива)
 * Отдельная таблица для журнала распределений
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('order_floor_distributions', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onDelete: 'CASCADE',
      },
      floor_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'floors', key: 'id' },
      },
      technologist_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'technologists', key: 'id' },
      },
      distributed_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
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
    await queryInterface.addIndex('order_floor_distributions', ['order_id']);
    await queryInterface.addIndex('order_floor_distributions', ['floor_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('order_floor_distributions');
  },
};
