/**
 * Перенос остатка на следующую неделю (carry)
 * row_key = order_id. carry_qty = остаток с предыдущей недели.
 */

module.exports = (sequelize, DataTypes) => {
  const WeeklyCarry = sequelize.define(
    'WeeklyCarry',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      period_id: { type: DataTypes.INTEGER, allowNull: false },
      workshop_id: { type: DataTypes.INTEGER, allowNull: false },
      building_floor_id: { type: DataTypes.INTEGER, allowNull: true },
      week_start: { type: DataTypes.DATEONLY, allowNull: false },
      row_key: { type: DataTypes.INTEGER, allowNull: false },
      carry_qty: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'weekly_carry',
      timestamps: true,
      underscored: true,
    }
  );
  return WeeklyCarry;
};
