/**
 * Страница ОТК (контроль качества): проверка партий пошива.
 * Партии создаются только при завершении пошива на странице «Пошив».
 * Показываются партии со статусом DONE без проведённого ОТК; после сохранения ОТК продукция поступает на склад.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { api } from '../api';
import PrintButton from '../components/PrintButton';
import { NeonButton, NeonCard, NeonInput } from '../components/ui';

const SEWING_FLOOR_IDS = [2, 3, 4]; // этажи пошива для фильтра
const QC_FLOOR_KEY = 'qc_floor_id';
const QC_SEARCH_KEY = 'qc_search';

function getQcStored(key, fallback) {
  try {
    const v = sessionStorage.getItem(key);
    return v !== null && v !== undefined ? v : fallback;
  } catch {
    return fallback;
  }
}

export default function Qc() {
  const [searchParams] = useSearchParams();
  const batchIdParam = searchParams.get('batch_id') ? Number(searchParams.get('batch_id')) : null;
  const orderIdParam = searchParams.get('order_id') ? Number(searchParams.get('order_id')) : null;
  const floorIdParam = searchParams.get('floor_id') ? Number(searchParams.get('floor_id')) : null;

  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalBatch, setModalBatch] = useState(null);
  const [formItems, setFormItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQ, setSearchQ] = useState(() =>
    batchIdParam ? '' : getQcStored(QC_SEARCH_KEY, '')
  );
  const [filterFloorId, setFilterFloorId] = useState(() => {
    if (floorIdParam != null && SEWING_FLOOR_IDS.includes(Number(floorIdParam))) return String(floorIdParam);
    return getQcStored(QC_FLOOR_KEY, '');
  });
  const [debouncedQ, setDebouncedQ] = useState(() => getQcStored(QC_SEARCH_KEY, ''));

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  useEffect(() => {
    try {
      sessionStorage.setItem(QC_FLOOR_KEY, filterFloorId || '');
      sessionStorage.setItem(QC_SEARCH_KEY, searchQ || '');
    } catch (_) {}
  }, [filterFloorId, searchQ]);

  const loadPending = useCallback((opts = {}) => {
    setLoading(true);
    const params = {};
    if (debouncedQ) params.q = debouncedQ;
    // При переходе по batch_id не фильтровать по этажу, чтобы новая партия попала в список
    if (filterFloorId && !opts.ignoreFloorFilter) params.floor_id = filterFloorId;
    api.warehouseStock
      .batchesPendingQc(params)
      .then(setPending)
      .catch(() => setPending([]))
      .finally(() => setLoading(false));
  }, [debouncedQ, filterFloorId]);

  useEffect(() => {
    // При переходе по batch_id сразу грузим список без фильтра по этажу, чтобы новая партия попала в список
    loadPending(batchIdParam ? { ignoreFloorFilter: true } : {});
  }, [loadPending, batchIdParam]);

  // Список: дополнительный фильтр по order_id/floor_id из URL (переход с Пошива «Открыть ОТК»)
  const displayList = useMemo(() => {
    if (!pending.length) return [];
    if (orderIdParam != null && floorIdParam != null) {
      return pending.filter((row) => row.order_id === orderIdParam && row.floor_id === floorIdParam);
    }
    return pending;
  }, [pending, orderIdParam, floorIdParam]);

  // Заполнить форму из объекта партии (чтобы открыть по batch_id даже если партии ещё нет в списке)
  const setModalFromBatch = useCallback((batch) => {
    setError('');
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
  }, []);

  const openModal = useCallback(async (row) => {
    setError('');
    if (row.noBatch) {
      setError('Партия создаётся только при завершении пошива на странице «Пошив». Завершите пошив по заказу и этажу.');
      return;
    }
    try {
      const batch = await api.warehouseStock.batchById(row.id);
      setModalFromBatch(batch);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить партию');
    }
  }, []);

  // При открытии с batch_id или order_id+floor_id (после «Завершить пошив → ОТК») — один раз открыть форму
  const openedRef = useRef(null);
  const retryCountRef = useRef(0);
  const MAX_BATCH_ID_RETRIES = 3;
  useEffect(() => {
    if (loading) return;
    const key = batchIdParam ? `batch-${batchIdParam}` : (orderIdParam != null && floorIdParam != null ? `order-${orderIdParam}-${floorIdParam}` : null);
    if (!key || openedRef.current === key) return;
    if (batchIdParam) {
      const row = pending.find((r) => Number(r.id) === Number(batchIdParam));
      if (row) {
        openedRef.current = key;
        openModal(row);
        return;
      }
      if (retryCountRef.current < MAX_BATCH_ID_RETRIES) {
        retryCountRef.current += 1;
        const t = setTimeout(() => loadPending({ ignoreFloorFilter: true }), 400);
        return () => clearTimeout(t);
      }
      openedRef.current = key;
      api.warehouseStock
        .batchById(batchIdParam)
        .then((batch) => setModalFromBatch(batch))
        .catch((err) => setError(err.message || 'Партия не найдена'));
      return;
    }
    if (orderIdParam != null && floorIdParam != null) {
      const row = pending.find((r) => r.order_id === orderIdParam && r.floor_id === floorIdParam);
      if (row) {
        openedRef.current = key;
        openModal(row);
      }
    }
  }, [batchIdParam, orderIdParam, floorIdParam, loading, pending, openModal]);

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
      setSuccessMsg('ОТК проведён. Принятое количество поступило на склад.');
      setTimeout(() => setSuccessMsg(''), 5000);
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
        Партии пошива, готовые к проверке. Партии создаются при завершении пошива на странице «Пошив». Проверьте каждую партию по размерам — после сохранения принятая продукция поступит на склад.
      </p>
      {successMsg && <p className="text-sm text-green-400 mb-4">{successMsg}</p>}

      {/* Фильтры: поиск по заказу/модели/клиенту, этаж */}
      <div className="no-print flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Поиск по заказу, модели, клиенту"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          className="px-3 py-2 rounded-lg bg-neon-surface border border-neon-border text-neon-text min-w-[200px] text-sm"
        />
        <select
          value={filterFloorId}
          onChange={(e) => setFilterFloorId(e.target.value)}
          className="px-3 py-2 rounded-lg bg-neon-surface border border-neon-border text-neon-text text-sm"
        >
          <option value="">Все этажи</option>
          {SEWING_FLOOR_IDS.map((fid) => (
            <option key={fid} value={fid}>{fid} этаж</option>
          ))}
        </select>
      </div>

      <NeonCard className="rounded-card overflow-hidden p-0">
        {loading ? (
          <div className="p-8 text-center text-neon-muted">Загрузка...</div>
        ) : displayList.length === 0 ? (
          <div className="p-8 text-neon-muted">
            {orderIdParam != null && floorIdParam != null ? 'По выбранному заказу и этажу партий нет' : 'Нет партий, ожидающих ОТК'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {orderIdParam != null && floorIdParam != null && (
              <p className="px-4 py-2 text-sm text-neon-muted border-b border-white/10">
                Показаны партии: заказ #{orderIdParam}, этаж #{floorIdParam}
              </p>
            )}
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
                {displayList.map((row) => (
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
