'use strict';

/**
 * Связь партии с периодом производства: date_from, date_to, qty = SUM(sewing_fact) в диапазоне.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sewing_batches', 'date_from', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
    await queryInterface.addColumn('sewing_batches', 'date_to', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
    await queryInterface.addColumn('sewing_batches', 'qty', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('sewing_batches', 'date_from');
    await queryInterface.removeColumn('sewing_batches', 'date_to');
    await queryInterface.removeColumn('sewing_batches', 'qty');
  },
};
