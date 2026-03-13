'use strict';

/**
 * Миграция: workshop_id в заказах
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('orders', 'workshop_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'workshops', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('orders', 'workshop_id');
  },
};
