'use strict';

/**
 * Миграция: устанавливает building_floor_id для технологов, у которых он null.
 * Использует маппинг floor_id -> building_floor_id (1:1 по порядку).
 * building_floors созданы из floors, поэтому id совпадают при одинаковой нумерации.
 */

module.exports = {
  async up(queryInterface) {
    const [floors] = await queryInterface.sequelize.query(
      'SELECT id FROM floors ORDER BY id'
    );
    const [buildingFloors] = await queryInterface.sequelize.query(
      'SELECT id FROM building_floors ORDER BY id'
    );
    if (!floors?.length || !buildingFloors?.length) return;

    for (let i = 0; i < Math.min(floors.length, buildingFloors.length); i++) {
      await queryInterface.sequelize.query(
        `UPDATE technologists SET building_floor_id = :bfId 
         WHERE floor_id = :fId AND (building_floor_id IS NULL OR building_floor_id = 0)`,
        { replacements: { bfId: buildingFloors[i].id, fId: floors[i].id } }
      );
    }
  },

  async down() {
    // Не откатываем — building_floor_id может быть нужен
  },
};
