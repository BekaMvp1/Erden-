/**
 * Синхронизация заказов в облачную БД (Supabase)
 */

const { Sequelize } = require('sequelize');
const { cloudSequelize } = require('../config/cloudDatabase');
const db = require('../models');

let CloudOrder = null;

function logCloudConnected() {
  if (!logCloudConnected.done) {
    logCloudConnected.done = true;
    console.log('Cloud DB connected');
  }
}

function getCloudOrder() {
  if (!cloudSequelize) return null;
  if (!CloudOrder) {
    CloudOrder = require('../models/Order')(cloudSequelize, Sequelize.DataTypes);
  }
  return CloudOrder;
}

function mapOrderToSnakeCase(order) {
  const o = order && typeof order.toJSON === 'function' ? order.toJSON() : order;
  return {
    id: o.id,
    client_id: o.client_id,
    title: o.title,
    quantity: o.quantity,
    total_quantity: o.total_quantity != null ? o.total_quantity : o.quantity,
    deadline: o.deadline,
    status_id: o.status_id,
    floor_id: o.floor_id,
    building_floor_id: o.building_floor_id,
    technologist_id: o.technologist_id,
    workshop_id: o.workshop_id,
    completed_at: o.completed_at,
    planned_month: o.planned_month,
    color: o.color,
    size_in_numbers: o.size_in_numbers,
    size_in_letters: o.size_in_letters,
    comment: o.comment,
    photos: o.photos,
    created_at: o.created_at ?? o.createdAt,
    updated_at: o.updated_at ?? o.updatedAt,
  };
}

/**
 * Отправка заказа в облако (upsert)
 */
async function syncOrderToCloud(orderPayload) {
  const CloudOrderModel = getCloudOrder();
  if (!CloudOrderModel) return { ok: false, error: 'Cloud DB not configured' };

  const mapped = mapOrderToSnakeCase(orderPayload);
  await CloudOrderModel.upsert(mapped);
  logCloudConnected();
  return { ok: true };
}

/**
 * Попытка синхронизировать заказ: при успехе — true, при ошибке — false
 */
async function trySyncOrderToCloud(orderPayload) {
  try {
    const result = await syncOrderToCloud(orderPayload);
    return result.ok;
  } catch (err) {
    return false;
  }
}

/**
 * Добавить заказ в очередь при неудачной синхронизации
 */
async function queueOrderForSync(order, lastError) {
  const payload = mapOrderToSnakeCase(order);
  await db.SyncQueue.create({
    entity_type: 'order',
    entity_id: order.id,
    payload,
    status: 'pending',
    attempts: 0,
    last_error: lastError || null,
  });
}

/**
 * Обработка одного элемента очереди
 */
async function processQueueItem(item) {
  if (item.entity_type !== 'order') return false;

  try {
    await syncOrderToCloud(item.payload);
    await item.update({ status: 'done' });
    console.log('Synced order #' + item.entity_id);
    return true;
  } catch (err) {
    await item.update({
      attempts: item.attempts + 1,
      last_error: err.message || String(err),
    });
    console.error('Sync failed for order #' + item.entity_id + ':', err.message);
    return false;
  }
}

/**
 * Запуск воркера: каждые SYNC_INTERVAL_MS обрабатывает пачку pending
 */
function startSyncWorker() {
  const intervalMs = parseInt(process.env.SYNC_INTERVAL_MS, 10) || 30000;
  const batchSize = 20;

  console.log('Cloud sync worker started');

  let cloudConnected = false;
  const tick = async () => {
    if (!cloudConnected && cloudSequelize) {
      try {
        await cloudSequelize.authenticate();
        logCloudConnected();
        cloudConnected = true;
      } catch (e) {
        console.error('Cloud DB connection failed:', e.message);
        return;
      }
    }
    try {
      const items = await db.SyncQueue.findAll({
        where: { status: 'pending' },
        limit: batchSize,
        order: [['id', 'ASC']],
      });
      for (const item of items) {
        await processQueueItem(item);
      }
    } catch (err) {
      console.error('Sync worker error:', err.message);
    }
  };

  setInterval(tick, intervalMs);
  tick();
}

module.exports = {
  syncOrderToCloud,
  trySyncOrderToCloud,
  queueOrderForSync,
  startSyncWorker,
};
