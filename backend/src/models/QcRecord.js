/**
 * ОТК: проверка по размерам (проверено / принято / брак)
 * После ОТК принятое количество попадает на склад (warehouse_stock).
 */

module.exports = (sequelize, DataTypes) => {
  const QcRecord = sequelize.define(
    'QcRecord',
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
      model_size_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      checked_qty: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      passed_qty: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      defect_qty: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: 'qc_records',
      timestamps: true,
      underscored: true,
    }
  );
  return QcRecord;
};
