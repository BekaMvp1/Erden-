'use strict';

/**
 * Миграция: добавить поле этажа (floor) в cutting_tasks
 * 1 этаж = ФИНИШ, 2–4 этаж = ПОШИВ
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Добавляем колонку как nullable для существующих записей
    await queryInterface.addColumn('cutting_tasks', 'floor', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // Заполняем существующие записи этажом 1
    await queryInterface.sequelize.query(
      `UPDATE cutting_tasks SET floor = 1 WHERE floor IS NULL`
    );

    // Делаем колонку NOT NULL и добавляем CHECK
    await queryInterface.changeColumn('cutting_tasks', 'floor', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });

    await queryInterface.sequelize.query(
      `ALTER TABLE cutting_tasks ADD CONSTRAINT cutting_tasks_floor_check CHECK (floor IN (1, 2, 3, 4))`
    );

    await queryInterface.addIndex('cutting_tasks', ['floor'], {
      name: 'cutting_tasks_floor_idx',
    });

    // Даты начала/окончания (опционально, для отображения и проверки пересечений)
    await queryInterface.addColumn('cutting_tasks', 'start_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
    await queryInterface.addColumn('cutting_tasks', 'end_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('cutting_tasks', 'start_date');
    await queryInterface.removeColumn('cutting_tasks', 'end_date');
    await queryInterface.sequelize.query(
      `ALTER TABLE cutting_tasks DROP CONSTRAINT IF EXISTS cutting_tasks_floor_check`
    );
    await queryInterface.removeIndex('cutting_tasks', 'cutting_tasks_floor_idx');
    await queryInterface.removeColumn('cutting_tasks', 'floor');
  },
};
