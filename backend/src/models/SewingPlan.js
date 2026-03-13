/**
 * План и факт пошива по этажу, размеру, дате.
 * Учёт всегда по размерам: planned_qty и fact_qty по каждому model_size.
 * sewing_total = SUM(fact_qty) по всем записям заказа.
 */

module.exports = (sequelize, DataTypes) => {
  const SewingPlan = sequelize.define(
    'SewingPlan',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      floor_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      model_size_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      planned_qty: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      fact_qty: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      batch_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Партия пошива (при привязке к sewing_batches)',
      },
    },
    {
      tableName: 'sewing_plans',
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ['order_id', 'floor_id', 'model_size_id', 'date'] }],
    }
  );
  return SewingPlan;
};
