/**
 * Экспорт данных из локальной БД в облачную (для Netlify/Render)
 *
 * Использование:
 *   1. Локальная БД — из .env (DATABASE_URL)
 *   2. Облачная БД — задать CLOUD_DATABASE_URL
 *
 *   CLOUD_DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" node scripts/export-to-cloud.js
 *
 * Или создать .env.cloud с CLOUD_DATABASE_URL и запустить:
 *   node -r dotenv/config scripts/export-to-cloud.js dotenv_config_path=.env.cloud
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');

const LOCAL_URL = process.env.DATABASE_URL;
const CLOUD_URL = process.env.CLOUD_DATABASE_URL;

if (!LOCAL_URL) {
  console.error('Ошибка: DATABASE_URL не задан в .env');
  process.exit(1);
}
if (!CLOUD_URL) {
  console.error('Ошибка: CLOUD_DATABASE_URL не задан.');
  console.error('Пример: CLOUD_DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" node scripts/export-to-cloud.js');
  process.exit(1);
}

const localDb = new Sequelize(LOCAL_URL, { dialect: 'postgres', logging: false });
const isCloud = !CLOUD_URL.includes('127.0.0.1') && !CLOUD_URL.includes('localhost');
const cloudDb = new Sequelize(CLOUD_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: isCloud ? { ssl: { rejectUnauthorized: false } } : {},
});

// Порядок таблиц (с учётом foreign keys): справочники → orders → order_*
const TABLES = [
  'clients',
  'colors',
  'sizes',
  'order_status',
  'floors',
  'building_floors',
  'workshops',
  'operations',
  'cutting_types',
  'users',
  'technologists',
  'sewers',
  'orders',
  'order_variants',
  'order_operations',
  'order_operation_variants',
  'order_floor_distributions',
];

async function copyTable(tableName) {
  try {
    const [rows] = await localDb.query(`SELECT * FROM ${tableName}`);
    if (!rows || rows.length === 0) {
      console.log(`  ${tableName}: пусто, пропуск`);
      return 0;
    }
    const columns = Object.keys(rows[0]);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const colNames = columns.map((c) => `"${c}"`).join(', ');
    const hasId = columns.includes('id');
    const insertSql = hasId
      ? `INSERT INTO ${tableName} (${colNames}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`
      : `INSERT INTO ${tableName} (${colNames}) VALUES (${placeholders})`;
    let inserted = 0;
    for (const row of rows) {
      const values = columns.map((c) => row[c]);
      try {
        await cloudDb.query(insertSql, { bind: values });
        inserted++;
      } catch (e) {
        const msg = (e.message || '').toLowerCase();
        if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('already exists')) continue;
        console.warn(`  ${tableName}: пропуск строки —`, e.message);
      }
    }
    console.log(`  ${tableName}: ${inserted}/${rows.length}`);
    if (tableName === 'orders') {
      console.log('Orders transferred:', inserted);
    }
    return inserted;
  } catch (err) {
    console.error(`  ${tableName}: ошибка`, err.message);
    return 0;
  }
}

async function main() {
  console.log('Передача данных: локальная БД → облачная');
  console.log('');

  try {
    await localDb.authenticate();
    console.log('Локальная БД: подключено');
  } catch (e) {
    console.error('Локальная БД: ошибка', e.message);
    process.exit(1);
  }

  try {
    await cloudDb.authenticate();
    console.log('Облачная БД: подключено');
  } catch (e) {
    console.error('Облачная БД: ошибка', e.message);
    process.exit(1);
  }

  console.log('');
  let total = 0;
  for (const table of TABLES) {
    total += await copyTable(table);
  }

  console.log('');
  console.log('Готово. Задеплойте backend на Render и перезапустите Netlify.');
  await localDb.close();
  await cloudDb.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
