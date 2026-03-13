/**
 * Модель: Складская позиция (остатки)
 */

module.exports = (sequelize, DataTypes) => {
  const WarehouseItem = sequelize.define('WarehouseItem', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    unit: {
      type: DataTypes.ENUM('РУЛОН', 'КГ', 'ТОННА', 'ШТ'),
      allowNull: false,
    },
    stock_quantity: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: false,
      defaultValue: 0,
    },
  }, {
    tableName: 'warehouse_items',
    timestamps: true,
    underscored: true,
  });
  return WarehouseItem;
};
