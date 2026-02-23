/**
 * Роуты справочников
 */

const express = require('express');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const db = require('../models');

const router = express.Router();

/**
 * GET /api/references/building-floors
 * Этажи (для распределения заказов). Отдельная таблица.
 * ?limit=4 — только 4 этажа
 */
router.get('/building-floors', async (req, res, next) => {
  try {
    const limit = req.query.limit ? Math.min(parseInt(req.query.limit, 10) || 100, 100) : undefined;
    const floors = await db.BuildingFloor.findAll({
      order: [['id']],
      attributes: ['id', 'name'],
      ...(limit && { limit }),
    });
    res.json(floors);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/references/building-floors
 * Добавление этажа (для распределения)
 */
router.post('/building-floors', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Укажите название этажа' });
    }
    const floor = await db.BuildingFloor.create({ name: String(name).trim() });
    res.status(201).json(floor);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/references/floors
 * Возвращает цехи пошива (для создания заказа).
 */
router.get('/floors', async (req, res, next) => {
  try {
    const limit = req.query.limit ? Math.min(parseInt(req.query.limit, 10) || 100, 100) : undefined;
    const floors = await db.Floor.findAll({
      order: [['id']],
      attributes: ['id', 'name'],
      ...(limit && { limit }),
    });
    res.json(floors);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/references/floors
 * Добавление цеха пошива вручную (admin/manager)
 */
router.post('/floors', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Укажите название цеха пошива' });
    }
    const floor = await db.Floor.create({ name: String(name).trim() });
    res.status(201).json(floor);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/references/clients
 */
router.get('/clients', async (req, res, next) => {
  try {
    const clients = await db.Client.findAll({ order: [['name']] });
    res.json(clients);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/references/clients
 * Добавление клиента (admin/manager)
 */
router.post('/clients', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Укажите название клиента' });
    }
    const client = await db.Client.create({ name: String(name).trim() });
    res.status(201).json(client);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/references/operations
 */
router.get('/operations', async (req, res, next) => {
  try {
    const ops = await db.Operation.findAll({
      include: [{ model: db.BuildingFloor, as: 'BuildingFloor', attributes: ['id', 'name'] }],
      order: [['name']],
    });
    res.json(ops);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/references/operations
 * Добавление операции (admin/manager)
 */
router.post('/operations', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const { name, norm_minutes, category, default_floor_id, locked_to_floor } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Укажите название операции' });
    }
    const norm = parseFloat(norm_minutes);
    if (isNaN(norm) || norm < 0) {
      return res.status(400).json({ error: 'Укажите норму времени (минуты, число ≥ 0)' });
    }
    const validCategory = ['CUTTING', 'SEWING', 'FINISH'].includes(category) ? category : 'SEWING';
    const op = await db.Operation.create({
      name: String(name).trim(),
      norm_minutes: norm,
      category: validCategory,
      default_floor_id: default_floor_id ? Number(default_floor_id) : null,
      locked_to_floor: Boolean(locked_to_floor),
    });
    const created = await db.Operation.findByPk(op.id, {
      include: [{ model: db.BuildingFloor, as: 'BuildingFloor', attributes: ['id', 'name'] }],
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/references/operations/:id
 * Удаление операции (admin/manager). Нельзя удалить, если операция используется в заказах.
 */
router.delete('/operations/:id', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Неверный ID' });
    const op = await db.Operation.findByPk(id);
    if (!op) return res.status(404).json({ error: 'Операция не найдена' });
    const used = await db.OrderOperation.count({ where: { operation_id: id } });
    if (used > 0) {
      return res.status(400).json({ error: `Операция используется в ${used} заказах. Удаление невозможно.` });
    }
    await op.destroy();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/references/order-status
 */
router.get('/order-status', async (req, res, next) => {
  try {
    const statuses = await db.OrderStatus.findAll({ order: [['id']] });
    res.json(statuses);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/references/colors
 * Поиск цветов по имени (подсказки при вводе). ?search=чер → Черный, Черно-белый и т.д.
 */
router.get('/colors', async (req, res, next) => {
  try {
    const { search } = req.query;
    const where = {};
    if (search && String(search).trim()) {
      where.name = { [Op.iLike]: `%${String(search).trim()}%` };
    }
    const colors = await db.Color.findAll({
      where,
      order: [['name']],
      attributes: ['id', 'name'],
      limit: 100,
    });
    res.json(colors);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/references/colors
 * Добавление цвета вручную (admin/manager)
 */
router.post('/colors', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Укажите название цвета' });
    }
    const color = await db.Color.create({ name: String(name).trim() });
    res.status(201).json(color);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/references/technologists
 * floor_id — цех пошива (справочники). building_floor_id — этаж (распределение).
 */
router.get('/technologists', async (req, res, next) => {
  try {
    const where = {};
    const bfId = req.query.building_floor_id ? parseInt(req.query.building_floor_id, 10) : null;
    if (bfId) {
      // Этаж: технолог с building_floor_id ИЛИ с NULL (fallback по floor_id, 1:1)
      where[Op.or] = [
        { building_floor_id: bfId },
        { building_floor_id: { [Op.is]: null }, floor_id: bfId },
      ];
    } else if (req.query.floor_id) {
      where.floor_id = req.query.floor_id;
    }

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      where.floor_id = req.allowedFloorId;
    }

    const techs = await db.Technologist.findAll({
      where,
      include: [
        { model: db.User, as: 'User' },
        { model: db.Floor, as: 'Floor' },
      ],
      order: [['floor_id']],
    });
    const unique = techs.filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i);
    const limit = (req.query.floor_id || req.query.building_floor_id) && !req.query.all ? 4 : undefined;
    res.json(limit ? unique.slice(0, limit) : unique);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/references/technologists
 * Добавление технолога вручную (admin/manager).
 * Создаёт пользователя (User) с role=technologist и запись Technologist.
 * body: { name, email, password, floor_id }
 */
router.post('/technologists', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const { name, email, password, floor_id, building_floor_id } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Укажите ФИО технолога' });
    if (!email || !String(email).trim()) return res.status(400).json({ error: 'Укажите email' });
    if (!password || String(password).length < 6) return res.status(400).json({ error: 'Пароль не менее 6 символов' });
    if (!floor_id) return res.status(400).json({ error: 'Выберите цех пошива' });
    if (!building_floor_id) return res.status(400).json({ error: 'Выберите этаж' });

    const emailNorm = String(email).trim().toLowerCase();
    const floor = await db.Floor.findByPk(floor_id);
    if (!floor) return res.status(400).json({ error: 'Цех не найден' });
    const buildingFloor = await db.BuildingFloor.findByPk(building_floor_id);
    if (!buildingFloor) return res.status(400).json({ error: 'Этаж не найден' });

    const existing = await db.User.findOne({ where: { email: emailNorm } });
    if (existing) return res.status(400).json({ error: 'Пользователь с таким email уже существует' });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await db.User.create({
      name: String(name).trim(),
      email: emailNorm,
      password_hash: passwordHash,
      role: 'technologist',
      floor_id: floor.id,
      is_active: true,
    });

    const technologist = await db.Technologist.create({
      user_id: user.id,
      floor_id: floor.id,
      building_floor_id: buildingFloor.id,
    });

    const result = await db.Technologist.findByPk(technologist.id, {
      include: [
        { model: db.User, as: 'User' },
        { model: db.Floor, as: 'Floor' },
      ],
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/references/sewers
 * Добавление швеи вручную (admin/manager).
 * Создаёт пользователя (User) с role=operator и запись Sewer.
 * body: { name, phone, technologist_id }
 */
router.post('/sewers', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const { name, phone, technologist_id } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Укажите ФИО швеи' });
    if (!phone || !String(phone).trim()) return res.status(400).json({ error: 'Укажите номер телефона' });
    if (!technologist_id) return res.status(400).json({ error: 'Выберите технолога (этаж)' });

    const technologist = await db.Technologist.findByPk(technologist_id, {
      include: [{ model: db.Floor, as: 'Floor' }],
    });
    if (!technologist) return res.status(400).json({ error: 'Технолог не найден' });

    const phoneNorm = String(phone).trim().replace(/\D/g, '');
    const baseEmail = `sewer_${Date.now()}_${phoneNorm.slice(-4)}@factory.local`;
    let email = baseEmail;
    let idx = 0;
    while (await db.User.findOne({ where: { email } })) {
      email = `sewer_${Date.now()}_${idx}@factory.local`;
      idx++;
    }

    const defaultPassword = Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(defaultPassword, 10);
    const user = await db.User.create({
      name: String(name).trim(),
      email,
      password_hash: passwordHash,
      role: 'operator',
      floor_id: technologist.floor_id,
      is_active: true,
      phone: String(phone).trim(),
    });

    const sewer = await db.Sewer.create({
      user_id: user.id,
      technologist_id: technologist.id,
      capacity_per_day: 480,
    });

    const result = await db.Sewer.findByPk(sewer.id, {
      include: [
        { model: db.User, as: 'User' },
        { model: db.Technologist, as: 'Technologist', include: [{ model: db.Floor, as: 'Floor' }] },
      ],
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/references/cutting-types
 * Справочник типов раскроя (Аксы, Аутсорс + динамические)
 */
router.get('/cutting-types', async (req, res, next) => {
  try {
    const where = req.query.all === '1' && ['admin', 'manager'].includes(req.user?.role)
      ? {} : { is_active: true };
    const types = await db.CuttingType.findAll({
      where,
      order: [['name']],
    });
    res.json(types);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/references/cutting-types
 * Добавить тип раскроя (admin/manager)
 */
router.post('/cutting-types', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Укажите название типа раскроя' });
    }
    const type = await db.CuttingType.create({
      name: String(name).trim(),
      is_active: true,
    });
    res.status(201).json(type);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/references/cutting-types/:id
 * Редактировать тип раскроя
 */
router.put('/cutting-types/:id', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const { name, is_active } = req.body;
    const type = await db.CuttingType.findByPk(req.params.id);
    if (!type) return res.status(404).json({ error: 'Тип не найден' });
    if (name !== undefined) type.name = String(name).trim();
    if (is_active !== undefined) type.is_active = !!is_active;
    await type.save();
    res.json(type);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/references/cutting-types/:id
 */
router.delete('/cutting-types/:id', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const type = await db.CuttingType.findByPk(req.params.id);
    if (!type) return res.status(404).json({ error: 'Тип не найден' });
    await type.update({ is_active: false });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/references/sewers
 * С опциональным technologist_id
 */
router.get('/sewers', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.technologist_id) where.technologist_id = req.query.technologist_id;

    if (req.user.role === 'technologist' && req.user.Technologist) {
      where.technologist_id = req.user.Technologist.id;
    }

    const sewers = await db.Sewer.findAll({
      where,
      include: [
        { model: db.User, as: 'User' },
        { model: db.Technologist, as: 'Technologist', include: [{ model: db.Floor, as: 'Floor' }] },
      ],
    });
    res.json(sewers);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
