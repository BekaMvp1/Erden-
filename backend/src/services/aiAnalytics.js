/**
 * Аналитические функции для ИИ-ассистента
 * Все SQL-запросы — подготовленные, без генерации
 */

const db = require('../models');

/**
 * Получить фильтр по роли пользователя
 */
function getRoleFilter(user) {
  const filter = { sewerIds: null, floorId: null };
  if (!user) return filter;
  if (user.role === 'technologist' && user.Technologist) {
    filter.floorId = user.Technologist.floor_id;
  }
  if (user.role === 'operator' && user.Sewer) {
    filter.sewerIds = [user.Sewer.id];
  }
  return filter;
}

/**
 * Выполнено за день (сумма actual_quantity)
 */
async function completedToday(user) {
  const today = new Date().toISOString().slice(0, 10);
  const { sewerIds, floorId } = getRoleFilter(user);

  let whereClause = `oo.planned_date = :today AND oo.actual_quantity IS NOT NULL`;
  const replacements = { today };

  if (sewerIds) {
    whereClause += ' AND oo.sewer_id = :sewerId';
    replacements.sewerId = sewerIds[0];
  }

  if (floorId) {
    whereClause += ` AND s.technologist_id IN (SELECT id FROM technologists WHERE floor_id = :floorId)`;
    replacements.floorId = floorId;
  }

  const joinClause = floorId ? `JOIN sewers s ON s.id = oo.sewer_id` : '';

  const [rows] = await db.sequelize.query(
    `SELECT COALESCE(SUM(oo.actual_quantity), 0) as total
     FROM order_operations oo ${joinClause}
     WHERE ${whereClause}`,
    { replacements }
  );

  const total = parseInt(rows[0]?.total || 0, 10);
  return {
    summary: `Сегодня (${today}) выполнено: ${total} изделий`,
    data: [{ date: today, total }],
    chart: { type: 'bar', labels: [today], values: [total] },
  };
}

/**
 * Выполнено за день по этажам
 */
async function completedTodayByFloor(user) {
  const today = new Date().toISOString().slice(0, 10);
  const { floorId } = getRoleFilter(user);

  let floorFilter = '';
  const replacements = { today };
  if (floorId) {
    floorFilter = 'AND t.floor_id = :floorId';
    replacements.floorId = floorId;
  }

  const [rows] = await db.sequelize.query(
    `SELECT f.name as floor_name, COALESCE(SUM(oo.actual_quantity), 0) as total
     FROM order_operations oo
     JOIN sewers s ON s.id = oo.sewer_id
     JOIN technologists t ON t.id = s.technologist_id
     JOIN floors f ON f.id = t.floor_id
     WHERE oo.planned_date = :today AND oo.actual_quantity IS NOT NULL ${floorFilter}
     GROUP BY f.id, f.name
     ORDER BY f.name`,
    { replacements }
  );

  const total = rows.reduce((s, r) => s + parseInt(r.total, 10), 0);
  return {
    summary: `За сегодня (${today}) по этажам: всего ${total} изд.`,
    data: rows,
    chart: {
      type: 'bar',
      labels: rows.map((r) => r.floor_name),
      values: rows.map((r) => parseInt(r.total, 10)),
    },
  };
}

/**
 * Выполнено за месяц
 */
async function completedThisMonth(user) {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const { sewerIds, floorId } = getRoleFilter(user);

  let whereClause = `oo.planned_date >= :monthStart AND oo.actual_quantity IS NOT NULL`;
  const replacements = { monthStart };

  if (sewerIds) {
    whereClause += ' AND oo.sewer_id = :sewerId';
    replacements.sewerId = sewerIds[0];
  }

  if (floorId) {
    whereClause += ` AND s.technologist_id IN (SELECT id FROM technologists WHERE floor_id = :floorId)`;
    replacements.floorId = floorId;
  }

  const joinClause = floorId ? 'JOIN sewers s ON s.id = oo.sewer_id' : '';

  const [rows] = await db.sequelize.query(
    `SELECT COALESCE(SUM(oo.actual_quantity), 0) as total
     FROM order_operations oo ${joinClause}
     WHERE ${whereClause}`,
    { replacements }
  );

  const total = parseInt(rows[0]?.total || 0, 10);
  return {
    summary: `За этот месяц: ${total} изделий`,
    data: [{ month: monthStart, total }],
    chart: { type: 'bar', labels: [monthStart], values: [total] },
  };
}

/**
 * График производства за месяц (по дням)
 */
async function productionChartMonth(user) {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const { sewerIds, floorId } = getRoleFilter(user);

  let whereClause = `oo.planned_date >= :monthStart AND oo.planned_date <= :monthEnd`;
  const replacements = { monthStart, monthEnd };

  if (sewerIds) {
    whereClause += ' AND oo.sewer_id = :sewerId';
    replacements.sewerId = sewerIds[0];
  }

  if (floorId) {
    whereClause += ` AND s.technologist_id IN (SELECT id FROM technologists WHERE floor_id = :floorId)`;
    replacements.floorId = floorId;
  }

  const joinClause = floorId ? 'JOIN sewers s ON s.id = oo.sewer_id' : '';

  const [rows] = await db.sequelize.query(
    `SELECT oo.planned_date as date,
       COALESCE(SUM(oo.actual_quantity), 0) as fact,
       COALESCE(SUM(oo.planned_quantity), 0) as plan
     FROM order_operations oo ${joinClause}
     WHERE ${whereClause}
     GROUP BY oo.planned_date
     ORDER BY oo.planned_date`,
    { replacements }
  );

  const labels = rows.map((r) => r.date);
  const factValues = rows.map((r) => parseInt(r.fact, 10));
  const planValues = rows.map((r) => parseInt(r.plan, 10));

  return {
    summary: `График производства за ${monthStart.slice(0, 7)}: ${rows.length} дней с данными`,
    data: rows,
    chart: {
      type: 'line',
      labels,
      values: factValues,
      planValues,
    },
  };
}

/**
 * Самая загруженная швея сегодня
 */
async function busiestSewerToday(user) {
  const today = new Date().toISOString().slice(0, 10);
  const { sewerIds, floorId } = getRoleFilter(user);

  let whereClause = `oo.planned_date = :today`;
  const replacements = { today };

  if (sewerIds) {
    whereClause += ' AND oo.sewer_id = :sewerId';
    replacements.sewerId = sewerIds[0];
  }

  if (floorId) {
    whereClause += ` AND t.floor_id = :floorId`;
    replacements.floorId = floorId;
  }

  const [rows] = await db.sequelize.query(
    `SELECT u.name as sewer_name, COALESCE(SUM(oo.actual_quantity), 0) as total
     FROM order_operations oo
     JOIN sewers s ON s.id = oo.sewer_id
     JOIN users u ON u.id = s.user_id
     JOIN technologists t ON t.id = s.technologist_id
     WHERE ${whereClause}
     GROUP BY s.id, u.name
     ORDER BY total DESC
     LIMIT 5`,
    { replacements }
  );

  const top = rows[0];
  const summary = top
    ? `Самая загруженная сегодня: ${top.sewer_name} — ${top.total} изд.`
    : `На сегодня нет данных по швеям`;

  return {
    summary,
    data: rows,
    chart: rows.length > 0
      ? {
          type: 'bar',
          labels: rows.map((r) => r.sewer_name),
          values: rows.map((r) => parseInt(r.total, 10)),
        }
      : null,
  };
}

/**
 * План vs факт за месяц
 */
async function planVsFactMonth(user) {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const { sewerIds, floorId } = getRoleFilter(user);

  let whereClause = `oo.planned_date >= :monthStart AND oo.planned_date <= :monthEnd`;
  const replacements = { monthStart, monthEnd };

  if (sewerIds) {
    whereClause += ' AND oo.sewer_id = :sewerId';
    replacements.sewerId = sewerIds[0];
  }

  if (floorId) {
    whereClause += ` AND s.technologist_id IN (SELECT id FROM technologists WHERE floor_id = :floorId)`;
    replacements.floorId = floorId;
  }

  const joinClause = floorId ? 'JOIN sewers s ON s.id = oo.sewer_id' : '';

  const [rows] = await db.sequelize.query(
    `SELECT 
       COALESCE(SUM(oo.planned_quantity), 0) as plan_qty,
       COALESCE(SUM(oo.actual_quantity), 0) as fact_qty,
       COALESCE(SUM(oo.planned_quantity * o.norm_minutes), 0) as plan_min,
       COALESCE(SUM(oo.actual_quantity * o.norm_minutes), 0) as fact_min
     FROM order_operations oo
     JOIN operations o ON o.id = oo.operation_id
     ${joinClause}
     WHERE ${whereClause}`,
    { replacements }
  );

  const r = rows[0];
  const plan = parseInt(r?.plan_qty || 0, 10);
  const fact = parseInt(r?.fact_qty || 0, 10);
  const diff = fact - plan;

  return {
    summary: `План vs факт за ${monthStart.slice(0, 7)}: план ${plan}, факт ${fact} изд. (${diff >= 0 ? '+' : ''}${diff})`,
    data: [{ plan, fact, diff }],
    chart: {
      type: 'bar',
      labels: ['План', 'Факт'],
      values: [plan, fact],
    },
  };
}

/**
 * Общая сводка (заказы, статусы)
 */
async function generalStats(user) {
  const { floorId, sewerIds } = getRoleFilter(user);
  let whereClause = '1=1';
  let joinClause = '';
  const replacements = {};

  if (floorId) {
    whereClause += ' AND o.floor_id = :floorId';
    replacements.floorId = floorId;
  }
  if (sewerIds) {
    joinClause = 'JOIN order_operations oo2 ON oo2.order_id = o.id AND oo2.sewer_id = :sewerId';
    replacements.sewerId = sewerIds[0];
  }

  const [ordersByStatus] = await db.sequelize.query(
    `SELECT os.name, COUNT(DISTINCT o.id) as cnt
     FROM orders o
     JOIN order_status os ON os.id = o.status_id
     ${joinClause}
     WHERE ${whereClause}
     GROUP BY os.id, os.name`,
    { replacements }
  );

  const total = ordersByStatus.reduce((s, r) => s + parseInt(r.cnt, 10), 0);
  const statusList = ordersByStatus.map((r) => `${r.name}: ${r.cnt}`).join(', ');

  return {
    summary: `Всего заказов: ${total}. По статусам: ${statusList}`,
    data: ordersByStatus,
    chart: ordersByStatus.length > 0
      ? {
          type: 'bar',
          labels: ordersByStatus.map((r) => r.name),
          values: ordersByStatus.map((r) => parseInt(r.cnt, 10)),
        }
      : null,
  };
}

/**
 * Просроченные заказы
 */
async function overdueOrders(user) {
  const today = new Date().toISOString().slice(0, 10);
  const { floorId } = getRoleFilter(user);

  let whereClause = `o.deadline < :today AND os.name != 'Готов'`;
  const replacements = { today };

  if (floorId) {
    whereClause += ' AND o.floor_id = :floorId';
    replacements.floorId = floorId;
  }

  const [rows] = await db.sequelize.query(
    `SELECT o.id, o.title, o.quantity, o.deadline, os.name as status
     FROM orders o
     JOIN order_status os ON os.id = o.status_id
     WHERE ${whereClause}
     ORDER BY o.deadline
     LIMIT 20`,
    { replacements }
  );

  const count = rows.length;
  return {
    summary: `Просрочено заказов: ${count}`,
    data: rows,
    chart: count > 0 ? { type: 'bar', labels: rows.map((r) => `#${r.id}`), values: rows.map((r) => r.quantity) } : null,
  };
}

/**
 * Определить тип запроса и вызвать нужную функцию
 * Широкий набор ключевых слов для распознавания
 */
async function processQuery(query, user) {
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    return generalStats(user);
  }

  // Приветствие или помощь — показываем примеры и общую сводку
  if (
    q.includes('привет') || q.includes('здравствуй') || q.includes('помощ') ||
    q.includes('помоги') || q.includes('как пользовать') || q.includes('что можно') ||
    q.includes('что умеешь') || q.includes('какие запросы')
  ) {
    const stats = await generalStats(user);
    stats.summary = `Доступные запросы: «Сколько изделий сделали сегодня?», «Работы за сегодня по этажам», «График производства за месяц», «Какая швея самая загруженная?», «План и факт», «Просроченные заказы». ${stats.summary}`;
    return stats;
  }

  // Просроченные заказы (приоритет — частый запрос)
  if (
    q.includes('просрочен') || q.includes('просрочено') || q.includes('просрочка') ||
    (q.includes('заказ') && (q.includes('просроч') || q.includes('дедлайн') || q.includes('опоздан')))
  ) {
    return overdueOrders(user);
  }

  // Сегодня — сколько изделий / выполнено
  if (
    (q.includes('сегодня') || q.includes('за день') || q.includes('за этот день')) &&
    (q.includes('издели') || q.includes('сделали') || q.includes('выполнен') || q.includes('работ') || q.includes('производств') || q.includes('сколько') || q.includes('выполнено') || q.includes('сшито'))
  ) {
    return completedToday(user);
  }

  // Сегодня по этажам
  if (
    (q.includes('этаж') || q.includes('этажам') || q.includes('по этажам')) &&
    (q.includes('сегодня') || q.includes('за день') || q.includes('работ') || q.includes('выполнен'))
  ) {
    return completedTodayByFloor(user);
  }

  // График производства за месяц
  if (
    (q.includes('график') || q.includes('диаграмм') || q.includes('динамик')) &&
    (q.includes('месяц') || q.includes('производств') || q.includes('за месяц'))
  ) {
    return productionChartMonth(user);
  }

  // Самая загруженная швея
  if (
    (q.includes('швея') || q.includes('швей')) &&
    (q.includes('загружен') || q.includes('загруженн') || q.includes('больше') || q.includes('топ') || q.includes('работал') || q.includes('активн') || q.includes('больше всего'))
  ) {
    return busiestSewerToday(user);
  }

  // План vs факт
  if (
    (q.includes('план') && q.includes('факт')) ||
    q.includes('сравни план') || q.includes('план факт') || q.includes('план и факт') ||
    q.includes('выполнение плана')
  ) {
    return planVsFactMonth(user);
  }

  // За месяц — изделия / производство (без графика)
  if (
    (q.includes('месяц') || q.includes('за месяц') || q.includes('в этом месяце')) &&
    (q.includes('издели') || q.includes('выполнен') || q.includes('сделали') || q.includes('производств') || q.includes('сколько') || q.includes('сшито'))
  ) {
    return completedThisMonth(user);
  }

  // Общие запросы — заказы, статистика, сводка
  if (
    q.includes('заказ') || q.includes('статистик') || q.includes('сводк') ||
    q.includes('сколько заказ') || q.includes('общая') || q.includes('status') ||
    q.includes('итог') || q.includes('отчёт') || q.includes('отчет') ||
    q.includes('количество') || q.includes('дай') || q.includes('покажи') || q.includes('выведи') ||
    q.length < 10
  ) {
    return generalStats(user);
  }

  // По умолчанию — пробуем подходящие варианты по ключевым словам
  if (q.includes('сегодня')) return completedToday(user);
  if (q.includes('этаж')) return completedTodayByFloor(user);
  if (q.includes('месяц') && (q.includes('график') || q.includes('динамик'))) return productionChartMonth(user);
  if (q.includes('швея') || q.includes('швей')) return busiestSewerToday(user);
  if (q.includes('месяц')) return completedThisMonth(user);

  // Неизвестный запрос — отвечаем общей сводкой и подсказкой
  const stats = await generalStats(user);
  stats.summary = `По запросу «${query}» не найдено данных. Показываю общую сводку. Попробуйте: «Сколько сделали сегодня?», «График за месяц», «Просроченные заказы». ${stats.summary}`;
  return stats;
}

module.exports = { processQuery };
