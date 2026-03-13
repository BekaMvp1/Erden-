'use strict';

/**
 * Таблица sewing_fact: фактическое количество пошива по заказу, этажу и дате.
 * Используется при сохранении факта на странице «Пошив» и при завершении пошива → ОТК.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sewing_fact', {
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
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      fact_qty: {
        type: Sequelize.INTEGER,
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
    await queryInterface.addIndex('sewing_fact', ['order_id', 'floor_id', 'date'], {
      unique: true,
      name: 'sewing_fact_order_floor_date_unique',
    });
    await queryInterface.addIndex('sewing_fact', ['order_id']);
    await queryInterface.addIndex('sewing_fact', ['floor_id']);
    await queryInterface.addIndex('sewing_fact', ['date']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sewing_fact');
  },
};
