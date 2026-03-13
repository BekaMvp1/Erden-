/**
 * Модель: Движение по складу (приход/расход)
 */

module.exports = (sequelize, DataTypes) => {
  const WarehouseMovement = sequelize.define('WarehouseMovement', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    item_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('ПРИХОД', 'РАСХОД'),
      allowNull: false,
    },
    quantity: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: false,
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    comment: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  }, {
    tableName: 'warehouse_movements',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: false,
  });
  return WarehouseMovement;
};
