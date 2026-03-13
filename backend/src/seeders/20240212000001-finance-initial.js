'use strict';

/**
 * Сидер: категории БДР/БДДС и пустой план на 2026 год
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;

    // Проверка: если категории уже есть — выходим
    const [catCount] = await sequelize.query('SELECT COUNT(*) FROM finance_categories');
    if (parseInt(catCount[0].count, 10) > 0) {
      return;
    }

    const now = new Date();

    // Категории БДР (бюджет доходов и расходов)
    const bdrCategories = [
      { type: 'BDR', name: 'Выручка', sort_order: 1 },
      { type: 'BDR', name: 'Материалы', sort_order: 2 },
      { type: 'BDR', name: 'Зарплата', sort_order: 3 },
      { type: 'BDR', name: 'Аренда', sort_order: 4 },
      { type: 'BDR', name: 'Налоги', sort_order: 5 },
      { type: 'BDR', name: 'Прочее', sort_order: 6 },
    ];

    // Категории БДДС (бюджет движения денежных средств)
    const bddsCategories = [
      { type: 'BDDS', name: 'Поступления от клиентов', sort_order: 1 },
      { type: 'BDDS', name: 'Оплата материалов', sort_order: 2 },
      { type: 'BDDS', name: 'Выплата зарплаты', sort_order: 3 },
      { type: 'BDDS', name: 'Арендные платежи', sort_order: 4 },
      { type: 'BDDS', name: 'Налоговые платежи', sort_order: 5 },
      { type: 'BDDS', name: 'Прочие платежи', sort_order: 6 },
    ];

    const allCategories = [...bdrCategories, ...bddsCategories].map((c) => ({
      ...c,
      created_at: now,
      updated_at: now,
    }));

    await queryInterface.bulkInsert('finance_categories', allCategories);

    // Получаем ID вставленных категорий
    const [ inserted ] = await sequelize.query(
      'SELECT id, type FROM finance_categories ORDER BY type, sort_order'
    );

    const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
      '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];

    const planRows = [];
    for (const cat of inserted) {
      for (const month of months) {
        planRows.push({
          type: cat.type,
          category_id: cat.id,
          month,
          planned_amount: 0,
          created_at: now,
          updated_at: now,
        });
      }
    }

    await queryInterface.bulkInsert('finance_plan_2026', planRows);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('finance_plan_2026', null, {});
    await queryInterface.bulkDelete('finance_categories', null, {});
  },
};
