/**
 * Модель: Заказ
 */

module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define('Order', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    client_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    total_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    deadline: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    status_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    floor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    building_floor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    technologist_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    planned_month: {
      type: DataTypes.STRING(7),
      allowNull: true,
    },
    color: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    size_in_numbers: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    size_in_letters: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    workshop_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    photos: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
  }, {
    tableName: 'orders',
    timestamps: true,
    underscored: true,
  });
  return Order;
};
