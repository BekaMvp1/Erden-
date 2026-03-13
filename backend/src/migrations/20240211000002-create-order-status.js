'use strict';

/**
 * Миграция: справочник статусов заказов
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('order_status', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: Sequelize.STRING(50),
        allowNull: false,
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

    // Вставляем начальные статусы
    await queryInterface.bulkInsert('order_status', [
      { name: 'Принят', created_at: new Date(), updated_at: new Date() },
      { name: 'В работе', created_at: new Date(), updated_at: new Date() },
      { name: 'Готов', created_at: new Date(), updated_at: new Date() },
      { name: 'Просрочен', created_at: new Date(), updated_at: new Date() },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('order_status');
  },
};
