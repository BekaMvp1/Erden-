'use strict';

/**
 * Сидер: технолог и швеи для цеха пошива
 * Идемпотентный — можно запускать повторно
 */

const bcrypt = require('bcryptjs');

const TECHNOLOGISTS = [
  { name: 'Титов Сергей', email: 'technologist1@factory.local' },
  { name: 'Козлов Андрей', email: 'technologist2@factory.local' },
  { name: 'Смирнов Дмитрий', email: 'technologist3@factory.local' },
  { name: 'Новиков Павел', email: 'technologist4@factory.local' },
];

const SEWERS = [
  'Иванова Мария',
  'Петрова Анна',
  'Сидорова Елена',
  'Козлова Ольга',
  'Новикова Татьяна',
  'Морозова Наталья',
  'Волкова Ирина',
  'Соколова Светлана',
  'Лебедева Юлия',
  'Попова Екатерина',
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const passwordHash = await bcrypt.hash('password123', 10);

    const now = new Date();

    // Технологи — по 1 на цех/этаж
    const [floorsRows] = await sequelize.query('SELECT id FROM floors ORDER BY id');
    const [buildingFloorsRows] = await sequelize.query('SELECT id FROM building_floors ORDER BY id');
    if (!floorsRows || floorsRows.length < 1) return;

    const bfIds = buildingFloorsRows && buildingFloorsRows.length > 0
      ? buildingFloorsRows.map((bf) => bf.id)
      : floorsRows.map((_, i) => i + 1);

    for (let i = 0; i < Math.min(TECHNOLOGISTS.length, floorsRows.length); i++) {
      const tech = TECHNOLOGISTS[i];
      const [existingRows] = await sequelize.query(
        'SELECT id FROM users WHERE email = :email',
        { replacements: { email: tech.email } }
      );
      if (existingRows && existingRows.length > 0) continue;

      await queryInterface.bulkInsert('users', [
        {
          name: tech.name,
          email: tech.email,
          password_hash: passwordHash,
          role: 'technologist',
          floor_id: floorsRows[i].id,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      ]);

      const [newUserRows] = await sequelize.query(
        'SELECT id FROM users WHERE email = :email',
        { replacements: { email: tech.email } }
      );
      const newUser = newUserRows && newUserRows[0];

      if (newUser) {
        const buildingFloorId = bfIds[i] || null;
        await queryInterface.bulkInsert('technologists', [
          {
            user_id: newUser.id,
            floor_id: floorsRows[i].id,
            building_floor_id: buildingFloorId,
            created_at: now,
            updated_at: now,
          },
        ]);
      }
    }

    // Швеи (10 шт.) — распределены по технологам
    const [technologists] = await sequelize.query(
      'SELECT id, floor_id FROM technologists ORDER BY floor_id'
    );
    if (!technologists || technologists.length === 0) return;

    for (let i = 0; i < SEWERS.length; i++) {
      const sewerName = SEWERS[i];
      const email = `sewer${i + 1}@factory.local`;

      const [existingRows] = await sequelize.query(
        'SELECT id FROM users WHERE email = :email',
        { replacements: { email } }
      );
      if (existingRows && existingRows.length > 0) continue;

      const tech = technologists[i % technologists.length];

      await queryInterface.bulkInsert('users', [
        {
          name: sewerName,
          email,
          password_hash: passwordHash,
          role: 'operator',
          floor_id: tech.floor_id,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      ]);

      const [newUserRows] = await sequelize.query(
        'SELECT id FROM users WHERE email = :email',
        { replacements: { email } }
      );
      const newUser = newUserRows && newUserRows[0];

      if (newUser) {
        await queryInterface.bulkInsert('sewers', [
          {
            user_id: newUser.id,
            technologist_id: tech.id,
            capacity_per_day: 480,
            created_at: now,
            updated_at: now,
          },
        ]);
      }
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;

    const emails = [
      ...TECHNOLOGISTS.map((t) => t.email),
      ...SEWERS.map((_, i) => `sewer${i + 1}@factory.local`),
    ];

    for (const email of emails) {
      await sequelize.query('DELETE FROM users WHERE email = :email', {
        replacements: { email },
      });
    }
  },
};
