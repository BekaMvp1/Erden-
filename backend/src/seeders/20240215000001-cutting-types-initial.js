'use strict';

/**
 * Сидер: начальные типы раскроя (Аксы, Аутсорс)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const [count] = await sequelize.query('SELECT COUNT(*) FROM cutting_types');
    if (parseInt(count[0].count, 10) > 0) return;

    const now = new Date();
    await queryInterface.bulkInsert('cutting_types', [
      { name: 'Аксы', is_active: true, created_at: now, updated_at: now },
      { name: 'Аутсорс', is_active: true, created_at: now, updated_at: now },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('cutting_types', null, {});
  },
};
