/**
 * Страница ОТК (контроль качества) — вариант 2: проверка КАЖДОЙ партии пошива отдельно.
 * Показываются только партии со статусом DONE, по которым ещё не проведён ОТК.
 * После сохранения ОТК партия автоматически поступает на склад по размерам.
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import PrintButton from '../components/PrintButton';
import { NeonButton, NeonCard, NeonInput } from '../components/ui';

export default function Qc() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalBatch, setModalBatch] = useState(null);
  const [formItems, setFormItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createOrderId, setCreateOrderId] = useState('');
  const [createFloorId, setCreateFloorId] = useState('');
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [floors, setFloors] = useState([]);

  const loadPending = () => {
    setLoading(true);
    api.warehouseStock
      .batchesPendingQc()
      .then(setPending)
      .catch(() => setPending([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPending();
  }, []);

  useEffect(() => {
    if (createOpen && orders.length === 0) {
      api.orders.list().then(setOrders).catch(() => setOrders([]));
    }
    if (createOpen && floors.length === 0) {
      api.references.buildingFloors().then(setFloors).catch(() => setFloors([]));
    }
  }, [createOpen, orders.length, floors.length]);

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    const order_id = parseInt(createOrderId, 10);
    const floor_id = parseInt(createFloorId, 10);
    if (Number.isNaN(order_id) || Number.isNaN(floor_id)) {
      setCreateError('Укажите заказ и этаж');
      return;
    }
    setCreateLoading(true);
    setCreateError('');
    try {
      await api.sewingPlans.finishBatch({ order_id, floor_id });
      setCreateOpen(false);
      setCreateOrderId('');
      setCreateFloorId('');
      loadPending();
    } catch (err) {
      setCreateError(err.message || 'Ошибка создания партии');
    } finally {
      setCreateLoading(false);
    }
  };

  const openModal = async (row) => {
    setError('');
    try {
      const batch = await api.warehouseStock.batchById(row.id);
      setModalBatch(batch);
      setFormItems(
        (batch.SewingBatchItems || []).map((item) => {
          const fact = Number(item.fact_qty) || 0;
          return {
            model_size_id: item.model_size_id,
            size_name: item.ModelSize?.Size?.name || `#${item.model_size_id}`,
            checked_qty: fact,
            passed_qty: fact,
            defect_qty: 0,
          };
        })
      );
    } catch (err) {
      setError(err.message || 'Не удалось загрузить партию');
    }
  };

  const handleChange = (modelSizeId, field, value) => {
    const v = parseInt(value, 10);
    const num = Number.isNaN(v) ? 0 : Math.max(0, v);
    setFormItems((prev) =>
      prev.map((it) => {
        if (it.model_size_id !== modelSizeId) return it;
        if (field === 'checked_qty') {
          const passed = Math.min(it.passed_qty, num);
          return { ...it, checked_qty: num, passed_qty: passed, defect_qty: num - passed };
        }
        if (field === 'passed_qty') {
          const passed = Math.min(num, it.checked_qty);
          return { ...it, passed_qty: passed, defect_qty: it.checked_qty - passed };
        }
        return it;
      })
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!modalBatch) return;
    setSaving(true);
    setError('');
    try {
      await api.warehouseStock.postQcBatch({
        batch_id: modalBatch.id,
        items: formItems.map((it) => ({
          model_size_id: it.model_size_id,
          checked_qty: it.checked_qty,
          passed_qty: it.passed_qty,
        })),
      });
      setModalBatch(null);
      loadPending();
    } catch (err) {
      setError(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const orderLabel = (row) => {
    const tz = row.tz_code ? `${row.tz_code} — ` : '';
    return `${tz}${row.model_name || row.order_title || `#${row.order_id}`}`;
  };

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-neon-text">ОТК (контроль качества)</h1>
        <PrintButton />
      </div>
      <p className="text-sm text-neon-muted mb-4">
        Партии пошива, готовые к проверке (статус «Завершён», факт введён). Проверьте каждую партию по размерам — после сохранения принятая продукция поступит на склад.
      </p>

      <div className="no-print mb-6">
        <button
          type="button"
          onClick={() => setCreateOpen(!createOpen)}
          className="flex items-center gap-2 px-4 py-2 rounded-card bg-neon-surface border border-neon-border hover:shadow-neon transition-colors text-neon-text"
        >
          <span className={createOpen ? 'rotate-90' : ''}>▶</span>
          Создать партию из пошива
        </button>
        {createOpen && (
          <div className="mt-2 p-4 rounded-card bg-neon-surface border border-neon-border">
            <p className="text-sm text-neon-muted mb-3">
              Агрегировать факт пошива по заказу и этажу и создать партию (статус DONE). Партия появится в списке выше для проведения ОТК.
            </p>
            <form onSubmit={handleCreateBatch} className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-sm text-neon-muted mb-1">Заказ</label>
                <select
                  value={createOrderId}
                  onChange={(e) => setCreateOrderId(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-neon-text"
                >
                  <option value="">—</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>#{o.id} {o.title} {o.model_name || ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-neon-muted mb-1">Этаж</label>
                <select
                  value={createFloorId}
                  onChange={(e) => setCreateFloorId(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-neon-text"
                >
                  <option value="">—</option>
                  {floors.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <NeonButton type="submit" disabled={createLoading}>
                {createLoading ? 'Создание...' : 'Создать партию'}
              </NeonButton>
              {createError && <p className="text-sm text-red-400 w-full">{createError}</p>}
            </form>
          </div>
        )}
      </div>

      <NeonCard className="rounded-card overflow-hidden p-0">
        {loading ? (
          <div className="p-8 text-center text-neon-muted">Загрузка...</div>
        ) : pending.length === 0 ? (
          <div className="p-8 text-neon-muted">Нет партий, ожидающих ОТК</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-accent-3/80 border-b border-white/25">
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text">Партия</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text">Заказ (TZ — модель)</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text">Этаж</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text">Дата завершения</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-neon-text">Всего (факт)</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text">Действие</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <tr key={row.id} className="border-b border-white/15">
                    <td className="px-4 py-3 font-medium text-neon-text">{row.batch_code}</td>
                    <td className="px-4 py-3 text-neon-text">{orderLabel(row)}</td>
                    <td className="px-4 py-3 text-neon-text">{row.floor_name}</td>
                    <td className="px-4 py-3 text-neon-text">
                      {row.finished_at ? new Date(row.finished_at).toLocaleDateString('ru-RU') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{row.total_fact}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openModal(row)}
                        className="text-primary-400 hover:underline text-sm"
                      >
                        Проверить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </NeonCard>

      {modalBatch &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto"
            onClick={() => !saving && setModalBatch(null)}
          >
            <div
              className="bg-neon-bg2 border border-neon-border rounded-card p-6 max-w-2xl w-full shadow-xl my-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-neon-text mb-1">
                ОТК — партия {modalBatch.batch_code}
              </h3>
              <p className="text-sm text-neon-muted mb-4">
                {modalBatch.Order?.title} {modalBatch.Order?.model_name && ` · ${modalBatch.Order.model_name}`}
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/20">
                        <th className="text-left py-2 text-neon-muted">Размер</th>
                        <th className="text-right py-2 text-neon-muted">Проверено</th>
                        <th className="text-right py-2 text-neon-muted">Принято</th>
                        <th className="text-right py-2 text-neon-muted">Брак</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formItems.map((it) => (
                        <tr key={it.model_size_id} className="border-b border-white/10">
                          <td className="py-2 text-neon-text">{it.size_name}</td>
                          <td className="py-2 text-right">
                            <NeonInput
                              type="number"
                              min={0}
                              className="w-20 text-right inline-block"
                              value={it.checked_qty}
                              onChange={(e) => handleChange(it.model_size_id, 'checked_qty', e.target.value)}
                            />
                          </td>
                          <td className="py-2 text-right">
                            <NeonInput
                              type="number"
                              min={0}
                              max={it.checked_qty}
                              className="w-20 text-right inline-block"
                              value={it.passed_qty}
                              onChange={(e) => handleChange(it.model_size_id, 'passed_qty', e.target.value)}
                            />
                          </td>
                          <td className="py-2 text-right text-neon-muted">{it.defect_qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <div className="flex gap-2">
                  <NeonButton type="submit" disabled={saving}>
                    {saving ? 'Сохранение...' : 'Сохранить (принятое поступит на склад)'}
                  </NeonButton>
                  <NeonButton type="button" variant="secondary" onClick={() => setModalBatch(null)} disabled={saving}>
                    Отмена
                  </NeonButton>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
