/**
 * Dashboard — таблица заказов
 * Заголовок по центру, фильтр статусов, поиск по клиенту и названию (debounce 300ms)
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

const STATUS_COLORS = {
  Принят: 'bg-yellow-500/20 text-yellow-400',
  'В работе': 'bg-blue-500/20 text-blue-400',
  Готов: 'bg-green-500/20 text-green-400',
  Просрочен: 'bg-red-500/20 text-red-400',
};

export default function Dashboard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statuses, setStatuses] = useState([]);

  useEffect(() => {
    loadStatuses();
  }, []);

  useEffect(() => {
    loadOrders();
  }, [statusFilter, searchTerm]);

  // Debounce поиска 300ms
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadStatuses = async () => {
    try {
      const data = await api.references.orderStatus();
      setStatuses(data);
    } catch {}
  };

  const loadOrders = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status_id = statusFilter;
      if (searchTerm) params.search = searchTerm;
      const data = await api.orders.list(params);
      setOrders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setSearchTerm('');
  }, []);

  const handleDelete = async (e, orderId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Удалить заказ #' + orderId + '? Данные будут удалены безвозвратно.')) return;
    setDeletingId(orderId);
    try {
      await api.orders.delete(orderId);
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (err) {
      alert(err.message || 'Ошибка удаления');
    } finally {
      setDeletingId(null);
    }
  };

  const canDelete = user?.role === 'admin' || user?.role === 'manager';
  const canEdit = !!user;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-[#ECECEC] dark:text-dark-text">Заказ</h1>
        <div className="flex-1 flex justify-center items-center gap-2 max-w-md w-full sm:w-auto sm:mx-auto">
          <input
            type="text"
            placeholder="Просто поиск"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-accent-1/20 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
          />
          {searchInput && (
          <button
            type="button"
            onClick={clearSearch}
            className="p-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/40 dark:hover:bg-dark-3"
            title="Очистить"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          )}
        </div>
        {statuses.length > 0 && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-accent-1/20 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text shrink-0"
          >
            <option value="">Все статусы</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 dark:border-white/25 overflow-hidden transition-block hover:shadow-xl">
        {loading ? (
          <div className="p-6 md:p-8 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
        ) : orders.length === 0 ? (
          <div className="p-6 md:p-8 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Нет заказов</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-white/20 dark:border-white/20">
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">ID</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Название</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Клиент</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Кол-во</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Дедлайн</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Статус</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Цех пошива</th>
                {(canEdit || canDelete) && <th className="w-24 px-4 py-3 text-[#ECECEC] dark:text-dark-text/90">Действия</th>}
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-white/15 dark:border-white/15 hover:bg-accent-1/20 dark:hover:bg-dark-2/50 transition-colors duration-300 ease-out"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/orders/${order.id}`}
                      className="text-primary-400 hover:underline"
                    >
                      #{order.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[#ECECEC] dark:text-dark-text">{order.title}</td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{order.Client?.name}</td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{order.quantity}</td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 whitespace-nowrap">{order.deadline}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        STATUS_COLORS[order.OrderStatus?.name] || 'bg-accent-1/30 text-[#ECECEC]/90'
                      }`}
                    >
                      {order.OrderStatus?.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{order.Floor?.name || '—'}</td>
                  {(canEdit || canDelete) && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <Link
                            to={`/orders/${order.id}`}
                            className="p-1.5 rounded text-primary-400 hover:bg-accent-1/30"
                            title="Редактировать"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </Link>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, order.id)}
                            disabled={deletingId === order.id}
                            className="p-1.5 rounded text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                            title="Удалить"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
