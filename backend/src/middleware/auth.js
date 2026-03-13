/**
 * Middleware аутентификации и авторизации (RBAC)
 */

const jwt = require('jsonwebtoken');
const db = require('../models');

/**
 * Проверка JWT токена, загрузка пользователя
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, require('../config').jwt.secret);

    const user = await db.User.scope('withPassword').findByPk(decoded.userId, {
      include: [
        { model: db.Floor, as: 'Floor', required: false },
        { model: db.Technologist, as: 'Technologist', required: false, include: [{ model: db.Floor, as: 'Floor', required: false }] },
        { model: db.Sewer, as: 'Sewer', required: false, include: [{ model: db.Technologist, as: 'Technologist', required: false }] },
      ],
    });

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Пользователь не найден или деактивирован' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Недействительный или истёкший токен' });
    }
    next(err);
  }
};

/**
 * Проверка роли: разрешены только указанные роли
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    next();
  };
};

/**
 * Технолог видит только свой цех пошива
 */
const technologistFloorOnly = async (req, res, next) => {
  if (req.user.role !== 'technologist') return next();
  const technologist = req.user.Technologist;
  if (!technologist) {
    return res.status(403).json({ error: 'Технолог не привязан к цеху пошива' });
  }
  req.allowedFloorId = technologist.floor_id;
  req.allowedBuildingFloorId = technologist.building_floor_id;
  next();
};

/**
 * Оператор (швея) - ограниченный доступ
 */
const operatorRestricted = (req, res, next) => {
  if (req.user.role === 'operator') {
    return res.status(403).json({ error: 'Нет доступа к данной функции' });
  }
  next();
};

module.exports = {
  authenticate,
  requireRole,
  technologistFloorOnly,
  operatorRestricted,
};
