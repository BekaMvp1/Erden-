'use strict';

/**
 * Сидер: начальные данные (этажи, клиенты, операции, админ)
 * Идемпотентный — можно запускать повторно
 */

const bcrypt = require('bcryptjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;

    // Цехи пошива (филиалы) — только если пусто
    const [floorsCount] = await sequelize.query('SELECT COUNT(*) FROM floors');
    if (parseInt(floorsCount[0].count, 10) === 0) {
      await queryInterface.bulkInsert('floors', [
        { name: 'Цех пошива', created_at: new Date(), updated_at: new Date() },
      ]);
    }

    // Админ — только если ещё нет
    const [existingAdmin] = await sequelize.query(
      "SELECT id FROM users WHERE email = 'admin@factory.local'"
    );
    if (existingAdmin.length === 0) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await queryInterface.bulkInsert('users', [
        {
          name: 'Администратор',
          email: 'admin@factory.local',
          password_hash: passwordHash,
          role: 'admin',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);
    }

    // Клиенты — только если пусто
    const [clientsCount] = await sequelize.query('SELECT COUNT(*) FROM clients');
    if (parseInt(clientsCount[0].count, 10) === 0) {
      await queryInterface.bulkInsert('clients', [
        { name: 'ООО "Ткани+"', created_at: new Date(), updated_at: new Date() },
        { name: 'ИП Иванов', created_at: new Date(), updated_at: new Date() },
        { name: 'Ателье "Стиль"', created_at: new Date(), updated_at: new Date() },
      ]);
    }

    // Операции — только если пусто
    const [opsCount] = await sequelize.query('SELECT COUNT(*) FROM operations');
    if (parseInt(opsCount[0].count, 10) === 0) {
      await queryInterface.bulkInsert('operations', [
        { name: 'Раскрой', norm_minutes: 5.5, created_at: new Date(), updated_at: new Date() },
        { name: 'Стачивание', norm_minutes: 3.2, created_at: new Date(), updated_at: new Date() },
        { name: 'Подрезка', norm_minutes: 2.1, created_at: new Date(), updated_at: new Date() },
        { name: 'Обработка швов', norm_minutes: 4.0, created_at: new Date(), updated_at: new Date() },
        { name: 'Утюжка', norm_minutes: 1.8, created_at: new Date(), updated_at: new Date() },
      ]);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('operations', null, {});
    await queryInterface.bulkDelete('clients', null, {});
    await queryInterface.bulkDelete('users', { email: 'admin@factory.local' }, {});
    await queryInterface.bulkDelete('floors', null, {});
  },
};
