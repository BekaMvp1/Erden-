'use strict';

/**
 * Миграция: сроки этапов в order_operations
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('order_operations');

    if (!table.planned_start_date) {
      await queryInterface.addColumn('order_operations', 'planned_start_date', {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }
    if (!table.planned_end_date) {
      await queryInterface.addColumn('order_operations', 'planned_end_date', {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }
    if (!table.planned_days) {
      await queryInterface.addColumn('order_operations', 'planned_days', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!table.actual_start_date) {
      await queryInterface.addColumn('order_operations', 'actual_start_date', {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }
    if (!table.actual_end_date) {
      await queryInterface.addColumn('order_operations', 'actual_end_date', {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('order_operations');

    if (table.actual_end_date) {
      await queryInterface.removeColumn('order_operations', 'actual_end_date');
    }
    if (table.actual_start_date) {
      await queryInterface.removeColumn('order_operations', 'actual_start_date');
    }
    if (table.planned_days) {
      await queryInterface.removeColumn('order_operations', 'planned_days');
    }
    if (table.planned_end_date) {
      await queryInterface.removeColumn('order_operations', 'planned_end_date');
    }
    if (table.planned_start_date) {
      await queryInterface.removeColumn('order_operations', 'planned_start_date');
    }
  },
};
