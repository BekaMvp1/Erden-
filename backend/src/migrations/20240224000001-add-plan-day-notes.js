'use strict';

/**
 * Миграция: примечания к плану по дню (когда факт не совпадает с планом)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      'production_plan_day',
      'notes',
      {
        type: Sequelize.TEXT,
        allowNull: true,
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('production_plan_day', 'notes');
  },
};
