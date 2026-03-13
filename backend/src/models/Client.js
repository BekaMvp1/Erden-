/**
 * Модель: Клиент
 */

module.exports = (sequelize, DataTypes) => {
  const Client = sequelize.define('Client', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
  }, {
    tableName: 'clients',
    timestamps: true,
    underscored: true,
  });
  return Client;
};
