/**
 * Модель: План производства по дням
 * Одна строка = заказ + дата + цех + этаж (если применимо)
 */

module.exports = (sequelize, DataTypes) => {
  const ProductionPlanDay = sequelize.define(
    'ProductionPlanDay',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      workshop_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'workshops', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      floor_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'building_floors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      planned_qty: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      actual_qty: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: 'production_plan_day',
      timestamps: true,
      underscored: true,
      // Уникальность задаётся миграцией: (order_id, date, workshop_id, COALESCE(floor_id,0))
    }
  );
  return ProductionPlanDay;
};
