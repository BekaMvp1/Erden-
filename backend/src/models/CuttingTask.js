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
    // Этаж: 1 = ФИНИШ, 2–4 = ПОШИВ
    floor: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 4 },
    },
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    actual_variants: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: '[{ color, size, quantity_planned, quantity_actual }]',
    },
    // Рост: 165 / 170 или ручной (120–220)
    height_type: {
      type: DataTypes.ENUM('PRESET', 'CUSTOM'),
      allowNull: true,
      defaultValue: 'PRESET',
    },
    height_value: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 170,
    },
  }, {
    tableName: 'cutting_tasks',
    timestamps: true,
    underscored: true,
  });
  return CuttingTask;
};
