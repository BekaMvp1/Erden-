/**
 * План пошива по заказу, этажу и дате. Единый ключ связки: (order_id, floor_id).
 * Используется для доски пошива: plan_rows и totals.plan_sum.
 */

module.exports = (sequelize, DataTypes) => {
  const SewingPlanRow = sequelize.define(
    'SewingPlanRow',
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
      work_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      plan_qty: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: 'sewing_plan_rows',
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ['order_id', 'floor_id', 'work_date'] }],
    }
  );
  return SewingPlanRow;
};
