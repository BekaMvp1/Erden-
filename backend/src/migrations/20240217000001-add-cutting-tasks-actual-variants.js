'use strict';

/**
 * Миграция: actual_variants в cutting_tasks — фактические количества по цвету/размеру
 * Формат: [{ color, size, quantity_planned, quantity_actual }]
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      'cutting_tasks',
      'actual_variants',
      {
        type: Sequelize.JSONB,
        allowNull: true,
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('cutting_tasks', 'actual_variants');
  },
};
