/**
 * Rule-based помощник (MVP)
 * Маршрутизация по ключевым словам + извлечение фильтров через regex
 */

const analyticsService = require('../analytics/analytics.service');

function normalizeQuestion(q) {
  if (!q || typeof q !== 'string') return '';
  return q.toLowerCase().trim();
}

/**
 * Извлечение фильтров из вопроса
 */
function parseFilters(question) {
  const q = normalizeQuestion(question);
  const filters = {};

  // "за N дней" / "за 3 дня" / "за 7 дней"
  const daysMatch = q.match(/за\s+(\d+)\s*(дн|день|дня|дней)/);
  if (daysMatch) {
    filters.days = parseInt(daysMatch[1], 10);
  }

  // "этап sew" / "по этапу крой" / "отк" / "швейка"
  const stepAliases = {
    крой: 'cut',
    раскрой: 'cut',
    cut: 'cut',
    швейка: 'sew',
    sew: 'sew',
    петля: 'buttonhole',
    buttonhole: 'buttonhole',
    пуговица: 'button',
    button: 'button',
    метка: 'label',
    label: 'label',
    отк: 'qc',
    qc: 'qc',
    упаковка: 'pack',
    pack: 'pack',
  };
  const stepPhraseMatch = q.match(/(?:этап[уа]?|по этапу)\s*(\w+)/);
  if (stepPhraseMatch && stepAliases[stepPhraseMatch[1]]) {
    filters.step = stepAliases[stepPhraseMatch[1]];
  } else {
    for (const [alias, code] of Object.entries(stepAliases)) {
      if (alias.length >= 3 && q.includes(alias)) {
        filters.step = code;
        break;
      }
    }
  }

  // "заказ 5" / "заказа 5" / "order 5"
  const orderMatch = q.match(/(?:заказ|заказа|order)\s*#?\s*(\d+)/);
  if (orderMatch) {
    filters.order_id = parseInt(orderMatch[1], 10);
  }

  // "клиент X" / "клиента X"
  const clientMatch = q.match(/клиент[а]?\s+["']?([^"'\s]+(?: [^"'\s]+)*)["']?/);
  if (clientMatch) {
    filters.client = clientMatch[1].trim();
  }

  return filters;
}

/**
 * Определяет тип запроса по ключевым словам
 */
function detectQueryType(question) {
  const q = normalizeQuestion(question);
  if (/просроч|overdue|просрочен/.test(q)) return 'overdue';
  if (/узк|очередь|bottleneck|узкое место/.test(q)) return 'bottlenecks';
  if (/оператор|worker|работник|производительность|швея/.test(q)) return 'workers';
  if (/таймлайн|история|историю заказа/.test(q)) return 'timeline';
  return null;
}

/**
 * Обработка запроса
 */
async function handleQuery(question) {
  const type = detectQueryType(question);
  const filters = parseFilters(question);
  const filtersUsed = { ...filters };

  if (type === 'overdue') {
    const data = await analyticsService.getOverdue({
      client: filters.client,
      days: filters.days || 0,
      status: filters.status,
    });
    const count = data.length;
    return {
      type: 'overdue',
      filters_used: filtersUsed,
      data,
      summary:
        count === 0
          ? 'Нет просроченных заказов'
          : `${count} просроченных заказ${count === 1 ? '' : count < 5 ? 'а' : 'ов'}`,
    };
  }

  if (type === 'bottlenecks') {
    const data = await analyticsService.getBottlenecks({
      days: filters.days,
      step: filters.step,
    });
    const top = data[0];
    const summary = top
      ? `Узкое место: ${top.step_name} (ожидает: ${top.pending}, в работе: ${top.in_progress})`
      : 'Нет данных по узким местам';
    return {
      type: 'bottlenecks',
      filters_used: filtersUsed,
      data,
      summary,
    };
  }

  if (type === 'workers') {
    const data = await analyticsService.getWorkers({
      days: filters.days ?? 7,
      step: filters.step,
    });
    const summary =
      data.length > 0
        ? `${data.length} операторов, лидер: ${data[0].user_name} (${data[0].total_qty} ед.)`
        : 'Нет данных по производительности';
    return {
      type: 'workers',
      filters_used: filtersUsed,
      data,
      summary,
    };
  }

  if (type === 'timeline' && filters.order_id) {
    const data = await analyticsService.getOrderTimeline(filters.order_id);
    return {
      type: 'timeline',
      filters_used: filtersUsed,
      data,
      summary: `Таймлайн заказа #${filters.order_id}: ${data.length} событий`,
    };
  }

  if (type === 'timeline' && !filters.order_id) {
    return {
      type: 'timeline',
      filters_used: filtersUsed,
      data: [],
      summary: 'Укажите номер заказа, например: "Таймлайн заказа 5"',
    };
  }

  return {
    type: 'unknown',
    filters_used: {},
    data: [],
    summary:
      'Задайте вопрос о просроченных заказах, узких местах, производительности операторов или таймлайне заказа.',
  };
}

module.exports = { handleQuery };
