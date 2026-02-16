/**
 * Модель: Задача на раскрой по заказу
 */

module.exports = (sequelize, DataTypes) => {
  const CuttingTask = sequelize.define('CuttingTask', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    cutting_type: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    operation: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Ожидает',
    },
    responsible: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    actual_variants: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: '[{ color, size, quantity_planned, quantity_actual }]',
    },
  }, {
    tableName: 'cutting_tasks',
    timestamps: true,
    underscored: true,
  });
  return CuttingTask;
};
