/**
 * Страница закупа
 * Список закупов — при клике открывается модальное окно с деталями
 * Модалка рендерится через Portal в body, чтобы не обрезалась overflow родителя
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import PrintButton from '../components/PrintButton';

const UNITS = ['РУЛОН', 'КГ', 'ТОННА'];
const STATUSES = ['Ожидает закуп', 'Закуплено', 'Частично', 'Отменено'];

function ProcurementModal({ procurement, onClose, onUpdated }) {
  const navigate = useNavigate();
  const [data, setData] = useState(procurement);
  const [saving, setSaving] = useState(null);
  const [newRow, setNewRow] = useState({
    unit: 'РУЛОН',
    quantity: '',
    price: '',
    supplier: '',
    comment: '',
  });

  useEffect(() => {
    setData(procurement);
  }, [procurement]);

  const totalSum = (data?.ProcurementItems || []).reduce(
    (acc, i) => acc + (parseFloat(i.total) || 0),
    0
  );
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const canEdit = ['admin', 'manager'].includes(user.role);

  const handleStatusChange = async (status) => {
    if (!data || !canEdit) return;
    setSaving('status');
    try {
      await api.procurement.updateStatus(data.id, status);
      setData((p) => ({ ...p, status }));
      onUpdated?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(null);
    }
  };

  const handleAddRow = async (e) => {
    e.preventDefault();
    if (!data) return;
    const modelName = data.Order?.title || '';
    const { unit, quantity, price, supplier, comment } = newRow;
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      alert('Количество должно быть больше 0');
      return;
    }
    const pr = parseFloat(price) || 0;
    setSaving('add');
    try {
      const item = await api.procurement.addItem(data.id, {
        name: modelName,
        unit,
        quantity: qty,
        price: pr,
        supplier: supplier?.trim() || undefined,
        comment: comment?.trim() || undefined,
      });
      setData((p) => ({
        ...p,
        ProcurementItems: [...(p.ProcurementItems || []), item],
      }));
      setNewRow({ unit: 'РУЛОН', quantity: '', price: '', supplier: '', comment: '' });
      onUpdated?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(null);
    }
  };

  const handleUpdateItem = async (item, field, value) => {
    if (!canEdit) return;
    const updates = { ...item, [field]: value };
    if (field === 'quantity' || field === 'price') {
      const qty = parseFloat(updates.quantity) || 0;
      const pr = parseFloat(updates.price) || 0;
      updates.total = Math.round(qty * pr * 100) / 100;
    }
    setSaving(item.id);
    try {
      const updated = await api.procurement.updateItem(item.id, {
        name: updates.name,
        unit: updates.unit,
        quantity: parseFloat(updates.quantity) || 0,
        price: parseFloat(updates.price) || 0,
        supplier: updates.supplier,
        comment: updates.comment,
      });
      setData((p) => ({
        ...p,
        ProcurementItems: (p.ProcurementItems || []).map((i) => (i.id === item.id ? updated : i)),
      }));
      onUpdated?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(null);
    }
  };

  const handleDeleteItem = async (item) => {
    if (!canEdit) return;
    if (!confirm('Удалить позицию?')) return;
    setSaving(item.id);
    try {
      await api.procurement.deleteItem(item.id);
      setData((p) => ({
        ...p,
        ProcurementItems: (p.ProcurementItems || []).filter((i) => i.id !== item.id),
      }));
      onUpdated?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(null);
    }
  };

  if (!data) return null;

  const variants = data.Order?.OrderVariants || [];
  const byColor = variants.reduce((acc, v) => {
    acc[v.color] = (acc[v.color] || 0) + (v.quantity || 0);
    return acc;
  }, {});
  const colorList = Object.entries(byColor)
    .map(([c, q]) => `${c}: ${q}`)
    .join(', ');

  const printTitle = `Закуп по заказу №${data.order_id} — ${data.Order?.Client?.name || '—'} — ${data.Order?.title || '—'} — ${colorList || '—'}`;

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-accent-3 dark:bg-dark-900 rounded-xl border border-white/25 p-4 sm:p-6 max-w-4xl w-full max-h-[calc(100vh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="no-print flex justify-between items-start gap-2 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-xl font-semibold text-[#ECECEC] dark:text-dark-text truncate">
            Закуп #{data.order_id} — {data.Order?.title}
          </h2>
          <div className="flex items-center gap-2">
            <PrintButton />
            <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-accent-2/50 dark:hover:bg-dark-800 text-[#ECECEC] dark:text-dark-text"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
          </div>
        </div>

        <div className="print-area">
          <h1 className="print-title print-only">{printTitle}</h1>
        {/* Информация о заказе */}
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 rounded-xl bg-accent-2/30 dark:bg-dark-800 border border-white/15">
          <div className="flex flex-wrap gap-2 sm:gap-4 items-center text-sm sm:text-base">
            <div><span className="text-[#ECECEC]/70 text-sm">Клиент:</span> {data.Order?.Client?.name}</div>
            <div><span className="text-[#ECECEC]/70 text-sm">Модель:</span> {data.Order?.title}</div>
            <div><span className="text-[#ECECEC]/70 text-sm">Кол-во:</span> {data.Order?.total_quantity ?? data.Order?.quantity}</div>
            {colorList && <div><span className="text-[#ECECEC]/70 text-sm">Цвета:</span> {colorList}</div>}
            <div><span className="text-[#ECECEC]/70 text-sm">Дедлайн:</span> {data.Order?.deadline}</div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[#ECECEC]/70 text-sm">Статус:</span>
              <select
                value={data.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={!canEdit || saving === 'status'}
                className="px-3 py-1.5 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm"
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-2 text-lg font-semibold text-primary-400">Итого: {totalSum.toFixed(2)} ₽</div>
        </div>

        {/* Добавить закуп */}
        {canEdit && (
          <div className="no-print mb-6">
            <h3 className="text-sm font-medium text-[#ECECEC] dark:text-dark-text mb-3">Добавить позицию</h3>
            <form onSubmit={handleAddRow} className="flex flex-wrap gap-2 items-end text-sm">
              <select
                value={newRow.unit}
                onChange={(e) => setNewRow({ ...newRow, unit: e.target.value })}
                className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text"
              >
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <input type="number" step="0.001" value={newRow.quantity} onChange={(e) => setNewRow({ ...newRow, quantity: e.target.value })} placeholder="Кол-во" className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text w-24" />
              <input type="number" step="0.01" value={newRow.price} onChange={(e) => setNewRow({ ...newRow, price: e.target.value })} placeholder="Цена" className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text w-24" />
              <input type="text" value={newRow.supplier} onChange={(e) => setNewRow({ ...newRow, supplier: e.target.value })} placeholder="Поставщик" className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[120px]" />
              <input type="text" value={newRow.comment} onChange={(e) => setNewRow({ ...newRow, comment: e.target.value })} placeholder="Комментарий" className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[120px]" />
              <button type="submit" disabled={saving === 'add'} className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
                {saving === 'add' ? '...' : 'Добавить'}
              </button>
            </form>
          </div>
        )}

        {/* Таблица позиций */}
        <div className="overflow-x-auto rounded-xl border border-white/25 mb-4 -mx-1">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="bg-accent-3/80 dark:bg-dark-900 border-b border-white/25">
                <th className="text-left px-4 py-3 font-medium">Ед.изм</th>
                <th className="text-left px-4 py-3 font-medium">Количество</th>
                <th className="text-left px-4 py-3 font-medium">Цена</th>
                <th className="text-left px-4 py-3 font-medium">Сумма</th>
                <th className="text-left px-4 py-3 font-medium">Поставщик</th>
                <th className="text-left px-4 py-3 font-medium">Комментарий</th>
                {canEdit && <th className="text-left px-4 py-3 font-medium">Действия</th>}
              </tr>
            </thead>
            <tbody>
              {(data.ProcurementItems || []).map((item) => (
                <tr key={item.id} className="border-b border-white/15">
                  <td className="px-4 py-2">
                    {canEdit ? (
                      <select value={item.unit} onChange={(e) => handleUpdateItem(item, 'unit', e.target.value)} className="px-2 py-1 rounded bg-accent-2/50 dark:bg-dark-800 border border-transparent text-[#ECECEC] dark:text-dark-text w-full">
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    ) : item.unit}
                  </td>
                  <td className="px-4 py-2">
                    {canEdit ? (
                      <input type="number" step="0.001" value={item.quantity} onChange={(e) => handleUpdateItem(item, 'quantity', e.target.value)} className="w-20 px-2 py-1 rounded bg-accent-2/50 dark:bg-dark-800 border border-transparent text-[#ECECEC] dark:text-dark-text" />
                    ) : item.quantity}
                  </td>
                  <td className="px-4 py-2">
                    {canEdit ? (
                      <input type="number" step="0.01" value={item.price} onChange={(e) => handleUpdateItem(item, 'price', e.target.value)} className="w-20 px-2 py-1 rounded bg-accent-2/50 dark:bg-dark-800 border border-transparent text-[#ECECEC] dark:text-dark-text" />
                    ) : item.price}
                  </td>
                  <td className="px-4 py-2 font-medium">{(parseFloat(item.total) || 0).toFixed(2)}</td>
                  <td className="px-4 py-2">{item.supplier || '—'}</td>
                  <td className="px-4 py-2">{item.comment || '—'}</td>
                  {canEdit && (
                    <td className="px-4 py-2">
                      <button onClick={() => handleDeleteItem(item)} disabled={saving === item.id} className="text-red-500 hover:text-red-400 text-sm">Удалить</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="no-print flex justify-end gap-2">
          <button onClick={() => navigate(`/orders/${data.order_id}`)} className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/40">
            К заказу
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700">
            Закрыть
          </button>
        </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default function Procurement() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = searchParams.get('order_id');

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalProcurement, setModalProcurement] = useState(null);
  const [detailProcurement, setDetailProcurement] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.procurement
      .list()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  // Если в URL order_id — открыть модалку для этого заказа
  useEffect(() => {
    if (!orderId || modalProcurement) return;
    const pr = list.find((p) => String(p.order_id) === orderId);
    if (pr) {
      setModalProcurement(pr);
      setDetailProcurement(pr);
      navigate('/procurement', { replace: true });
    } else if (list.length > 0) {
      api.procurement.get(orderId).then((p) => {
        setModalProcurement(p);
        setDetailProcurement(p);
        navigate('/procurement', { replace: true });
      }).catch(() => {});
    }
  }, [orderId, list, modalProcurement, navigate]);

  const handleOpenModal = (pr) => {
    setModalProcurement(pr);
    setDetailProcurement(pr);
    if (orderId) navigate('/procurement', { replace: true });
  };

  const handleCloseModal = () => {
    setModalProcurement(null);
    setDetailProcurement(null);
  };

  const handleModalUpdated = () => {
    api.procurement.get(modalProcurement.order_id).then((p) => {
      setDetailProcurement(p);
      setList((prev) => prev.map((pr) => (pr.order_id === p.order_id ? p : pr)));
    });
  };

  const getTotal = (pr) => (pr?.ProcurementItems || []).reduce((acc, i) => acc + (parseFloat(i.total) || 0), 0);

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-[#ECECEC] dark:text-dark-text">Закуп</h1>
        {!loading && list.length > 0 && <PrintButton />}
      </div>

      {loading ? (
        <div className="p-8 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
      ) : list.length === 0 ? (
        <p className="text-[#ECECEC]/80 dark:text-dark-text/80">Нет закупов</p>
      ) : (
        <div className="print-area rounded-xl border border-white/25 dark:border-white/25 overflow-hidden overflow-x-auto">
          <h1 className="print-title print-only">Список закупов</h1>
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="bg-accent-3/80 dark:bg-dark-900 border-b border-white/25">
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Заказ</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Клиент</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Модель</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Статус</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Итого</th>
              </tr>
            </thead>
            <tbody>
              {list.map((pr) => (
                <tr
                  key={pr.id}
                  onClick={() => handleOpenModal(pr)}
                  className="border-b border-white/15 hover:bg-accent-2/30 dark:hover:bg-dark-800 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="text-primary-400 font-medium">#{pr.order_id}</span>
                  </td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{pr.Order?.Client?.name || '—'}</td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{pr.Order?.title || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      pr.status === 'Закуплено' ? 'bg-green-500/20 text-green-400' :
                      pr.status === 'Ожидает закуп' ? 'bg-amber-500/20 text-amber-400' :
                      pr.status === 'Частично' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {pr.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-primary-400">{getTotal(pr).toFixed(2)} ₽</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalProcurement && (
        <ProcurementModal
          procurement={detailProcurement || modalProcurement}
          onClose={handleCloseModal}
          onUpdated={handleModalUpdated}
        />
      )}
    </div>
  );
}
