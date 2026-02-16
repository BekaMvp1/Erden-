/**
 * Модель: справочник цветов изделий (добавляются вручную)
 */

module.exports = (sequelize, DataTypes) => {
  const Color = sequelize.define('Color', {
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
    tableName: 'colors',
    timestamps: true,
    underscored: true,
  });
  return Color;
};
