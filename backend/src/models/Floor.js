/**
 * Модель: Цех пошива (филиал в другом городе)
 */

module.exports = (sequelize, DataTypes) => {
  const Floor = sequelize.define('Floor', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
  }, {
    tableName: 'floors',
    timestamps: true,
    underscored: true,
  });
  return Floor;
};
