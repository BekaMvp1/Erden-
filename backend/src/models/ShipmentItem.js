/**
 * Позиция отгрузки: размер и количество. Отгрузка привязана к партии (shipments.batch_id).
 */

module.exports = (sequelize, DataTypes) => {
  const ShipmentItem = sequelize.define(
    'ShipmentItem',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      shipment_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      model_size_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      size_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      qty: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: 'shipment_items',
      timestamps: true,
      underscored: true,
    }
  );
  return ShipmentItem;
};
