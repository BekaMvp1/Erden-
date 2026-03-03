/**
 * Страница склада
 * MVP: таблица остатков, приход/расход, привязка расхода к заказу
 */

import { useState, useEffect } from 'react';
import { api } from '../api';
import PrintButton from '../components/PrintButton';
import { NeonButton, NeonCard, NeonInput, NeonSelect } from '../components/ui';

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

  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  const canEdit = ['admin', 'manager'].includes(user.role);

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-neon-text">Склад</h1>
        {items.length > 0 && <PrintButton />}
      </div>

      {canEdit && (
        <div className="no-print mb-4">
          <NeonButton
            onClick={() => setShowAddItem(!showAddItem)}
          >
            {showAddItem ? 'Отмена' : 'Добавить позицию'}
          </NeonButton>
        </div>
      )}

      {showAddItem && canEdit && (
        <form onSubmit={handleAddItem} className="no-print mb-6 p-4 rounded-card card-neon flex gap-4 items-end">
          <div>
            <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-1">Наименование</label>
            <NeonInput
              type="text"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              placeholder="Ткань, фурнитура..."
              className="min-w-[200px]"
            />
          </div>
          <div>
            <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-1">Ед.изм</label>
            <NeonSelect
              value={newItem.unit}
              onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </NeonSelect>
          </div>
          <NeonButton type="submit">
            Добавить
          </NeonButton>
        </form>
      )}

      {/* Таблица остатков */}
      <NeonCard className="print-area rounded-card overflow-hidden p-0">
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
      </NeonCard>

      {/* Модальное окно приход/расход */}
      {showMovement && canEdit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowMovement(null)}>
          <div
            className="card-neon rounded-card p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
              {showMovement.name} — Приход/Расход
            </h3>
            <form onSubmit={handleAddMovement} className="space-y-4">
              <div>
                <label className="block text-sm text-[#ECECEC]/80 mb-1">Тип</label>
                <NeonSelect
                  value={movement.type}
                  onChange={(e) => setMovement({ ...movement, type: e.target.value })}
                >
                  <option value="ПРИХОД">Приход</option>
                  <option value="РАСХОД">Расход</option>
                </NeonSelect>
              </div>
              <div>
                <label className="block text-sm text-[#ECECEC]/80 mb-1">Количество</label>
                <NeonInput
                  type="number"
                  step="0.001"
                  value={movement.quantity}
                  onChange={(e) => setMovement({ ...movement, quantity: e.target.value })}
                  required
                />
              </div>
              {movement.type === 'РАСХОД' && (
                <div>
                  <label className="block text-sm text-[#ECECEC]/80 mb-1">Заказ (опционально)</label>
                  <NeonSelect
                    value={movement.order_id}
                    onChange={(e) => setMovement({ ...movement, order_id: e.target.value })}
                  >
                    <option value="">— Без привязки —</option>
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        #{o.id} {o.Client?.name} — {o.title}
                      </option>
                    ))}
                  </NeonSelect>
                </div>
              )}
              <div>
                <label className="block text-sm text-[#ECECEC]/80 mb-1">Комментарий</label>
                <NeonInput
                  type="text"
                  value={movement.comment}
                  onChange={(e) => setMovement({ ...movement, comment: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <NeonButton type="submit">
                  Сохранить
                </NeonButton>
                <NeonButton
                  type="button"
                  onClick={() => setShowMovement(null)}
                  variant="secondary"
                >
                  Отмена
                </NeonButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
