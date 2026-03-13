/**
 * Подключение к облачной БД (Supabase) для синхронизации
 */

require('dotenv').config();

const { Sequelize } = require('sequelize');

let CLOUD_URL = process.env.CLOUD_DATABASE_URL || '';
if (CLOUD_URL && CLOUD_URL.includes('sslmode=')) {
  CLOUD_URL = CLOUD_URL.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?&/, '?').replace(/\?$/, '');
}

let cloudSequelize = null;

if (CLOUD_URL) {
  cloudSequelize = new Sequelize(CLOUD_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false },
    },
    define: {
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  });
}

module.exports = { cloudSequelize };
