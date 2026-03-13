/**
 * Пошив по размерам: заказ, этаж, размер модели, количество, дата
 */

module.exports = (sequelize, DataTypes) => {
  const SewingRecord = sequelize.define(
    'SewingRecord',
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
        allowNull: true,
      },
      model_size_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      qty: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
    },
    {
      tableName: 'sewing_records',
      timestamps: true,
      underscored: true,
    }
  );
  return SewingRecord;
};
