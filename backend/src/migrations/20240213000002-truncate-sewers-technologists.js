'use strict';

/**
 * Миграция: обнуление швей и технологов
 * Удаляет все записи из production_calendar, обнуляет sewer_id в order_operations,
 * удаляет швей и технологов. Пользователи (users) не удаляются.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('DELETE FROM production_calendar');
    await queryInterface.sequelize.query('UPDATE order_operations SET sewer_id = NULL');
    await queryInterface.sequelize.query('UPDATE orders SET technologist_id = NULL');
    await queryInterface.sequelize.query('UPDATE order_floor_distributions SET technologist_id = NULL');
    await queryInterface.sequelize.query('DELETE FROM sewers');
    await queryInterface.sequelize.query('DELETE FROM technologists');
  },

  async down(queryInterface) {
    // Нельзя восстановить удалённые данные
  },
};
