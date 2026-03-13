/**
 * Модель: Позиция закупа (материал)
 * purchased_sum = purchased_qty * purchased_price
 */
module.exports = (sequelize, DataTypes) => {
  const ProcurementItem = sequelize.define('ProcurementItem', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    procurement_request_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    material_name: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    planned_qty: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: false,
    },
    unit: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    purchased_qty: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: false,
      defaultValue: 0,
    },
    purchased_price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    purchased_sum: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
  }, {
    tableName: 'procurement_items',
    timestamps: true,
    updatedAt: false, // в таблице только created_at
    underscored: true,
  });
  return ProcurementItem;
};
