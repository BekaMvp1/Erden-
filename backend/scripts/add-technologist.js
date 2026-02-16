/**
 * Скрипт: добавить технолога вручную
 * Запуск: node scripts/add-technologist.js
 *
 * Настройте переменные ниже (name, email, password, floor_id) и выполните.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { Sequelize } = require('sequelize');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL не задан в backend/.env');
  process.exit(1);
}

const sequelize = new Sequelize(dbUrl, { dialect: 'postgres', logging: false });

// ========== НАСТРОЙТЕ ЗДЕСЬ ==========
const TECHNOLOGIST = {
  name: 'Новый Технолог',
  email: 'technologist_new@factory.local',
  password: 'password123',
  floor_id: 1, // 1=Этаж 1, 2=Этаж 2, 3=Этаж 3, 4=Этаж 4
};
// =====================================

async function main() {
  try {
    const [floors] = await sequelize.query('SELECT id, name FROM floors ORDER BY id');
    if (!floors.length) {
      console.error('Нет этажей в БД. Запустите миграции и сидеры.');
      process.exit(1);
    }

    const floorExists = floors.some((f) => f.id === TECHNOLOGIST.floor_id);
    if (!floorExists) {
      console.error(`Этаж с id=${TECHNOLOGIST.floor_id} не найден. Доступные:`, floors);
      process.exit(1);
    }

    const [existing] = await sequelize.query('SELECT id FROM users WHERE email = :email', {
      replacements: { email: TECHNOLOGIST.email },
    });
    if (existing.length) {
      console.error('Пользователь с таким email уже существует.');
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(TECHNOLOGIST.password, 10);
    const now = new Date();

    const [userResult] = await sequelize.query(
      `INSERT INTO users (name, email, password_hash, role, floor_id, is_active, created_at, updated_at)
       VALUES (:name, :email, :password_hash, 'technologist', :floor_id, true, :now, :now)
       RETURNING id`,
      {
        replacements: {
          name: TECHNOLOGIST.name,
          email: TECHNOLOGIST.email,
          password_hash: passwordHash,
          floor_id: TECHNOLOGIST.floor_id,
          now,
        },
      }
    );

    const userId = userResult[0].id;

    await sequelize.query(
      `INSERT INTO technologists (user_id, floor_id, created_at, updated_at)
       VALUES (:user_id, :floor_id, :now, :now)`,
      {
        replacements: {
          user_id: userId,
          floor_id: TECHNOLOGIST.floor_id,
          now,
        },
      }
    );

    console.log('Технолог добавлен:');
    console.log('  ID:', userId);
    console.log('  Name:', TECHNOLOGIST.name);
    console.log('  Email:', TECHNOLOGIST.email);
    console.log('  Пароль:', TECHNOLOGIST.password);
    console.log('  Этаж:', floors.find((f) => f.id === TECHNOLOGIST.floor_id)?.name);
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
