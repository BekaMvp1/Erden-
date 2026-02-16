'use strict';

/**
 * Миграция: добавление planned_month и color в orders
 * floor_id уже есть в orders
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('orders', 'planned_month', {
      type: Sequelize.STRING(7),
      allowNull: true,
    });
    await queryInterface.addColumn('orders', 'color', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('orders', 'comment', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addIndex('orders', ['planned_month']);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('orders', 'planned_month');
    await queryInterface.removeColumn('orders', 'color');
    await queryInterface.removeColumn('orders', 'comment');
  },
};
