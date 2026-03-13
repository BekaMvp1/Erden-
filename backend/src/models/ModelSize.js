/**
 * Размерная сетка модели (модель + размер)
 */

module.exports = (sequelize, DataTypes) => {
  const ModelSize = sequelize.define(
    'ModelSize',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      model_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      size_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      tableName: 'model_sizes',
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ['model_id', 'size_id'] }],
    }
  );
  return ModelSize;
};
