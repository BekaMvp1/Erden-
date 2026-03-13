'use strict';

/**
 * Миграция: варианты заказа (цвет + размер + количество)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('order_variants', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'orders',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      color: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      size_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'sizes',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('order_variants', ['order_id']);
    await queryInterface.addIndex('order_variants', ['size_id']);
    await queryInterface.addIndex('order_variants', ['color']);
    await queryInterface.addIndex('order_variants', ['order_id', 'color', 'size_id'], { unique: true });

    // Ограничение: quantity >= 0
    await queryInterface.sequelize.query(
      'ALTER TABLE order_variants ADD CONSTRAINT order_variants_quantity_check CHECK (quantity >= 0)'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE order_variants DROP CONSTRAINT IF EXISTS order_variants_quantity_check');
    await queryInterface.dropTable('order_variants');
  },
};
