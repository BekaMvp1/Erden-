'use strict';

/**
 * Миграция: справочник этажей (для распределения заказов)
 * Отдельная таблица от цехов пошива
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('building_floors', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
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

    await queryInterface.addColumn('technologists', 'building_floor_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'building_floors', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    const [floors] = await queryInterface.sequelize.query('SELECT id, name, created_at, updated_at FROM floors ORDER BY id');
    if (floors && floors.length > 0) {
      await queryInterface.bulkInsert('building_floors', floors.map((f) => ({
        name: f.name,
        created_at: f.created_at,
        updated_at: f.updated_at,
      })));
      for (let i = 0; i < floors.length; i++) {
        await queryInterface.sequelize.query(
          'UPDATE technologists SET building_floor_id = :bfId WHERE floor_id = :fId',
          { replacements: { bfId: i + 1, fId: floors[i].id } }
        );
      }
    } else {
      await queryInterface.bulkInsert('building_floors', [
        { name: 'Этаж 1', created_at: new Date(), updated_at: new Date() },
        { name: 'Этаж 2', created_at: new Date(), updated_at: new Date() },
        { name: 'Этаж 3', created_at: new Date(), updated_at: new Date() },
        { name: 'Этаж 4', created_at: new Date(), updated_at: new Date() },
      ]);
    }

    await queryInterface.addColumn('orders', 'building_floor_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'building_floors', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('order_floor_distributions', 'building_floor_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'building_floors', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.changeColumn('order_floor_distributions', 'floor_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('order_floor_distributions', 'building_floor_id');
    await queryInterface.removeColumn('orders', 'building_floor_id');
    await queryInterface.removeColumn('technologists', 'building_floor_id');
    await queryInterface.dropTable('building_floors');
  },
};
