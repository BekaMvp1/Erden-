/**
 * Недельный план: ручной ввод + перенос остатка (carry)
 * row_key = order_id
 */

module.exports = (sequelize, DataTypes) => {
  const WeeklyPlan = sequelize.define(
    'WeeklyPlan',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      period_id: { type: DataTypes.INTEGER, allowNull: false },
      workshop_id: { type: DataTypes.INTEGER, allowNull: false },
      building_floor_id: { type: DataTypes.INTEGER, allowNull: true },
      week_start: { type: DataTypes.DATEONLY, allowNull: false },
      row_key: { type: DataTypes.INTEGER, allowNull: false },
      planned_manual: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
      planned_carry: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'weekly_plans',
      timestamps: true,
      underscored: true,
    }
  );
  return WeeklyPlan;
};
