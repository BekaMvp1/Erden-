'use strict';

/**
 * Сидер: начальные цвета (только если таблица пуста)
 * Остальные цвета добавляются вручную
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const [count] = await sequelize.query('SELECT COUNT(*) FROM colors');
    if (parseInt(count[0].count, 10) > 0) return;

    const now = new Date();
    await queryInterface.bulkInsert('colors', [
      { name: 'Черный', created_at: now, updated_at: now },
      { name: 'Белый', created_at: now, updated_at: now },
      { name: 'Серый', created_at: now, updated_at: now },
      { name: 'Синий', created_at: now, updated_at: now },
      { name: 'Красный', created_at: now, updated_at: now },
      { name: 'Зеленый', created_at: now, updated_at: now },
      { name: 'Бежевый', created_at: now, updated_at: now },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('colors', null, {});
  },
};
