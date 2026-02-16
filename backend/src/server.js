/**
 * Точка входа сервера
 */

const { execSync } = require('child_process');
const app = require('./app');
const config = require('./config');
const db = require('./models');

async function start() {
  try {
    await db.sequelize.authenticate();
    console.log('Подключение к БД успешно');
  } catch (err) {
    console.error('Ошибка подключения к БД:', err.message);
    process.exit(1);
  }

  // Автоматический запуск сидеров при первом запуске (если нет админа)
  if (process.env.AUTO_SEED !== 'false') {
    try {
      const [rows] = await db.sequelize.query(
        "SELECT COUNT(*) as count FROM users WHERE email = 'admin@factory.local'"
      );
      const count = rows?.[0]?.count ?? 0;
      if (parseInt(count, 10) === 0) {
        console.log('Запуск сидеров...');
        execSync('npx sequelize-cli db:seed:all', {
          stdio: 'inherit',
          cwd: __dirname + '/..',
        });
        console.log('Сидеры выполнены');
      }
    } catch (err) {
      console.warn('Сидеры:', err.message);
    }
  }

  app.listen(config.port, () => {
    console.log(`Сервер запущен на порту ${config.port}`);
  });
}

start();
