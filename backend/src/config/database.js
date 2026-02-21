/**
 * Конфигурация подключения к PostgreSQL
 */

require('dotenv').config();

const dbUrl = process.env.DATABASE_URL || '';
const isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');

module.exports = {
  development: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    logging: false,
  },
  test: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    logging: false,
  },
  production: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  },
};
