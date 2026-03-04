'use strict';

/**
 * Недельное планирование: ручной план + перенос остатка (carry)
 * row_key = order_id
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('weekly_plans', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      workshop_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'workshops', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      building_floor_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'building_floors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      week_start: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      row_key: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'order_id — идентификатор строки (заказ/модель)',
      },
      planned_manual: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
      planned_carry: {
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

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX weekly_plans_workshop_floor_week_row_unique
      ON weekly_plans (workshop_id, COALESCE(building_floor_id, 0), week_start, row_key);
    `);

    await queryInterface.createTable('weekly_capacity', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      workshop_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'workshops', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      building_floor_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'building_floors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      week_start: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      capacity_week: {
        type: Sequelize.DECIMAL(12, 2),
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

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX weekly_capacity_workshop_floor_week_unique
      ON weekly_capacity (workshop_id, COALESCE(building_floor_id, 0), week_start);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('weekly_plans');
    await queryInterface.dropTable('weekly_capacity');
  },
};
