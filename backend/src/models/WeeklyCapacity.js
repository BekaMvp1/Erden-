/**
 * Мощность (capacity) на неделю для этажа/цеха
 */

module.exports = (sequelize, DataTypes) => {
  const WeeklyCapacity = sequelize.define(
    'WeeklyCapacity',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      workshop_id: { type: DataTypes.INTEGER, allowNull: false },
      building_floor_id: { type: DataTypes.INTEGER, allowNull: true },
      week_start: { type: DataTypes.DATEONLY, allowNull: false },
      capacity_week: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'weekly_capacity',
      timestamps: true,
      underscored: true,
    }
  );
  return WeeklyCapacity;
};
