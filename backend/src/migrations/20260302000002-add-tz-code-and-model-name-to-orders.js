'use strict';

/**
 * Миграция: добавить TZ/MODEL поля в заказы
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('orders');

    if (!table.tz_code) {
      await queryInterface.addColumn('orders', 'tz_code', {
        type: Sequelize.STRING(60),
        allowNull: false,
        defaultValue: '',
      });
    }

    if (!table.model_name) {
      await queryInterface.addColumn('orders', 'model_name', {
        type: Sequelize.STRING(160),
        allowNull: false,
        defaultValue: '',
      });
    }

    if (!table.article) {
      await queryInterface.addColumn('orders', 'article', {
        type: Sequelize.STRING(80),
        allowNull: true,
      });
    }

    await queryInterface.addIndex('orders', ['tz_code'], {
      name: 'orders_tz_code_idx',
    });
    await queryInterface.addIndex('orders', ['model_name'], {
      name: 'orders_model_name_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('orders', 'orders_tz_code_idx').catch(() => {});
    await queryInterface.removeIndex('orders', 'orders_model_name_idx').catch(() => {});

    await queryInterface.removeColumn('orders', 'article').catch(() => {});
    await queryInterface.removeColumn('orders', 'model_name').catch(() => {});
    await queryInterface.removeColumn('orders', 'tz_code').catch(() => {});
  },
};
