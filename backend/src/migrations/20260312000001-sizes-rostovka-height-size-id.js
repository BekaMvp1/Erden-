'use strict';

/**
 * Правильная ростовка: справочник размеров (code, type, sort_order), ростовка заказа по size_id,
 * рост в раскрое (165/170/ручной), учёт по size_id в партиях/ОТК/складе/отгрузке.
 * Не ломаем текущие данные: добавляем поля и таблицы.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // ————— 1) Справочник размеров: code, type, sort_order —————
    await queryInterface.addColumn('sizes', 'code', {
      type: Sequelize.STRING(10),
      allowNull: true,
    });
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE enum_sizes_type AS ENUM ('NUMERIC', 'ALPHA');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryInterface.addColumn('sizes', 'type', {
      type: 'enum_sizes_type',
      allowNull: true,
    });
    await queryInterface.addColumn('sizes', 'sort_order', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // Нормализация: XXL -> 2XL и т.д.; code = uppercase
    const [rows] = await queryInterface.sequelize.query(`SELECT id, name FROM sizes`);
    const codeMap = { XXL: '2XL', XXXL: '3XL', XXXXL: '4XL', XXXXXL: '5XL' };
    let sortN = 0;
    let sortA = 1000;
    for (const r of rows || []) {
      let code = (r.name || '').toString().trim().toUpperCase();
      code = codeMap[code] || code;
      const isNum = /^\d+$/.test(code);
      const typeVal = isNum ? 'NUMERIC' : 'ALPHA';
      const order = isNum ? (sortN += 1) : (sortA += 1);
      await queryInterface.sequelize.query(
        `UPDATE sizes SET code = :code, type = :type::enum_sizes_type, sort_order = :order WHERE id = :id`,
        { replacements: { code, type: typeVal, order, id: r.id } }
      );
    }

    // Вставить недостающие NUMERIC 40–56 (если нет)
    const [existingCodes] = await queryInterface.sequelize.query(`SELECT code FROM sizes WHERE type = 'NUMERIC'`);
    const have = new Set((existingCodes || []).map((x) => x.code));
    const now = new Date();
    for (let i = 40; i <= 56; i++) {
      const c = String(i);
      if (have.has(c)) continue;
      await queryInterface.sequelize.query(
        `INSERT INTO sizes (name, code, type, sort_order, is_active, created_at, updated_at)
         VALUES (:name, :code, 'NUMERIC', :order, true, :now, :now)`,
        { replacements: { name: c, code: c, order: i, now } }
      );
    }
    // Вставить 2XL если есть только XXL (уже обновлён code в 2XL выше, но name мог остаться XXL)
    const [has2xl] = await queryInterface.sequelize.query(`SELECT 1 FROM sizes WHERE code = '2XL' LIMIT 1`);
    if (!has2xl || has2xl.length === 0) {
      await queryInterface.sequelize.query(
        `INSERT INTO sizes (name, code, type, sort_order, is_active, created_at, updated_at)
         VALUES ('2XL', '2XL', 'ALPHA', 1005, true, :now, :now)`,
        { replacements: { now } }
      );
    }

    await queryInterface.addIndex('sizes', ['code'], { unique: true });
    await queryInterface.sequelize.query('ALTER TABLE sizes ALTER COLUMN code SET NOT NULL');
    await queryInterface.sequelize.query('ALTER TABLE sizes ALTER COLUMN type SET NOT NULL');
    await queryInterface.sequelize.query('ALTER TABLE sizes ALTER COLUMN sort_order SET NOT NULL');
    await queryInterface.sequelize.query('ALTER TABLE sizes ALTER COLUMN sort_order SET DEFAULT 0');

    // ————— 2) Ростовка заказа по size_id (отдельная таблица, не трогаем order_size_matrix) —————
    await queryInterface.createTable('order_rostovka', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      size_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'sizes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      planned_qty: {
        type: Sequelize.DECIMAL(12, 3),
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
    await queryInterface.addIndex('order_rostovka', ['order_id', 'size_id'], {
      unique: true,
      name: 'order_rostovka_order_size_unique',
    });
    await queryInterface.addIndex('order_rostovka', ['order_id']);

    // ————— 3) Раскрой: рост (165/170/ручной) —————
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE enum_cutting_height_type AS ENUM ('PRESET', 'CUSTOM');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryInterface.addColumn('cutting_tasks', 'height_type', {
      type: 'enum_cutting_height_type',
      allowNull: true,
      defaultValue: 'PRESET',
    });
    await queryInterface.addColumn('cutting_tasks', 'height_value', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.sequelize.query(`UPDATE cutting_tasks SET height_type = 'PRESET', height_value = 170 WHERE height_value IS NULL`);
    await queryInterface.sequelize.query(`ALTER TABLE cutting_tasks ALTER COLUMN height_type SET NOT NULL`);
    await queryInterface.sequelize.query(`ALTER TABLE cutting_tasks ALTER COLUMN height_type SET DEFAULT 'PRESET'`);
    await queryInterface.sequelize.query(`ALTER TABLE cutting_tasks ALTER COLUMN height_value SET NOT NULL`);
    await queryInterface.sequelize.query(`ALTER TABLE cutting_tasks ALTER COLUMN height_value SET DEFAULT 170`);

    // ————— 4) Партии/ОТК/склад/отгрузка: учёт по size_id (дополнительно к model_size_id) —————
    await queryInterface.addColumn('sewing_batch_items', 'size_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'sizes', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
    await queryInterface.addIndex('sewing_batch_items', ['batch_id', 'size_id'], {
      name: 'sewing_batch_items_batch_size_idx',
    });

    await queryInterface.addColumn('qc_batch_items', 'size_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'sizes', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
    await queryInterface.addIndex('qc_batch_items', ['qc_batch_id', 'size_id'], {
      name: 'qc_batch_items_qc_batch_size_idx',
    });

    await queryInterface.addColumn('warehouse_stock', 'size_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'sizes', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX warehouse_stock_batch_size_unique
      ON warehouse_stock (batch_id, size_id)
      WHERE batch_id IS NOT NULL AND size_id IS NOT NULL
    `);

    await queryInterface.addColumn('shipment_items', 'size_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'sizes', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
    await queryInterface.addIndex('shipment_items', ['shipment_id', 'size_id'], {
      name: 'shipment_items_shipment_size_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('shipment_items', 'size_id');
    await queryInterface.removeColumn('warehouse_stock', 'size_id');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS warehouse_stock_batch_size_unique');
    await queryInterface.removeColumn('qc_batch_items', 'size_id');
    await queryInterface.removeColumn('sewing_batch_items', 'size_id');
    await queryInterface.removeColumn('cutting_tasks', 'height_type');
    await queryInterface.removeColumn('cutting_tasks', 'height_value');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_cutting_height_type;');
    await queryInterface.dropTable('order_rostovka');
    await queryInterface.removeColumn('sizes', 'code');
    await queryInterface.removeColumn('sizes', 'type');
    await queryInterface.removeColumn('sizes', 'sort_order');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_sizes_type;');
  },
};
