/**
 * Модалка закупа в карточке заказа
 * Добавление/редактирование только через неё (не на странице Закуп)
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api';
import { NeonButton, NeonInput, NeonSelect } from '../ui';

const UNIT_OPTIONS = ['шт', 'метр', 'кг', 'тонн', 'рулон'];

function makeEmptyRow(seed) {
  return {
    _localId: `new-${seed}-${Math.random().toString(36).slice(2, 8)}`,
    material_name: '',
    planned_qty: '',
    unit: 'шт',
    purchased_qty: '',
    purchased_price: '',
    purchased_sum: 0,
  };
}

export default function ProcurementModal({ open, orderId, onClose, onSaved, fromProcurementPage = false }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [dueDate, setDueDate] = useState('');
  const [rows, setRows] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!open || !orderId) return;
    setLoading(true);
    setError('');
    api.orders
      .getProcurement(orderId)
      .then((res) => {
        setData(res);
        setDueDate(res.procurement?.due_date || '');
        const prepared = (res.items || []).map((item) => ({
          _localId: `db-${item.id}`,
          id: item.id,
          material_name: item.material_name || '',
          planned_qty: String(item.planned_qty ?? ''),
          unit: String(item.unit || 'шт').toLowerCase(),
          purchased_qty: String(item.purchased_qty ?? ''),
          purchased_price: String(item.purchased_price ?? ''),
          purchased_sum: Number(item.purchased_sum || 0),
        }));
        const withEmpties = [...prepared];
        while (withEmpties.length < 3) withEmpties.push(makeEmptyRow(withEmpties.length + 1));
        setRows(withEmpties);
      })
      .catch((err) => setError(err.message || 'Ошибка загрузки закупа'))
      .finally(() => setLoading(false));
  }, [open, orderId]);

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const tzCode = String(data?.order?.tz_code || '').trim();
  const modelName = String(data?.order?.model_name || '').trim();
  const orderTitle =
    (tzCode && modelName ? `${tzCode} — ${modelName}` : '') || data?.order?.title || tzCode || modelName || '';
  const totalOrderQty = data?.order?.total_quantity || 0;
  const status = data?.procurement?.status || 'draft';
  const isReceived = status === 'received';
  const isDraft = status === 'draft' || status === 'Ожидает закуп';
  const isSent = status === 'sent';
  const canEdit = isDraft;
  const canEditPurchased = isSent && fromProcurementPage;
  const canEditMaterials = canEdit || canEditPurchased; // Материал/План редактируемы в черновике или на странице Закуп при sent
  const showPurchasedColumns = !isDraft; // черновик — без Куплено/Цена/Сумма

  const totalSum = useMemo(
    () => rows.reduce((acc, row) => acc + (Number(row.purchased_sum) || 0), 0),
    [rows]
  );

  // Для просмотра (received) показываем только заполненные строки
  const displayRows = isReceived
    ? rows.filter((r) => String(r.material_name || '').trim())
    : rows;

  const updateRow = (localId, patch) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row._localId !== localId) return row;
        const next = { ...row, ...patch };
        const pqty = Number(next.purchased_qty) || 0;
        const pprice = Number(next.purchased_price) || 0;
        next.purchased_sum = Number((pqty * pprice).toFixed(2));
        return next;
      })
    );
  };

  const addRow = () => setRows((prev) => [...prev, makeEmptyRow(prev.length + 1)]);
  const removeRow = (localId) => setRows((prev) => prev.filter((row) => row._localId !== localId));

  const validateForSave = () => {
    const nextErrors = {};
    rows.forEach((row, idx) => {
      const hasAny = String(row.material_name || '').trim() || String(row.planned_qty || '').trim();
      if (!hasAny) return;
      if (!String(row.material_name || '').trim()) nextErrors[`${idx}-material_name`] = true;
      if (!(Number(row.planned_qty) >= 0)) nextErrors[`${idx}-planned_qty`] = true;
      if (!UNIT_OPTIONS.includes(String(row.unit || '').toLowerCase())) nextErrors[`${idx}-unit`] = true;
    });
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateForComplete = () => {
    const nextErrors = {};
    rows.forEach((row, idx) => {
      if (!String(row.material_name || '').trim()) return;
      if (!(Number(row.purchased_qty) >= 0) || !(Number(row.purchased_price) >= 0))
        nextErrors[`${idx}-purchased`] = true;
    });
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    setError('');
    if (!validateForSave()) {
      setError('Проверьте обязательные поля в таблице материалов');
      return;
    }
    setSaving('save');
    try {
      const items = rows
        .filter((row) => String(row.material_name || '').trim())
        .map((row) => ({
          id: row.id,
          material_name: String(row.material_name || '').trim(),
          planned_qty: Number(row.planned_qty || 0),
          unit: String(row.unit || 'шт').toLowerCase(),
          purchased_qty: isDraft ? 0 : Number(row.purchased_qty || 0),
          purchased_price: isDraft ? 0 : Number(row.purchased_price || 0),
        }));

      const res = await api.orders.updateProcurement(orderId, { due_date: dueDate || null, items });
      setData(res);
      onSaved?.(res);
    } catch (err) {
      setError(err.message || 'Ошибка сохранения закупа');
    } finally {
      setSaving('');
    }
  };

  const handleSend = async () => {
    setError('');
    if (!validateForSave()) {
      setError('Сначала заполните материалы, план и единицы');
      return;
    }
    setSaving('send');
    try {
      const items = rows
        .filter((row) => String(row.material_name || '').trim())
        .map((row) => ({
          id: row.id,
          material_name: String(row.material_name || '').trim(),
          planned_qty: Number(row.planned_qty || 0),
          unit: String(row.unit || 'шт').toLowerCase(),
          purchased_qty: 0,
          purchased_price: 0,
        }));
      await api.orders.updateProcurement(orderId, { due_date: dueDate || null, items });
      await api.orders.sendProcurement(orderId);
      const res = await api.orders.getProcurement(orderId);
      setData(res);
      onSaved?.(res);
    } catch (err) {
      setError(err.message || 'Ошибка отправки');
    } finally {
      setSaving('');
    }
  };

  const handleComplete = async () => {
    setError('');
    if (!validateForComplete()) {
      setError('Заполните «Куплено» и «Цена» по всем материалам');
      return;
    }
    setSaving('complete');
    try {
      const items = rows
        .filter((r) => String(r.material_name || '').trim())
        .map((r) => ({
          id: r.id,
          material_name: String(r.material_name || '').trim(),
          planned_qty: Number(r.planned_qty) || 0,
          unit: String(r.unit || 'шт').toLowerCase(),
          purchased_qty: Number(r.purchased_qty) || 0,
          purchased_price: Number(r.purchased_price) || 0,
        }));
      await api.orders.completeProcurement(orderId, items);
      const res = await api.orders.getProcurement(orderId);
      setData(res);
      onSaved?.(res);
    } catch (err) {
      setError(err.message || 'Ошибка');
    } finally {
      setSaving('');
    }
  };

  if (!open) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-hidden" onClick={onClose}>
      <div
        className="card-neon rounded-card w-[min(96vw,72rem)] max-h-[90vh] p-5 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-[#ECECEC]">Закуп</h2>
            <p className="text-sm text-[#ECECEC]/70">Заказ: {orderTitle || data?.order?.title || '—'}</p>
          </div>
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg bg-accent-1/30 text-[#ECECEC]">
            Закрыть
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto pr-1">
          {loading ? (
            <div className="py-8 text-center text-[#ECECEC]/70">Загрузка...</div>
          ) : (
            <>
              {isReceived && (
                <div className="mb-4 p-3 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400">
                  ✅ Закуп выполнен
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <div className="rounded-lg bg-accent-2/40 p-3">
                  <div className="text-xs text-[#ECECEC]/70">Клиент</div>
                  <div className="text-sm text-[#ECECEC]">{data?.order?.client_name || '—'}</div>
                </div>
                <div className="rounded-lg bg-accent-2/40 p-3">
                  <div className="text-xs text-[#ECECEC]/70">Общий объём</div>
                  <div className="text-sm text-[#ECECEC]">{totalOrderQty}</div>
                </div>
                <div>
                  <label className="block text-xs text-[#ECECEC]/70 mb-1">Дедлайн закупа</label>
                  <NeonInput
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/20">
                <table className="w-full min-w-[780px] text-sm">
                  <thead>
                    <tr className="bg-accent-3/80 border-b border-white/20">
                      <th className="text-left px-3 py-2">Материал</th>
                      <th className="text-left px-3 py-2">План</th>
                      <th className="text-left px-3 py-2">Ед.</th>
                      {showPurchasedColumns && (
                        <>
                          <th className="text-left px-3 py-2">Куплено</th>
                          <th className="text-left px-3 py-2">Цена</th>
                          <th className="text-left px-3 py-2">Сумма</th>
                        </>
                      )}
                      {(canEdit || canEditMaterials) && <th className="w-8" />}
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row, idx) => (
                      <tr key={row._localId} className="border-b border-white/10">
                        <td className="px-3 py-2">
                          <NeonInput
                            value={row.material_name}
                            onChange={(e) => updateRow(row._localId, { material_name: e.target.value })}
                            disabled={!canEditMaterials}
                            readOnly={!canEditMaterials}
                            className={fieldErrors[`${idx}-material_name`] ? 'ring-1 ring-red-500' : ''}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <NeonInput
                            type="number"
                            step="0.001"
                            min="0"
                            value={row.planned_qty}
                            onChange={(e) => updateRow(row._localId, { planned_qty: e.target.value })}
                            disabled={!canEditMaterials}
                            readOnly={!canEditMaterials}
                            className={fieldErrors[`${idx}-planned_qty`] ? 'ring-1 ring-red-500' : ''}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <NeonSelect
                            value={row.unit}
                            onChange={(e) => updateRow(row._localId, { unit: e.target.value })}
                            disabled={!canEditMaterials}
                          >
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </NeonSelect>
                        </td>
                        {showPurchasedColumns && (
                          <>
                            <td className="px-3 py-2">
                              <NeonInput
                                type="number"
                                step="0.001"
                                min="0"
                                value={row.purchased_qty}
                                onChange={(e) => updateRow(row._localId, { purchased_qty: e.target.value })}
                                disabled={!canEditPurchased}
                                className={fieldErrors[`${idx}-purchased`] ? 'ring-1 ring-red-500' : ''}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <NeonInput
                                type="number"
                                step="0.01"
                                min="0"
                                value={row.purchased_price}
                                onChange={(e) => updateRow(row._localId, { purchased_price: e.target.value })}
                                disabled={!canEditPurchased}
                                className={fieldErrors[`${idx}-purchased`] ? 'ring-1 ring-red-500' : ''}
                              />
                            </td>
                            <td className="px-3 py-2 text-[#ECECEC] font-medium">
                              {Number(row.purchased_sum || 0).toFixed(2)}
                            </td>
                          </>
                        )}
                        {(canEdit || canEditMaterials) && (
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="text-red-400 hover:text-red-300"
                              onClick={() => removeRow(row._localId)}
                              title="Удалить строку"
                            >
                              ×
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap justify-between items-center mt-4 gap-3">
                {(canEdit || canEditMaterials) && (
                  <button
                    type="button"
                    onClick={addRow}
                    className="px-3 py-2 rounded-lg bg-accent-1/30 text-[#ECECEC]"
                  >
                    + Добавить строку
                  </button>
                )}
                {showPurchasedColumns && (
                  <div className="text-sm text-[#ECECEC] ml-auto">
                    Итого: <span className="font-semibold text-primary-400">{totalSum.toFixed(2)} ₽</span>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-3 p-2 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
              )}
            </>
          )}
        </div>

        {!loading && (
          <div className="mt-4 flex flex-wrap gap-2 justify-end shrink-0">
            {isReceived ? (
              <span className="text-green-400 py-2">✅ Закуп выполнен</span>
            ) : (
              <>
                {canEdit && (
                  <NeonButton
                    onClick={handleSave}
                    disabled={!!saving || loading}
                  >
                    {saving === 'save' ? 'Сохранение...' : 'Сохранить'}
                  </NeonButton>
                )}
                {(status === 'draft' || status === 'Ожидает закуп') && (
                  <NeonButton
                    onClick={handleSend}
                    variant="secondary"
                    disabled={!!saving || loading}
                  >
                    {saving === 'send' ? 'Отправка...' : 'Отправить в закуп'}
                  </NeonButton>
                )}
                {status === 'sent' && fromProcurementPage && (
                  <NeonButton
                    onClick={handleComplete}
                    variant="secondary"
                    disabled={!!saving || loading}
                  >
                    {saving === 'complete' ? 'Сохранение...' : 'Закуплено'}
                  </NeonButton>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
