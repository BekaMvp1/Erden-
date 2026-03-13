/**
 * Период планирования (месяц).
 * Каждый месяц хранится отдельно; закрытый период — только просмотр.
 */

module.exports = (sequelize, DataTypes) => {
  const PlanningPeriod = sequelize.define(
    'PlanningPeriod',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      month: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Месяц 1–12',
      },
      year: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Год',
      },
      start_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: 'Первый день периода',
      },
      end_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: 'Последний день периода',
      },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'CLOSED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
        comment: 'ACTIVE — редактирование, CLOSED — только просмотр',
      },
    },
    {
      tableName: 'planning_periods',
      timestamps: true,
      updatedAt: false,
      underscored: true,
      indexes: [{ unique: true, fields: ['year', 'month'] }],
    }
  );
  return PlanningPeriod;
};
