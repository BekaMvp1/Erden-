/**
 * Модель: Производственный календарь
 */

module.exports = (sequelize, DataTypes) => {
  const ProductionCalendar = sequelize.define('ProductionCalendar', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    sewer_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    capacity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 480,
    },
    load: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  }, {
    tableName: 'production_calendar',
    timestamps: true,
    underscored: true,
  });
  return ProductionCalendar;
};
