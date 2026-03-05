/**
 * Создание заказа
 * Матрица цвет×размер, как было. Добавлен выбор ростовки; общее количество разделено на две части: ростовка + количество.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useRefreshOnVisible } from '../hooks/useRefreshOnVisible';
import { NeonButton, NeonInput, NeonSelect } from '../components/ui';
import PrintButton from '../components/PrintButton';

const ROSTOVKI = [
  { id: '165', name: '165' },
  { id: '170', name: '170' },
  { id: 'other', name: 'Другое' },
];

const LETTER_SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
const NUMERIC_SIZES = ['38', '40', '42', '44', '46', '48', '50', '52', '54', '56'];

export default function CreateOrder() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [colorSuggestions, setColorSuggestions] = useState([]);
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false);
  const colorInputRef = useRef(null);
  const colorDropdownRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    client_id: '',
    tz_code: '',
    model_name: '',
    total_quantity: '',
    start_date: '',
    deadline: '',
    comment: '',
    planned_month: '',
    workshop_id: '',
  });
  const [rostovka, setRostovka] = useState('');
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [colors, setColors] = useState([]);
  const [matrix, setMatrix] = useState({});
  const [newSizeInput, setNewSizeInput] = useState('');
  const [newColorInput, setNewColorInput] = useState('');
  const [editingRowTotal, setEditingRowTotal] = useState(null);
  const [orderPhotos, setOrderPhotos] = useState([]);

  const loadRefs = useCallback(() => {
    api.references.clients().then(setClients);
    api.workshops.list().then(setWorkshops);
  }, []);

  useEffect(() => {
    loadRefs();
  }, [loadRefs]);

  useRefreshOnVisible(loadRefs);

  useEffect(() => {
    const term = (newColorInput || '').trim();
    if (term.length < 2) {
      setColorSuggestions([]);
      setColorDropdownOpen(false);
      return;
    }
    const t = setTimeout(() => {
      api.references
        .colors(term)
        .then((data) => {
          setColorSuggestions(data || []);
          setColorDropdownOpen((data?.length || 0) > 0);
        })
        .catch(() => setColorSuggestions([]));
    }, 200);
    return () => clearTimeout(t);
  }, [newColorInput]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        colorDropdownRef.current &&
        !colorDropdownRef.current.contains(e.target) &&
        colorInputRef.current &&
        !colorInputRef.current.contains(e.target)
      ) {
        setColorDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalQty = parseInt(form.total_quantity, 10) || 0;
  const matrixSum = Object.values(matrix).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
  const isValid = totalQty > 0 && selectedSizes.length > 0 && colors.length > 0 && matrixSum === totalQty;

  const setCell = (color, size, value) => {
    const key = `${color}|${size}`;
    setMatrix((prev) => {
      const v = parseInt(value, 10);
      if (isNaN(v) || v <= 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: v };
    });
  };

  const getCell = (color, size) => matrix[`${color}|${size}`] || '';

  const addSize = (sizeName) => {
    const name = String(sizeName || '').trim();
    if (!name) return;
    if (selectedSizes.includes(name)) return;
    setSelectedSizes((prev) => [...prev, name].sort());
    setNewSizeInput('');
  };

  const removeSize = (sizeName) => {
    setSelectedSizes((prev) => prev.filter((s) => s !== sizeName));
    setMatrix((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.endsWith(`|${sizeName}`)) delete next[k];
      });
      return next;
    });
  };

  const addColor = (colorName) => {
    const name = String(colorName || '').trim();
    if (!name) return;
    if (colors.includes(name)) return;
    setColors((prev) => [...prev, name].sort());
    setNewColorInput('');
    setColorDropdownOpen(false);
  };

  const removeColor = (colorName) => {
    setColors((prev) => prev.filter((c) => c !== colorName));
    setMatrix((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.startsWith(`${colorName}|`)) delete next[k];
      });
      return next;
    });
  };

  const clearMatrix = () => setMatrix({});
  const fillZeros = () => {
    const next = { ...matrix };
    colors.forEach((c) => {
      selectedSizes.forEach((s) => {
        const key = `${c}|${s}`;
        if (!(key in next) || next[key] === '' || next[key] === 0) next[key] = 0;
      });
    });
    setMatrix(next);
  };

  const distributeRowTotal = (color, totalStr) => {
    const total = parseInt(totalStr, 10) || 0;
    if (total <= 0 || selectedSizes.length === 0) return;
    const n = selectedSizes.length;
    const base = Math.floor(total / n);
    const remainder = total % n;
    setMatrix((prev) => {
      const next = { ...prev };
      selectedSizes.forEach((s, i) => {
        const key = `${color}|${s}`;
        next[key] = i < remainder ? base + 1 : base;
      });
      return next;
    });
  };

  const handleAddSizeFromInput = () => {
    if (newSizeInput.trim()) addSize(newSizeInput.trim());
  };

  const handleAddColorFromInput = () => {
    if (newColorInput.trim()) addColor(newColorInput.trim());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) {
      alert('Заполните матрицу: сумма должна равняться общему количеству');
      return;
    }
    setLoading(true);
    try {
      const variants = [];
      colors.forEach((color) => {
        selectedSizes.forEach((size) => {
          const q = parseInt(getCell(color, size), 10) || 0;
          if (q > 0) variants.push({ color, size, quantity: q });
        });
      });
      const order = await api.orders.create({
        client_id: parseInt(form.client_id, 10),
        tz_code: form.tz_code,
        model_name: form.model_name,
        title: `${form.tz_code} — ${form.model_name}`,
        total_quantity: totalQty,
        start_date: form.start_date || undefined,
        deadline: form.deadline,
        comment: form.comment || undefined,
        planned_month: form.planned_month,
        workshop_id: parseInt(form.workshop_id, 10),
        sizes: selectedSizes,
        variants,
        photos: orderPhotos,
      });
      navigate(`/orders/${order.id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    return `${currentYear}-${m}`;
  });

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-neon-text">Создать заказ</h1>
        <PrintButton />
      </div>
      <form
        onSubmit={handleSubmit}
        className="max-w-4xl mx-auto card-neon rounded-card p-4 sm:p-6 space-y-4 transition-block"
      >
        <div>
          <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Клиент</label>
          <NeonSelect
            value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value })}
            required
          >
            <option value="">Выберите клиента</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </NeonSelect>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-4">
          <div>
            <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">ТЗ</label>
            <NeonInput
              type="text"
              value={form.tz_code}
              onChange={(e) => setForm({ ...form, tz_code: e.target.value })}
              maxLength={10}
              required
            />
          </div>
          <div>
            <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Название модели</label>
            <NeonInput
              type="text"
              value={form.model_name}
              onChange={(e) => setForm({ ...form, model_name: e.target.value })}
              required
            />
          </div>
          <p className="md:col-span-2 mt-1 text-xs text-[#ECECEC]/70">
            Получится: {(form.tz_code || '...').trim()} — {(form.model_name || '...').trim()}
          </p>
        </div>

        {/* Две части: ростовка + общее количество */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Ростовка</label>
            <NeonSelect
              value={rostovka}
              onChange={(e) => setRostovka(e.target.value)}
              className="w-full"
            >
              <option value="">Выберите ростовку</option>
              {ROSTOVKI.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </NeonSelect>
          </div>
          <div>
            <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Общее количество</label>
            <NeonInput
              type="number"
              min="1"
              value={form.total_quantity}
              onChange={(e) => setForm({ ...form, total_quantity: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border-[0.5px] border-white/20 bg-accent-2/20 p-3">
            <label className="flex items-center gap-2 text-sm text-[#ECECEC] dark:text-dark-text/90 mb-2">
              <svg className="w-4 h-4 text-[#ECECEC]/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z" />
              </svg>
              Поступление заказа
            </label>
            <NeonInput
              type="date"
              min={today}
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </div>
          <div className="rounded-xl border-[0.5px] border-white/20 bg-accent-2/20 p-3">
            <label className="flex items-center gap-2 text-sm text-[#ECECEC] dark:text-dark-text/90 mb-2">
              <svg className="w-4 h-4 text-[#ECECEC]/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Дедлайн
            </label>
            <NeonInput
              type="date"
              min={today}
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              required
            />
          </div>
        </div>
        <div>
          <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Комментарий</label>
          <textarea
            value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
            className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
            rows={2}
          />
        </div>

        <div className="border-t border-white/25 dark:border-white/25 pt-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Месяц плана</label>
              <NeonSelect
                value={form.planned_month}
                onChange={(e) => setForm({ ...form, planned_month: e.target.value })}
                required
              >
                <option value="">Выберите месяц</option>
                {months.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </NeonSelect>
            </div>
            <div>
              <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Цех</label>
              <NeonSelect
                value={form.workshop_id}
                onChange={(e) => setForm({ ...form, workshop_id: e.target.value })}
                required
              >
                <option value="">Выберите цех</option>
                {workshops.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </NeonSelect>
            </div>
          </div>
        </div>

        <div className="border-t border-white/25 dark:border-white/25 pt-6 mt-6">
          <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-2">Фото заказа</label>
          <div className="flex flex-wrap gap-3 items-start">
            {orderPhotos.map((photo, idx) => (
              <div key={idx} className="relative group">
                <img src={photo} alt={`Фото ${idx + 1}`} className="w-20 h-20 object-cover rounded-lg border border-white/25" />
                <button
                  type="button"
                  onClick={() => setOrderPhotos((p) => p.filter((_, i) => i !== idx))}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs hover:bg-red-600 flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ))}
            {orderPhotos.length < 10 && (
              <label className="w-20 h-20 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/30 hover:border-primary-500 cursor-pointer transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      setOrderPhotos((p) => [...p, reader.result].slice(0, 10));
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                />
                <svg className="w-6 h-6 text-[#ECECEC]/60 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-xs text-[#ECECEC]/70">Добавить</span>
              </label>
            )}
          </div>
        </div>

        {/* Цвета и размеры — как было */}
        <div className="border-t border-white/25 dark:border-white/25 pt-6 mt-6">
          <h2 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">Цвета и размеры</h2>

          <div className="mb-4">
            <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-2">Размеры</label>
            <div className="flex flex-wrap gap-2 items-center mb-2">
              <span className="text-[#ECECEC]/60 text-xs mr-1">Цифровые:</span>
              {[...NUMERIC_SIZES, ...selectedSizes.filter((s) => /^\d+$/.test(s) && !NUMERIC_SIZES.includes(s))].map((name) => (
                <label key={name} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={selectedSizes.includes(name)}
                    onChange={(e) => (e.target.checked ? addSize(name) : removeSize(name))}
                    className="rounded"
                  />
                  <span className="text-[#ECECEC] dark:text-dark-text">{name}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center mb-2">
              <span className="text-[#ECECEC]/60 text-xs mr-1">Буквенные:</span>
              {[...LETTER_SIZES, ...selectedSizes.filter((s) => !/^\d+$/.test(s) && !LETTER_SIZES.includes(s))].map((name) => (
                <label key={name} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={selectedSizes.includes(name)}
                    onChange={(e) => (e.target.checked ? addSize(name) : removeSize(name))}
                    className="rounded"
                  />
                  <span className="text-[#ECECEC] dark:text-dark-text">{name}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <input
                type="text"
                value={newSizeInput}
                onChange={(e) => setNewSizeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSizeFromInput())}
                placeholder="+ Добавить размер"
                className="px-3 py-1.5 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm min-w-[140px]"
              />
              <button
                type="button"
                onClick={handleAddSizeFromInput}
                className="text-sm px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
              >
                Добавить
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-2">Цвета</label>
            <div className="flex flex-wrap gap-2 items-center mb-2">
              {colors.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text"
                >
                  {c}
                  <button type="button" onClick={() => removeColor(c)} className="text-red-400 hover:text-red-300 text-sm">×</button>
                </span>
              ))}
              <div className="relative flex gap-2" ref={colorDropdownRef}>
                <input
                  ref={colorInputRef}
                  type="text"
                  value={newColorInput}
                  onChange={(e) => setNewColorInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddColorFromInput())}
                  onFocus={() => newColorInput?.trim().length >= 2 && colorSuggestions.length > 0 && setColorDropdownOpen(true)}
                  placeholder="+ Добавить цвет"
                  className="px-3 py-1.5 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm min-w-[140px]"
                />
                <button
                  type="button"
                  onClick={handleAddColorFromInput}
                  className="text-sm px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                >
                  Добавить
                </button>
                {colorDropdownOpen && colorSuggestions.length > 0 && (
                  <ul className="absolute z-10 w-full mt-1 py-1 bg-accent-2 dark:bg-dark-800 border border-white/25 rounded-lg shadow-lg max-h-48 overflow-auto top-full left-0 min-w-[200px]">
                    {colorSuggestions.map((c) => (
                      <li
                        key={c.id}
                        className="px-4 py-2 cursor-pointer hover:bg-accent-1/30 dark:hover:bg-dark-2 text-[#ECECEC] dark:text-dark-text"
                        onClick={() => addColor(c.name)}
                      >
                        {c.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {selectedSizes.length > 0 && colors.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-white/25 -mx-1">
              <table className="w-full text-sm border-collapse min-w-[280px] table-fixed">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="text-left px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90 border-b border-r border-white/15">Цвет</th>
                    {selectedSizes.map((s) => (
                      <th key={s} className="px-2 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90 border-b border-white/15 text-center w-20">{s}</th>
                    ))}
                    <th className="px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90 border-b border-white/15 text-center">Итого</th>
                  </tr>
                </thead>
                <tbody>
                  {colors.map((color) => {
                    const rowSum = selectedSizes.reduce((a, s) => a + (parseInt(getCell(color, s), 10) || 0), 0);
                    return (
                      <tr key={color} className="border-b border-white/15">
                        <td className="px-4 py-3 text-[#ECECEC] dark:text-dark-text border-r border-white/15">{color}</td>
                        {selectedSizes.map((size) => (
                          <td key={size} className="px-2 py-2 border-b border-white/15 text-center w-20">
                            <input
                              type="number"
                              min="0"
                              value={getCell(color, size)}
                              onChange={(e) => setCell(color, size, e.target.value)}
                              className="w-16 min-w-16 mx-auto block px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-center box-border"
                            />
                          </td>
                        ))}
                        <td className="px-2 py-2 border-b border-white/15 text-center w-20">
                          <input
                            type="number"
                            min="0"
                            value={editingRowTotal?.color === color ? editingRowTotal.value : String(rowSum)}
                            onFocus={() => setEditingRowTotal({ color, value: String(rowSum) })}
                            onChange={(e) => setEditingRowTotal((p) => (p?.color === color ? { ...p, value: e.target.value } : p))}
                            onBlur={(e) => {
                              distributeRowTotal(color, e.target.value);
                              setEditingRowTotal(null);
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target.blur(), e.preventDefault())}
                            title="Введите итог — распределится по размерам"
                            className="w-16 min-w-16 mx-auto block px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-center box-border font-medium"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-b border-white/20">
                    <td className="px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text border-r border-white/15">Итого</td>
                    {selectedSizes.map((size) => {
                      const colSum = colors.reduce((a, c) => a + (parseInt(getCell(c, size), 10) || 0), 0);
                      return <td key={size} className="px-2 py-3 font-medium text-[#ECECEC] dark:text-dark-text text-center w-20">{colSum}</td>;
                    })}
                    <td className={`px-4 py-3 font-bold text-center ${matrixSum === totalQty && totalQty > 0 ? 'text-green-400' : matrixSum > 0 ? 'text-red-400' : 'text-[#ECECEC] dark:text-dark-text'}`}>
                      {matrixSum}
                    </td>
                  </tr>
                </tfoot>
              </table>
              <div className="p-2 flex gap-2 flex-wrap items-center">
                <button type="button" onClick={clearMatrix} className="text-sm px-3 py-1.5 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/40">
                  Очистить матрицу
                </button>
                <button type="button" onClick={fillZeros} className="text-sm px-3 py-1.5 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/40">
                  Заполнить нулями
                </button>
                <span className={`text-sm py-1.5 ${matrixSum === totalQty && totalQty > 0 ? 'text-green-400' : matrixSum > 0 ? 'text-red-400' : 'text-[#ECECEC]/80'}`}>
                  Сумма: {matrixSum} / {totalQty}
                  {matrixSum === totalQty && totalQty > 0 ? ' ✓' : matrixSum > 0 ? ' — не совпадает' : ''}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2 border-t border-white/25 pt-6 mt-6">
          <NeonButton type="submit" disabled={loading || !isValid}>
            {loading ? 'Создание...' : 'Создать заказ'}
          </NeonButton>
          <NeonButton type="button" onClick={() => navigate(-1)} variant="secondary">
            Отмена
          </NeonButton>
        </div>
      </form>
    </div>
  );
}
