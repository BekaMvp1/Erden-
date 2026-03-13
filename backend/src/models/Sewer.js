/**
 * Модель: Швея
 */

module.exports = (sequelize, DataTypes) => {
  const Sewer = sequelize.define('Sewer', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    technologist_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    capacity_per_day: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 480,
    },
  }, {
    tableName: 'sewers',
    timestamps: true,
    underscored: true,
  });
  return Sewer;
};
