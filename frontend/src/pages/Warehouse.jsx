/**
 * Страница склада
 * MVP: таблица остатков, приход/расход, привязка расхода к заказу
 */

import { useState, useEffect } from 'react';
import { api } from '../api';
import PrintButton from '../components/PrintButton';

const UNITS = ['РУЛОН', 'КГ', 'ТОННА', 'ШТ'];

export default function Warehouse() {
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showMovement, setShowMovement] = useState(null);
  const [newItem, setNewItem] = useState({ name: '', unit: 'РУЛОН' });
  const [movement, setMovement] = useState({
    type: 'ПРИХОД',
    quantity: '',
    order_id: '',
    comment: '',
  });

  useEffect(() => {
    loadItems();
    api.orders.list({ limit: 200 }).then(setOrders).catch(() => setOrders([]));
  }, []);

  const loadItems = () => {
    setLoading(true);
    api.warehouse
      .items()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItem.name?.trim()) {
      alert('Укажите наименование');
      return;
    }
    try {
      await api.warehouse.addItem({
        name: newItem.name.trim(),
        unit: newItem.unit,
      });
      setNewItem({ name: '', unit: 'РУЛОН' });
      setShowAddItem(false);
      loadItems();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddMovement = async (e) => {
    e.preventDefault();
    const itemId = showMovement?.id;
    if (!itemId) return;
    const qty = parseFloat(movement.quantity);
    if (isNaN(qty) || qty <= 0) {
      alert('Количество должно быть больше 0');
      return;
    }
    try {
      await api.warehouse.addMovement({
        item_id: itemId,
        type: movement.type,
        quantity: qty,
        order_id: movement.order_id ? parseInt(movement.order_id, 10) : undefined,
        comment: movement.comment?.trim() || undefined,
      });
      setShowMovement(null);
      setMovement({ type: 'ПРИХОД', quantity: '', order_id: '', comment: '' });
      loadItems();
    } catch (err) {
      alert(err.message);
    }
  };

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const canEdit = ['admin', 'manager'].includes(user.role);

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[#ECECEC] dark:text-dark-text">Склад</h1>
        {items.length > 0 && <PrintButton />}
      </div>

      {canEdit && (
        <div className="no-print mb-4">
          <button
            onClick={() => setShowAddItem(!showAddItem)}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
          >
            {showAddItem ? 'Отмена' : 'Добавить позицию'}
          </button>
        </div>
      )}

      {showAddItem && canEdit && (
        <form onSubmit={handleAddItem} className="no-print mb-6 p-4 rounded-xl bg-accent-3/80 dark:bg-dark-900 border border-white/25 dark:border-white/25 flex gap-4 items-end">
          <div>
            <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-1">Наименование</label>
            <input
              type="text"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              placeholder="Ткань, фурнитура..."
              className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[200px]"
            />
          </div>
          <div>
            <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-1">Ед.изм</label>
            <select
              value={newItem.unit}
              onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
              className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700">
            Добавить
          </button>
        </form>
      )}

      {/* Таблица остатков */}
      <div className="print-area rounded-xl border border-white/25 dark:border-white/25 overflow-hidden">
        <h1 className="print-title print-only">Склад — остатки</h1>
        {loading ? (
          <div className="p-8 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-[#ECECEC]/80 dark:text-dark-text/80">Нет позиций на складе</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-accent-3/80 dark:bg-dark-900 border-b border-white/25 dark:border-white/25">
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Наименование</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Ед.изм</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Остаток</th>
                {canEdit && (
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Действия</th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-white/15 dark:border-white/15">
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{item.name}</td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{item.unit}</td>
                  <td className="px-4 py-3 font-medium">{parseFloat(item.stock_quantity || 0).toFixed(3)}</td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setShowMovement(item)}
                        className="text-primary-400 hover:underline text-sm"
                      >
                        Приход/Расход
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Модальное окно приход/расход */}
      {showMovement && canEdit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowMovement(null)}>
          <div
            className="bg-accent-3 dark:bg-dark-900 rounded-xl border border-white/25 dark:border-white/25 p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
              {showMovement.name} — Приход/Расход
            </h3>
            <form onSubmit={handleAddMovement} className="space-y-4">
              <div>
                <label className="block text-sm text-[#ECECEC]/80 mb-1">Тип</label>
                <select
                  value={movement.type}
                  onChange={(e) => setMovement({ ...movement, type: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                >
                  <option value="ПРИХОД">Приход</option>
                  <option value="РАСХОД">Расход</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[#ECECEC]/80 mb-1">Количество</label>
                <input
                  type="number"
                  step="0.001"
                  value={movement.quantity}
                  onChange={(e) => setMovement({ ...movement, quantity: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                  required
                />
              </div>
              {movement.type === 'РАСХОД' && (
                <div>
                  <label className="block text-sm text-[#ECECEC]/80 mb-1">Заказ (опционально)</label>
                  <select
                    value={movement.order_id}
                    onChange={(e) => setMovement({ ...movement, order_id: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                  >
                    <option value="">— Без привязки —</option>
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        #{o.id} {o.Client?.name} — {o.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm text-[#ECECEC]/80 mb-1">Комментарий</label>
                <input
                  type="text"
                  value={movement.comment}
                  onChange={(e) => setMovement({ ...movement, comment: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700">
                  Сохранить
                </button>
                <button
                  type="button"
                  onClick={() => setShowMovement(null)}
                  className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
