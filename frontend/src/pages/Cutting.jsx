/**
 * Страница раскроя
 * Вкладки по типу: Аксы, Аутсорс + динамические из справочника cutting_types
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import PrintButton from '../components/PrintButton';

const DEFAULT_TYPES = ['Аксы', 'Аутсорс', 'Наш цех'];

export function CompleteByFactModal({ task, onClose, onSave, isEditMode }) {
  const variants = task.Order?.OrderVariants || [];
  const actualMap = (task.actual_variants || []).reduce(
    (acc, v) => { acc[`${v.color}|${v.size}`] = v.quantity_actual; return acc; },
    {}
  );
  const seen = {};
  const initialRows = [];
  for (const v of variants) {
    const key = `${v.color}|${v.Size?.name || ''}`;
    if (seen[key]) {
      seen[key].quantity_planned += v.quantity || 0;
    } else {
      const row = {
        color: v.color,
        size: v.Size?.name || '',
        quantity_planned: v.quantity || 0,
        quantity_actual: actualMap[key] ?? v.quantity ?? 0,
      };
      seen[key] = row;
      initialRows.push(row);
    }
  }
  const [rows, setRows] = useState(initialRows);

  const handleChange = (index, value) => {
    const n = parseInt(value, 10);
    setRows((r) =>
      r.map((row, i) => (i === index ? { ...row, quantity_actual: isNaN(n) ? 0 : n } : row))
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(
      rows.map((r) => ({
        color: r.color,
        size: r.size,
        quantity_planned: r.quantity_planned,
        quantity_actual: r.quantity_actual,
      }))
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4" onClick={onClose}>
      <div
        className="bg-accent-3 dark:bg-dark-900 rounded-xl border border-white/25 p-4 sm:p-6 max-w-3xl w-full h-[95vh] sm:h-auto sm:max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
          {isEditMode ? 'Редактировать по факту' : 'Завершить по факту'} — #{task.order_id} {task.Order?.title}
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="overflow-x-auto -mx-1 mb-4">
          <table className="w-full text-sm table-fixed min-w-[280px]">
            <colgroup>
              <col className="w-[25%]" />
              <col className="w-[20%]" />
              <col className="w-[25%]" />
              <col className="w-[30%]" />
            </colgroup>
            <thead>
              <tr className="bg-accent-2/50 dark:bg-dark-800">
                <th className="text-left px-4 py-2.5 font-medium">Цвет</th>
                <th className="text-left px-4 py-2.5 font-medium">Размер</th>
                <th className="text-left px-4 py-2.5 font-medium">Кол-во план</th>
                <th className="text-left px-4 py-2.5 font-medium">Кол-во факт</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-white/10">
                  <td className="px-4 py-2.5">{r.color}</td>
                  <td className="px-4 py-2.5">{r.size}</td>
                  <td className="px-4 py-2.5">{r.quantity_planned}</td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      min="0"
                      value={r.quantity_actual}
                      onChange={(e) => handleChange(i, e.target.value)}
                      className="w-full min-w-[4rem] px-3 py-1.5 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="flex gap-2 justify-end flex-wrap">
            <button type="submit" className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700">
              {isEditMode ? 'Сохранить' : 'Сохранить и завершить'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text">
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Cutting() {
  const { type } = useParams();
  const navigate = useNavigate();
  const [cuttingTypes, setCuttingTypes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeType, setActiveType] = useState(type || 'Аксы');
  const [showAddForm, setShowAddForm] = useState(false);
  const [completeModalTask, setCompleteModalTask] = useState(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState(new Set());
  const [newTask, setNewTask] = useState({
    order_id: '',
    operation: '',
    status: 'Ожидает',
    responsible: '',
  });

  // Аксы и Аутсорс — по умолчанию; остальные — из справочника (без дублей)
  const dynamicTypes = cuttingTypes
    .filter((t) => !DEFAULT_TYPES.includes(t.name))
    .map((t) => t.name);
  const allTypes = [...DEFAULT_TYPES, ...dynamicTypes];

  useEffect(() => {
    api.references.cuttingTypes().then(setCuttingTypes).catch(() => setCuttingTypes([]));
  }, []);

  useEffect(() => {
    if (activeType) {
      setLoading(true);
      api.cutting
        .tasks(activeType)
        .then(setTasks)
        .catch(() => setTasks([]))
        .finally(() => setLoading(false));
    }
  }, [activeType]);

  useEffect(() => {
    api.orders.list({ limit: 200 }).then(setOrders).catch(() => setOrders([]));
  }, []);

  useEffect(() => {
    if (type && allTypes.includes(type)) {
      setActiveType(type);
    } else if (!type && allTypes.length > 0) {
      navigate(`/cutting/${encodeURIComponent(allTypes[0])}`, { replace: true });
    }
  }, [type, allTypes, navigate]);

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTask.order_id) {
      alert('Выберите заказ');
      return;
    }
    try {
      await api.cutting.addTask({
        order_id: parseInt(newTask.order_id, 10),
        cutting_type: activeType,
        operation: newTask.operation?.trim() || undefined,
        status: newTask.status,
        responsible: newTask.responsible?.trim() || undefined,
      });
      setNewTask({ order_id: '', operation: '', status: 'Ожидает', responsible: '' });
      setShowAddForm(false);
      const updated = await api.cutting.tasks(activeType);
      setTasks(updated);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteTask = async (task) => {
    if (!confirm('Удалить задачу?')) return;
    try {
      await api.cutting.deleteTask(task.id);
      setTasks((t) => t.filter((x) => x.id !== task.id));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleStatusChange = async (task, newStatus) => {
    try {
      await api.cutting.updateTask(task.id, { status: newStatus });
      setTasks((t) => t.map((x) => (x.id === task.id ? { ...x, status: newStatus } : x)));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCompleteByFact = async (task, actualVariants) => {
    try {
      await api.cutting.updateTask(task.id, {
        status: 'Готово',
        actual_variants: actualVariants,
      });
      const updated = await api.cutting.tasks(activeType);
      setTasks(updated);
      setCompleteModalTask(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEditActualVariants = async (task, actualVariants) => {
    try {
      await api.cutting.updateTask(task.id, { actual_variants: actualVariants });
      const updated = await api.cutting.tasks(activeType);
      setTasks(updated);
      setCompleteModalTask(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleTaskExpand = (taskId) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-[#ECECEC] dark:text-dark-text">Раскрой</h1>
        {tasks.length > 0 && <PrintButton />}
      </div>

      <p className="no-print text-[#ECECEC]/80 dark:text-dark-text/80 mb-4">
        Тип: <span className="font-medium text-[#ECECEC] dark:text-dark-text">{activeType}</span>
      </p>

      {/* Кнопка добавить задачу */}
      <div className="no-print mb-4">
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
        >
          {showAddForm ? 'Отмена' : 'Добавить задачу на раскрой'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddTask} className="no-print mb-4 sm:mb-6 p-3 sm:p-4 rounded-xl bg-accent-3/80 dark:bg-dark-900 border border-white/25 dark:border-white/25 flex flex-wrap gap-3 sm:gap-4 items-end">
          <div>
            <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-1">Заказ</label>
            <select
              value={newTask.order_id}
              onChange={(e) => setNewTask({ ...newTask, order_id: e.target.value })}
              className="px-3 sm:px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text w-full sm:min-w-[200px]"
              required
            >
              <option value="">— Выберите заказ —</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  #{o.id} {o.Client?.name} — {o.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-1">Операция</label>
            <input
              type="text"
              value={newTask.operation}
              onChange={(e) => setNewTask({ ...newTask, operation: e.target.value })}
              placeholder="Операция"
              className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
            />
          </div>
          <div>
            <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-1">Статус</label>
            <select
              value={newTask.status}
              onChange={(e) => setNewTask({ ...newTask, status: e.target.value })}
              className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
            >
              <option value="Ожидает">Ожидает</option>
              <option value="В работе">В работе</option>
              <option value="Готово">Готово</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-1">Ответственный</label>
            <input
              type="text"
              value={newTask.responsible}
              onChange={(e) => setNewTask({ ...newTask, responsible: e.target.value })}
              placeholder="ФИО"
              className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
            />
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700">
            Добавить
          </button>
        </form>
      )}

      {/* Таблица задач */}
      <div className="print-area rounded-xl border border-white/25 dark:border-white/25 overflow-hidden overflow-x-auto">
        <h1 className="print-title print-only">Раскрой — {activeType}</h1>
        {loading ? (
          <div className="p-6 sm:p-8 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
        ) : tasks.length === 0 ? (
          <div className="p-6 sm:p-8 text-[#ECECEC]/80 dark:text-dark-text/80">Нет задач по типу «{activeType}»</div>
        ) : (
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-accent-3/80 dark:bg-dark-900 border-b border-white/25 dark:border-white/25">
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Заказ</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Операция</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Статус</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Ответственный</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">По факту</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Действия</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const variants = task.Order?.OrderVariants || [];
                const actualMap = (task.actual_variants || []).reduce(
                  (acc, v) => { acc[`${v.color}|${v.size}`] = v.quantity_actual; return acc; },
                  {}
                );
                const seen = {};
                const rows = [];
                for (const v of variants) {
                  const key = `${v.color}|${v.Size?.name || ''}`;
                  if (seen[key]) {
                    seen[key].quantity_planned += v.quantity || 0;
                  } else {
                    const row = {
                      color: v.color,
                      size: v.Size?.name || '',
                      quantity_planned: v.quantity || 0,
                      quantity_actual: actualMap[key] ?? v.quantity ?? 0,
                    };
                    seen[key] = row;
                    rows.push(row);
                  }
                }
                const isExpanded = expandedTaskIds.has(task.id);
                return (
                  <React.Fragment key={task.id}>
                  <tr className="border-b border-white/10 dark:border-white/10">
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleTaskExpand(task.id)}
                          className="p-1 rounded hover:bg-accent-2/50 dark:hover:bg-dark-800 text-[#ECECEC]/80 dark:text-dark-text/80 transition-transform duration-200"
                          title={isExpanded ? 'Свернуть' : 'Развернуть детали'}
                        >
                          <svg
                            className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          onClick={() => navigate(`/orders/${task.order_id}`)}
                          className="text-primary-400 hover:underline"
                        >
                          #{task.order_id} {task.Order?.Client?.name} — {task.Order?.title}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 align-top">{task.operation || '—'}</td>
                    <td className="px-4 py-3 align-top">
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task, e.target.value)}
                        className="px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm"
                      >
                        <option value="Ожидает">Ожидает</option>
                        <option value="В работе">В работе</option>
                        <option value="Готово">Готово</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 align-top">{task.responsible || '—'}</td>
                    <td className="px-4 py-3 align-top">
                      {rows.length > 0 && (
                        isExpanded ? (
                          <button
                            onClick={() => setCompleteModalTask(task)}
                            className="min-w-[260px] px-2.5 py-1 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                          >
                            {task.status === 'Готово' ? 'Редактировать по факту' : 'Завершить по факту'}
                          </button>
                        ) : (
                          <div className="text-sm text-[#ECECEC]/90 dark:text-dark-text/90">
                            <span>План: {rows.reduce((s, r) => s + (r.quantity_planned || 0), 0)}</span>
                            <span className="mx-2">|</span>
                            <span>Факт: {rows.reduce((s, r) => s + (r.quantity_actual || 0), 0)}</span>
                          </div>
                        )
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <button
                        onClick={() => handleDeleteTask(task)}
                        className="text-red-500 hover:text-red-400 text-sm"
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                  <tr className="border-b border-white/15 dark:border-white/15 bg-accent-2/20 dark:bg-dark-900/50">
                    <td colSpan={6} className="px-4 py-0 overflow-hidden">
                      <div
                        className={`grid transition-[grid-template-rows] duration-300 ease-out`}
                        style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="px-4 py-2">
                            <div className="w-full max-w-[560px]">
                              <table className="w-full text-sm border border-white/15 dark:border-white/15 rounded overflow-hidden table-fixed">
                                <colgroup>
                                  <col className="w-[28%]" />
                                  <col className="w-[18%]" />
                                  <col className="w-[27%]" />
                                  <col className="w-[27%]" />
                                </colgroup>
                                <thead>
                                  <tr className="bg-accent-2/50 dark:bg-dark-800">
                                    <th className="text-left px-4 py-1.5 font-medium">Цвет</th>
                                    <th className="text-left px-4 py-1.5 font-medium">Размер</th>
                                    <th className="text-left px-4 py-1.5 font-medium">Кол-во план</th>
                                    <th className="text-left px-4 py-1.5 font-medium">Кол-во факт</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.length === 0 ? (
                                    <tr><td colSpan={4} className="px-4 py-1.5 text-[#ECECEC]/60">Нет данных</td></tr>
                                  ) : rows.map((r, i) => (
                                    <tr key={i} className="border-t border-white/10">
                                      <td className="px-4 py-1">{r.color}</td>
                                      <td className="px-4 py-1">{r.size}</td>
                                      <td className="px-4 py-1">{r.quantity_planned}</td>
                                      <td className="px-4 py-1">{task.status === 'Готово' ? r.quantity_actual : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {completeModalTask && (
        <CompleteByFactModal
          task={completeModalTask}
          onClose={() => setCompleteModalTask(null)}
          onSave={(actualVariants) =>
            completeModalTask.status === 'Готово'
              ? handleEditActualVariants(completeModalTask, actualVariants)
              : handleCompleteByFact(completeModalTask, actualVariants)
          }
          isEditMode={completeModalTask.status === 'Готово'}
        />
      )}
    </div>
  );
}
