'use strict';

/**
 * Разрешить model_size_id = NULL в sewing_batch_items и qc_batch_items при учёте по size_id.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE sewing_batch_items ALTER COLUMN model_size_id DROP NOT NULL');
    await queryInterface.sequelize.query('ALTER TABLE qc_batch_items ALTER COLUMN model_size_id DROP NOT NULL');
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE sewing_batch_items ALTER COLUMN model_size_id SET NOT NULL');
    await queryInterface.sequelize.query('ALTER TABLE qc_batch_items ALTER COLUMN model_size_id SET NOT NULL');
  },
};
