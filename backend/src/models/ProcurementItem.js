/**
 * Модель: Позиция закупа (ткань, фурнитура и т.д.)
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
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    unit: {
      type: DataTypes.ENUM('РУЛОН', 'КГ', 'ТОННА'),
      allowNull: false,
    },
    quantity: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: false,
    },
    price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    supplier: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    comment: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  }, {
    tableName: 'procurement_items',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: false,
  });
  return ProcurementItem;
};
