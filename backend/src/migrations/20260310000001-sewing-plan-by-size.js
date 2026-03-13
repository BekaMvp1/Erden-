'use strict';

/**
 * Пошив по размерной матрице: план и факт по этажам и размерам.
 * - order_size_matrix: плановое количество по размерам по заказу
 * - sewing_plans: план и факт пошива по этажу, размеру, дате
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Размерная матрица заказа: плановое количество по каждому размеру модели
    await queryInterface.createTable('order_size_matrix', {
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
      model_size_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'model_sizes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      planned_qty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Плановое количество по размеру по заказу',
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
    await queryInterface.addIndex('order_size_matrix', ['order_id', 'model_size_id'], {
      unique: true,
      name: 'order_size_matrix_order_model_size_unique',
    });
    await queryInterface.addIndex('order_size_matrix', ['order_id']);

    // План и факт пошива по этажу, размеру, дате (учёт всегда по размерам)
    await queryInterface.createTable('sewing_plans', {
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
        comment: 'Этаж пошива',
      },
      model_size_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'model_sizes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      planned_qty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      fact_qty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        comment: 'Дата плана/факта',
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
    await queryInterface.addIndex('sewing_plans', ['order_id', 'floor_id', 'model_size_id', 'date'], {
      unique: true,
      name: 'sewing_plans_order_floor_model_size_date_unique',
    });
    await queryInterface.addIndex('sewing_plans', ['order_id']);
    await queryInterface.addIndex('sewing_plans', ['date']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sewing_plans');
    await queryInterface.dropTable('order_size_matrix');
  },
};
