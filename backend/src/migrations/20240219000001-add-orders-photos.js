'use strict';

/**
 * Миграция: photos (JSONB) — массив base64 фото заказа
 * Формат: ["data:image/jpeg;base64,...", ...]
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('orders', 'photos', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: [],
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('orders', 'photos');
  },
};
