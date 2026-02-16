/**
 * Модель: Технолог
 */

module.exports = (sequelize, DataTypes) => {
  const Technologist = sequelize.define('Technologist', {
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
    floor_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    building_floor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  }, {
    tableName: 'technologists',
    timestamps: true,
    underscored: true,
  });
  return Technologist;
};
