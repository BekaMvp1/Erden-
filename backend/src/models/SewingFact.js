/**
 * Факт пошива по заказу, этажу и дате.
 * Заполняется при нажатии «Сохранить» на странице Пошив.
 */

module.exports = (sequelize, DataTypes) => {
  const SewingFact = sequelize.define(
    'SewingFact',
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
      floor_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      fact_qty: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: 'sewing_fact',
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ['order_id', 'floor_id', 'date'] }],
    }
  );
  return SewingFact;
};
