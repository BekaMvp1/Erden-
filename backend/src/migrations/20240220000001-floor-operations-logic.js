'use strict';

/**
 * Миграция: логика этажей и операций
 * - building_floors: обновить названия (1 этаж Финиш, 2-4 Производство)
 * - operations: default_floor_id, category (CUTTING|SEWING|FINISH), locked_to_floor
 * - order_operations: floor_id, status, planned_total, actual_total
 * - order_operation_variants: детализация цвет×размер по операциям
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Обновить названия этажей (building_floors)
    await queryInterface.sequelize.query(`
      UPDATE building_floors SET name = 'Финиш / ОТК' WHERE id = 1;
      UPDATE building_floors SET name = 'Производство 2' WHERE id = 2;
      UPDATE building_floors SET name = 'Производство 3' WHERE id = 3;
      UPDATE building_floors SET name = 'Производство 4' WHERE id = 4;
    `);

    // 2. Добавить колонки в operations
    await queryInterface.addColumn('operations', 'default_floor_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'building_floors', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('operations', 'category', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: 'SEWING',
    });
    await queryInterface.addColumn('operations', 'locked_to_floor', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // 3. Добавить колонки в order_operations
    await queryInterface.addColumn('order_operations', 'floor_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'building_floors', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('order_operations', 'responsible_user_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('order_operations', 'status', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: 'Ожидает',
    });
    await queryInterface.addColumn('order_operations', 'planned_total', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('order_operations', 'actual_total', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // 4. Создать order_operation_variants
    await queryInterface.createTable('order_operation_variants', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_operation_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'order_operations', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      color: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      size: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      planned_qty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      actual_qty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
    await queryInterface.addIndex('order_operation_variants', ['order_operation_id']);
    await queryInterface.addIndex('order_operation_variants', ['order_operation_id', 'color', 'size'], {
      unique: true,
      name: 'order_operation_variants_unique',
    });

    // 5. Заполнить category и default_floor для существующих операций
    // Раскрой -> CUTTING, этаж 2
    await queryInterface.sequelize.query(`
      UPDATE operations SET category = 'CUTTING', default_floor_id = 2, locked_to_floor = false
      WHERE LOWER(name) LIKE '%раскрой%';
    `);
    // Остальные по умолчанию SEWING, этаж 2
    await queryInterface.sequelize.query(`
      UPDATE operations SET category = 'SEWING', default_floor_id = 2, locked_to_floor = false
      WHERE category IS NULL OR category = '';
    `);

    // 6. Добавить финишные операции если их нет
    const [finishOps] = await queryInterface.sequelize.query(
      "SELECT id FROM operations WHERE LOWER(TRIM(name)) IN ('отк','петля','упаковка','пуговица','метка')"
    );
    if (!finishOps || finishOps.length === 0) {
      const now = new Date();
      await queryInterface.bulkInsert('operations', [
        { name: 'ОТК', norm_minutes: 2, default_floor_id: 1, category: 'FINISH', locked_to_floor: true, created_at: now, updated_at: now },
        { name: 'Петля', norm_minutes: 1.5, default_floor_id: 1, category: 'FINISH', locked_to_floor: true, created_at: now, updated_at: now },
        { name: 'Упаковка', norm_minutes: 1, default_floor_id: 1, category: 'FINISH', locked_to_floor: true, created_at: now, updated_at: now },
        { name: 'Пуговица', norm_minutes: 2, default_floor_id: 1, category: 'FINISH', locked_to_floor: true, created_at: now, updated_at: now },
        { name: 'Метка', norm_minutes: 0.5, default_floor_id: 1, category: 'FINISH', locked_to_floor: true, created_at: now, updated_at: now },
      ]);
    } else {
      await queryInterface.sequelize.query(`
        UPDATE operations SET category = 'FINISH', default_floor_id = 1, locked_to_floor = true
        WHERE LOWER(name) IN ('отк','петля','упаковка','пуговица','метка');
      `);
    }

    // 7. Инициализировать planned_total/actual_total в order_operations из planned_quantity/actual_quantity
    await queryInterface.sequelize.query(`
      UPDATE order_operations SET
        planned_total = COALESCE(planned_quantity, 0),
        actual_total = COALESCE(actual_quantity, 0),
        status = CASE WHEN actual_quantity >= planned_quantity AND planned_quantity > 0 THEN 'Готово' ELSE 'Ожидает' END,
        floor_id = (SELECT default_floor_id FROM operations WHERE id = order_operations.operation_id LIMIT 1)
      WHERE planned_total IS NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('order_operation_variants');
    await queryInterface.removeColumn('order_operations', 'floor_id');
    await queryInterface.removeColumn('order_operations', 'responsible_user_id');
    await queryInterface.removeColumn('order_operations', 'status');
    await queryInterface.removeColumn('order_operations', 'planned_total');
    await queryInterface.removeColumn('order_operations', 'actual_total');
    await queryInterface.removeColumn('operations', 'default_floor_id');
    await queryInterface.removeColumn('operations', 'category');
    await queryInterface.removeColumn('operations', 'locked_to_floor');
    await queryInterface.sequelize.query(`
      UPDATE building_floors SET name = 'Этаж 1' WHERE id = 1;
      UPDATE building_floors SET name = 'Этаж 2' WHERE id = 2;
      UPDATE building_floors SET name = 'Этаж 3' WHERE id = 3;
      UPDATE building_floors SET name = 'Этаж 4' WHERE id = 4;
    `);
  },
};
