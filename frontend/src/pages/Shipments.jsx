/**
 * Страница отгрузок. Отгрузка по партиям и размерам.
 * Остатки группируются по партии; отгрузка создаётся по партии с указанием количества по каждому размеру.
 * Нельзя отгрузить больше, чем есть на складе по партии и размеру.
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import PrintButton from '../components/PrintButton';
import { NeonButton, NeonCard, NeonInput } from '../components/ui';

export default function Shipments() {
  const [stock, setStock] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalBatch, setModalBatch] = useState(null);
  const [modalLegacy, setModalLegacy] = useState(null);
  const [shipQty, setShipQty] = useState('');
  const [formItems, setFormItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([api.warehouseStock.stock(), api.warehouseStock.shipments()])
      .then(([s, sh]) => {
        setStock(s);
        setShipments(sh);
      })
      .catch(() => {
        setStock([]);
        setShipments([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const modelName = (row) =>
    row.Order?.model_name || row.Order?.title || `#${row.order_id}`;
  const sizeName = (row) =>
    row.ModelSize?.Size?.name || `#${row.model_size_id}`;
  const batchCode = (row) => row.batch_code ?? row.batch ?? '—';

  // Группировка остатков по партии (batch_id или batch для легаси)
  const stockByBatch = () => {
    const byBatch = new Map();
    stock.forEach((row) => {
      const key = row.batch_id != null ? `b-${row.batch_id}` : `legacy-${row.order_id}-${row.batch}`;
      if (!byBatch.has(key)) {
        byBatch.set(key, {
          batch_id: row.batch_id,
          batch_code: batchCode(row),
          order_id: row.order_id,
          modelName: modelName(row),
          rows: [],
        });
      }
      byBatch.get(key).rows.push(row);
    });
    return Array.from(byBatch.values());
  };

  const openModalBatch = (group) => {
    setModalBatch(group);
    setFormItems(
      group.rows.map((r) => ({
        id: r.id,
        model_size_id: r.model_size_id,
        size_name: sizeName(r),
        available: Number(r.qty) || 0,
        qty: 0,
      }))
    );
    setError('');
  };

  const openModalLegacy = (row) => {
    setModalLegacy(row);
    setShipQty(String(row.qty ?? 0));
    setError('');
  };

  const handleChangeBatchItem = (modelSizeId, value) => {
    const num = Math.max(0, parseInt(value, 10) || 0);
    setFormItems((prev) =>
      prev.map((it) => {
        if (it.model_size_id !== modelSizeId) return it;
        return { ...it, qty: Math.min(num, it.available) };
      })
    );
  };

  const handleShipBatch = async (e) => {
    e.preventDefault();
    if (!modalBatch?.batch_id) return;
    const items = formItems.filter((it) => it.qty > 0).map((it) => ({ model_size_id: it.model_size_id, qty: it.qty }));
    if (items.length === 0) {
      setError('Укажите количество хотя бы по одному размеру');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.warehouseStock.postShipment({
        batch_id: modalBatch.batch_id,
        items,
      });
      setModalBatch(null);
      load();
    } catch (err) {
      setError(err.message || 'Ошибка отгрузки');
    } finally {
      setSaving(false);
    }
  };

  const handleShipLegacy = async (e) => {
    e.preventDefault();
    if (!modalLegacy) return;
    const qty = parseInt(shipQty, 10);
    if (Number.isNaN(qty) || qty <= 0) {
      setError('Введите количество больше 0');
      return;
    }
    if (qty > (modalLegacy.qty ?? 0)) {
      setError('Нельзя отгрузить больше, чем есть на складе');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.warehouseStock.postShipment({
        order_id: modalLegacy.order_id,
        model_size_id: modalLegacy.model_size_id,
        batch: modalLegacy.batch,
        qty,
      });
      setModalLegacy(null);
      load();
    } catch (err) {
      setError(err.message || 'Ошибка отгрузки');
    } finally {
      setSaving(false);
    }
  };

  const batches = stockByBatch();

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-neon-text">Отгрузка</h1>
        <PrintButton />
      </div>
      <p className="text-sm text-neon-muted mb-4">
        Отгрузка по партиям и размерам. Выберите партию и укажите количество по каждому размеру. Нельзя отгрузить больше остатка по партии.
      </p>

      <NeonCard className="rounded-card overflow-hidden p-0 mb-6">
        <div className="px-4 py-3 border-b border-white/20 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium text-neon-text">Остатки на складе</h2>
          {!loading && batches.filter((b) => b.batch_id != null).length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-neon-muted">Отгрузить по партии:</span>
              {batches.filter((b) => b.batch_id != null).map((group) => (
                <button
                  key={group.batch_code}
                  type="button"
                  onClick={() => openModalBatch(group)}
                  className="px-3 py-1.5 rounded-lg bg-primary-600/80 text-white text-sm hover:bg-primary-600"
                >
                  {group.batch_code}
                </button>
              ))}
            </div>
          )}
        </div>
        {loading ? (
          <div className="p-8 text-center text-neon-muted">Загрузка...</div>
        ) : stock.length === 0 ? (
          <div className="p-8 text-neon-muted">Нет остатков</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-accent-3/80 border-b border-white/25">
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text">Партия</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text">Модель</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text">Размер</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-neon-text">Остаток</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text">Действие</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((row) => (
                  <tr key={row.id} className="border-b border-white/15">
                    <td className="px-4 py-3 text-neon-text">{batchCode(row)}</td>
                    <td className="px-4 py-3 text-neon-text">{modelName(row)}</td>
                    <td className="px-4 py-3 text-neon-text">{sizeName(row)}</td>
                    <td className="px-4 py-3 text-right font-medium">{row.qty ?? 0}</td>
                    <td className="px-4 py-3 text-neon-muted text-sm">
                      {row.batch_id != null ? '—' : (
                        <button
                          type="button"
                          onClick={() => openModalLegacy(row)}
                          disabled={!(row.qty > 0)}
                          className="text-primary-400 hover:underline disabled:opacity-50"
                        >
                          Отгрузить
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </NeonCard>

      <NeonCard className="rounded-card overflow-hidden p-0">
        <h2 className="px-4 py-3 text-lg font-medium text-neon-text border-b border-white/20">История отгрузок</h2>
        {shipments.length === 0 ? (
          <div className="p-8 text-neon-muted">Нет отгрузок</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-accent-3/80 border-b border-white/25">
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text">Дата</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text">Партия</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text">Модель / Размер</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-neon-text">Кол-во</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((row) => {
                  const batchCodeVal = row.SewingBatch?.batch_code ?? row.batch ?? '—';
                  const hasItems = row.ShipmentItems?.length > 0;
                  return (
                    <tr key={row.id} className="border-b border-white/15">
                      <td className="px-4 py-3 text-neon-text">
                        {row.shipped_at ? new Date(row.shipped_at).toLocaleDateString('ru-RU') : '—'}
                      </td>
                      <td className="px-4 py-3 text-neon-text">{batchCodeVal}</td>
                      <td className="px-4 py-3 text-neon-text">
                        {hasItems
                          ? row.ShipmentItems.map((it) => `${it.ModelSize?.Size?.name ?? it.model_size_id}: ${it.qty}`).join(', ')
                          : `${row.ModelSize?.Size?.name ?? '—'} ${row.qty ?? 0}`}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {hasItems
                          ? row.ShipmentItems.reduce((s, it) => s + (Number(it.qty) || 0), 0)
                          : row.qty ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </NeonCard>

      {modalBatch?.batch_id &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto"
            onClick={() => !saving && setModalBatch(null)}
          >
            <div
              className="bg-neon-bg2 border border-neon-border rounded-card p-6 max-w-md w-full shadow-xl my-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-neon-text mb-2">Отгрузка партии {modalBatch.batch_code}</h3>
              <p className="text-sm text-neon-muted mb-4">{modalBatch.modelName}</p>
              <form onSubmit={handleShipBatch} className="space-y-3">
                {formItems.map((it) => (
                  <div key={it.model_size_id} className="flex items-center justify-between gap-2">
                    <span className="text-neon-text">{it.size_name}</span>
                    <span className="text-neon-muted text-sm">доступно: {it.available}</span>
                    <NeonInput
                      type="number"
                      min={0}
                      max={it.available}
                      className="w-24"
                      value={it.qty}
                      onChange={(e) => handleChangeBatchItem(it.model_size_id, e.target.value)}
                    />
                  </div>
                ))}
                {error && <p className="text-sm text-red-400">{error}</p>}
                <div className="flex gap-2 pt-2">
                  <NeonButton type="submit" disabled={saving}>
                    {saving ? 'Сохранение...' : 'Отгрузить'}
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

      {modalLegacy &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !saving && setModalLegacy(null)}
          >
            <div
              className="bg-neon-bg2 border border-neon-border rounded-card p-6 max-w-sm w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-neon-text mb-2">Отгрузка</h3>
              <p className="text-sm text-neon-muted mb-1">
                {modelName(modalLegacy)} — {sizeName(modalLegacy)}, партия {modalLegacy.batch}
              </p>
              <p className="text-sm text-neon-muted mb-4">Доступно: {modalLegacy.qty ?? 0} шт.</p>
              <form onSubmit={handleShipLegacy} className="space-y-4">
                <div>
                  <label className="block text-sm text-neon-muted mb-1">Количество (шт)</label>
                  <NeonInput
                    type="number"
                    min={1}
                    max={modalLegacy.qty ?? 0}
                    value={shipQty}
                    onChange={(e) => setShipQty(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <div className="flex gap-2">
                  <NeonButton type="submit" disabled={saving}>
                    {saving ? 'Сохранение...' : 'Отгрузить'}
                  </NeonButton>
                  <NeonButton type="button" variant="secondary" onClick={() => setModalLegacy(null)} disabled={saving}>
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