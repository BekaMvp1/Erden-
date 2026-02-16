'use strict';

/**
 * Миграция: план производства по дням
 * order_id, date, workshop_id, floor_id (nullable для цехов с 1 этажом)
 * UNIQUE(order_id, date, workshop_id, COALESCE(floor_id,0))
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('production_plan_day', {
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
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      workshop_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'workshops', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      floor_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'building_floors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      planned_qty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      actual_qty: {
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

    // Уникальность: для floor_id=NULL используем 0 в выражении
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX production_plan_day_order_date_workshop_floor_unique
      ON production_plan_day (order_id, date, workshop_id, COALESCE(floor_id, 0));
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('production_plan_day');
  },
};
