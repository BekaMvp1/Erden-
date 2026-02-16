/**
 * Модель: Цех
 * Наш цех = 4 этажа, Аутсорс/Аксы = 1 этаж
 */

module.exports = (sequelize, DataTypes) => {
  const Workshop = sequelize.define(
    'Workshop',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },
      floors_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: 'workshops',
      timestamps: true,
      underscored: true,
    }
  );
  return Workshop;
};
