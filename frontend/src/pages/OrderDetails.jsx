/**
 * Детали заказа
 * Редактирование заказа, факта по операциям, завершение, удаление
 * Редактирование вариантов (цвет×размер×количество) как при создании
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import PrintButton from '../components/PrintButton';
import { CompleteByFactModal } from './Cutting';

const LETTER_SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
const NUMERIC_SIZES = ['38', '40', '42', '44', '46', '48', '50', '52', '54', '56'];
const DEFAULT_SIZES = [...LETTER_SIZES, ...NUMERIC_SIZES];

const STATUS_COLORS = {
  Принят: 'bg-yellow-500/20 text-yellow-400',
  'В работе': 'bg-blue-500/20 text-blue-400',
  Готов: 'bg-green-500/20 text-green-400',
  Просрочен: 'bg-red-500/20 text-red-400',
};

/** Проверка: может ли пользователь редактировать факт этой операции */
function canEditActual(user, op) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'manager') return true;
  if (user.role === 'technologist') return true; // backend проверит этаж
  if (user.role === 'operator' && user.Sewer && op.sewer_id === user.Sewer.id) return true;
  return false;
}

/** Проверка: может ли пользователь завершить заказ */
function canComplete(user) {
  return user?.role === 'admin' || user?.role === 'manager' || user?.role === 'technologist';
}

/** Проверка: может ли пользователь редактировать заказ (включая Operator — заказы со своими операциями) */
function canEditOrder(user) {
  return user?.role === 'admin' || user?.role === 'manager' || user?.role === 'technologist' || user?.role === 'operator';
}

/** Проверка: может ли пользователь удалить заказ */
function canDeleteOrder(user) {
  return user?.role === 'admin' || user?.role === 'manager';
}

export default function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingOp, setSavingOp] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [editingActual, setEditingActual] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [clients, setClients] = useState([]);
  const [floors, setFloors] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [availableSizes, setAvailableSizes] = useState([]);
  const [editForm, setEditForm] = useState({});
  const [editSelectedSizes, setEditSelectedSizes] = useState([]);
  const [editColors, setEditColors] = useState([]);
  const [editMatrix, setEditMatrix] = useState({});
  const [editNewSizeInput, setEditNewSizeInput] = useState('');
  const [editNewColorInput, setEditNewColorInput] = useState('');
  const [editColorSuggestions, setEditColorSuggestions] = useState([]);
  const [editColorDropdownOpen, setEditColorDropdownOpen] = useState(false);
  const [editEditingRowTotal, setEditEditingRowTotal] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const [cuttingCompleteModalTask, setCuttingCompleteModalTask] = useState(null);
  const [expandedCuttingTaskIds, setExpandedCuttingTaskIds] = useState(() => new Set());
  const editColorInputRef = useRef(null);
  const editColorDropdownRef = useRef(null);

  /** Может ли пользователь редактировать задачи раскроя */
  const canEditCutting = ['admin', 'manager', 'technologist'].includes(user?.role);

  const toggleCuttingTaskExpand = (taskId) => {
    setExpandedCuttingTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const loadOrder = () => {
    api.orders
      .get(id)
      .then(setOrder)
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOrder();
  }, [id]);

  useEffect(() => {
    if (showEditModal) {
      api.references.clients().then(setClients);
      api.references.floors().then(setFloors);
      api.references.orderStatus().then(setStatuses);
      api.sizes.list().then((data) => setAvailableSizes(data || []));
    }
  }, [showEditModal]);

  useEffect(() => {
    const term = (editNewColorInput || '').trim();
    if (term.length < 2 || !showEditModal) {
      setEditColorSuggestions([]);
      setEditColorDropdownOpen(false);
      return;
    }
    const t = setTimeout(() => {
      api.references.colors(term).then((data) => {
        setEditColorSuggestions(data || []);
        setEditColorDropdownOpen((data?.length || 0) > 0);
      }).catch(() => setEditColorSuggestions([]));
    }, 200);
    return () => clearTimeout(t);
  }, [editNewColorInput, showEditModal]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        editColorDropdownRef.current && !editColorDropdownRef.current.contains(e.target) &&
        editColorInputRef.current && !editColorInputRef.current.contains(e.target)
      ) {
        setEditColorDropdownOpen(false);
      }
    };
    if (showEditModal) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEditModal]);

  useEffect(() => {
    if (showEditModal && order) {
      setEditForm({
        client_id: order.client_id,
        title: order.title,
        total_quantity: String(order.total_quantity ?? order.quantity ?? ''),
        deadline: order.deadline,
        comment: order.comment || '',
        planned_month: order.planned_month || '',
        floor_id: order.floor_id || '',
        status_id: order.status_id,
      });
      const variants = order.variants || [];
      const sizes = order.sizes || [];
      const colors = order.colors || [];
      setEditSelectedSizes(sizes.length > 0 ? sizes : []);
      setEditColors(colors.length > 0 ? colors : (order.color ? [order.color] : []));
      const m = {};
      variants.forEach((v) => {
        if (v.color && v.size && (v.quantity || 0) > 0) {
          m[`${v.color}|${v.size}`] = v.quantity;
        }
      });
      setEditMatrix(m);
      setEditNewSizeInput('');
      setEditNewColorInput('');
    }
  }, [showEditModal, order]);

  const handleActualChange = (opId, value) => {
    setEditingActual((prev) => ({ ...prev, [opId]: value }));
  };

  const handleSaveActual = async (op) => {
    const val = editingActual[op.id];
    if (val === undefined) return;
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 0) {
      setErrorMsg('Факт должен быть числом >= 0');
      return;
    }
    setSavingOp(op.id);
    setErrorMsg('');
    try {
      await api.orders.updateOperationActual(order.id, op.id, num);
      setEditingActual((prev) => {
        const next = { ...prev };
        delete next[op.id];
        return next;
      });
      loadOrder();
      setSuccessMsg('Факт сохранён');
      setTimeout(() => setSuccessMsg(''), 2000);
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка сохранения факта');
    } finally {
      setSavingOp(null);
    }
  };

  const handleComplete = async () => {
    setShowCompleteConfirm(false);
    setCompleting(true);
    setErrorMsg('');
    try {
      const res = await api.orders.complete(id);
      loadOrder();
      setSuccessMsg(
        res.summary?.is_overdue
          ? 'Заказ завершён (с просрочкой по дедлайну)'
          : 'Заказ успешно завершён'
      );
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      const msg = err.message || 'Ошибка завершения';
      if (err.problematic?.length) {
        setErrorMsg(
          `${msg} Операции без факта: ${err.problematic.map((p) => p.operation).join(', ')}`
        );
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setCompleting(false);
    }
  };

  const editGetCell = (color, size) => editMatrix[`${color}|${size}`] || '';
  const editSetCell = (color, size, value) => {
    const key = `${color}|${size}`;
    const v = parseInt(value, 10);
    setEditMatrix((prev) => {
      const next = { ...prev };
      if (isNaN(v) || v <= 0) delete next[key];
      else next[key] = v;
      return next;
    });
  };
  const editAddSize = (name) => {
    const n = String(name || '').trim();
    if (!n || editSelectedSizes.includes(n)) return;
    setEditSelectedSizes((prev) => [...prev, n].sort());
    setEditNewSizeInput('');
  };
  const editRemoveSize = (name) => {
    setEditSelectedSizes((prev) => prev.filter((s) => s !== name));
    setEditMatrix((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (k.endsWith(`|${name}`)) delete next[k]; });
      return next;
    });
  };
  const editAddColor = (name) => {
    const n = String(name || '').trim();
    if (!n || editColors.includes(n)) return;
    setEditColors((prev) => [...prev, n].sort());
    setEditNewColorInput('');
    setEditColorDropdownOpen(false);
  };
  const editRemoveColor = (name) => {
    setEditColors((prev) => prev.filter((c) => c !== name));
    setEditMatrix((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (k.startsWith(`${name}|`)) delete next[k]; });
      return next;
    });
  };

  const editTotalQty = parseInt(editForm.total_quantity, 10) || 0;
  const editMatrixSum = Object.values(editMatrix).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
  const editVariantsValid = editTotalQty > 0 && editSelectedSizes.length > 0 && editColors.length > 0 && editMatrixSum === editTotalQty;

  /** Распределить итог по строке на размеры (равномерно) */
  const editDistributeRowTotal = (color, totalStr) => {
    const total = parseInt(totalStr, 10) || 0;
    if (total <= 0 || editSelectedSizes.length === 0) return;
    const n = editSelectedSizes.length;
    const base = Math.floor(total / n);
    const remainder = total % n;
    setEditMatrix((prev) => {
      const next = { ...prev };
      editSelectedSizes.forEach((s, i) => {
        const key = `${color}|${s}`;
        next[key] = i < remainder ? base + 1 : base;
      });
      return next;
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editVariantsValid) {
      setErrorMsg('Сумма матрицы цвет×размер должна равняться общему количеству');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const variants = [];
      editColors.forEach((color) => {
        editSelectedSizes.forEach((size) => {
          const q = parseInt(editGetCell(color, size), 10) || 0;
          if (q > 0) variants.push({ color, size, quantity: q });
        });
      });
      const payload = {
        client_id: parseInt(editForm.client_id, 10),
        title: editForm.title.trim(),
        total_quantity: editTotalQty,
        deadline: editForm.deadline,
        comment: editForm.comment?.trim() || undefined,
        planned_month: editForm.planned_month?.trim() || undefined,
        floor_id: editForm.floor_id ? parseInt(editForm.floor_id, 10) : undefined,
        sizes: editSelectedSizes,
        variants,
      };
      if (['admin', 'manager'].includes(user?.role)) {
        payload.status_id = parseInt(editForm.status_id, 10);
      }
      await api.orders.update(id, payload);
      setShowEditModal(false);
      loadOrder();
      setSuccessMsg('Заказ обновлён');
      setTimeout(() => setSuccessMsg(''), 2000);
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    setDeleting(true);
    setErrorMsg('');
    try {
      await api.orders.delete(id);
      navigate('/');
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка удаления');
    } finally {
      setDeleting(false);
    }
  };

  const ops = order?.OrderOperations || [];
  // Заказ можно завершить только когда все операции: статус «Готово» и факт >= план
  const allOpsDone =
    ops.length > 0 &&
    ops.every((o) => (o.status || 'Ожидает') === 'Готово' && (o.actual_quantity ?? 0) >= (o.planned_quantity || 0));
  const notDoneOps = ops.filter(
    (o) => (o.status || 'Ожидает') !== 'Готово' || (o.actual_quantity ?? 0) < (o.planned_quantity || 0)
  );
  const isCompleted = order?.OrderStatus?.name === 'Готов';
  const cuttingTasks = order?.CuttingTasks || [];

  const handleCuttingStatusChange = async (task, newStatus) => {
    try {
      await api.cutting.updateTask(task.id, { status: newStatus });
      loadOrder();
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка обновления статуса');
    }
  };

  const handleCuttingCompleteByFact = async (task, actualVariants) => {
    try {
      await api.cutting.updateTask(task.id, {
        status: 'Готово',
        actual_variants: actualVariants,
      });
      setCuttingCompleteModalTask(null);
      loadOrder();
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка сохранения');
    }
  };

  const handleCuttingEditActualVariants = async (task, actualVariants) => {
    try {
      await api.cutting.updateTask(task.id, { actual_variants: actualVariants });
      setCuttingCompleteModalTask(null);
      loadOrder();
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка сохранения');
    }
  };

  const handleCuttingDeleteTask = async (task) => {
    if (!confirm('Удалить задачу на раскрой?')) return;
    try {
      await api.cutting.deleteTask(task.id);
      loadOrder();
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка удаления');
    }
  };

  if (loading) return <div className="text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>;
  if (!order) return <div className="text-red-500 dark:text-red-400">Заказ не найден</div>;

  return (
    <div className="pt-2 sm:pt-4">
      <div className="no-print flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
        <h1 className="text-lg sm:text-2xl font-bold text-[#ECECEC] dark:text-dark-text truncate">
          Заказ #{order.id} — {order.title}
        </h1>
        <div className="flex gap-2 flex-wrap">
          <PrintButton />
          {user?.role !== 'operator' &&
            (order.OrderStatus?.name === 'Принят' || order.OrderStatus?.name === 'В работе') && (
              <Link
                to={`/planning/assign?order_id=${order.id}`}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700"
              >
                Распределить
              </Link>
            )}
          <Link
            to={`/procurement?order_id=${order.id}`}
            className="px-4 py-2 rounded-lg bg-accent-1/40 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/50 dark:hover:bg-dark-3 font-medium flex items-center gap-2"
            title="Перейти к закупу"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Закуп
          </Link>
          {canEditOrder(user) && (
            <button
              onClick={() => setShowEditModal(true)}
              className="px-4 py-2 rounded-lg bg-accent-1/40 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/50 dark:hover:bg-dark-3 font-medium flex items-center gap-2"
              title="Редактировать заказ"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Редактировать
            </button>
          )}
          {canDeleteOrder(user) && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              className="px-4 py-2 rounded-lg bg-red-500/30 text-red-400 hover:bg-red-500/40 font-medium disabled:opacity-50"
            >
              {deleting ? 'Удаление...' : 'Удалить'}
            </button>
          )}
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/40 dark:hover:bg-dark-3"
          >
            Назад
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="no-print mb-4 p-4 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30">
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="no-print mb-4 p-4 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30">
          {errorMsg}
        </div>
      )}

      <div className="print-area mb-4 sm:mb-6 flex flex-col gap-4 sm:gap-6">
        <h1 className="print-title print-only">
          Заказ №{order.id} — {order.Client?.name || '—'} — {order.title}
        </h1>
        <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 dark:border-white/25 overflow-hidden transition-block">
          <h2 className="text-base sm:text-lg font-medium text-[#ECECEC] dark:text-dark-text p-4 sm:p-6 border-b border-white/25 dark:border-white/25">
            Информация о заказе
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(140px,1fr)_2fr] gap-0 md:gap-6">
            {/* Меньше половины — фото */}
            <div className="p-4 sm:p-6 border-b md:border-b-0 md:border-r border-white/25 dark:border-white/25 flex flex-col items-center justify-center min-h-[200px]">
              {(order.photos || []).length > 0 ? (
                <div className="flex flex-wrap gap-2 justify-center">
                  {(order.photos || []).map((photo, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={photo}
                        alt={`Фото ${idx + 1}`}
                        className="w-32 h-32 md:w-40 md:h-40 object-cover rounded-lg border border-white/25 dark:border-white/25 cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setViewingPhoto(photo)}
                      />
                      {canEditOrder(user) && (
                        <button
                          type="button"
                          onClick={async (ev) => {
                            ev.stopPropagation();
                            try {
                              await api.orders.deletePhoto(order.id, idx);
                              loadOrder();
                            } catch (e) {
                              setErrorMsg(e.message);
                            }
                          }}
                          className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white text-sm hover:bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {canEditOrder(user) && (order.photos?.length || 0) < 10 && (
                    <label className="w-32 h-32 md:w-40 md:h-40 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/30 dark:border-white/30 hover:border-primary-500 cursor-pointer transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingPhoto}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = async () => {
                            setUploadingPhoto(true);
                            setErrorMsg('');
                            try {
                              await api.orders.addPhoto(order.id, reader.result);
                              loadOrder();
                            } catch (err) {
                              setErrorMsg(err.message || 'Ошибка загрузки');
                            } finally {
                              setUploadingPhoto(false);
                              e.target.value = '';
                            }
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                      {uploadingPhoto ? (
                        <span className="text-xs text-[#ECECEC]/80">...</span>
                      ) : (
                        <>
                          <svg className="w-8 h-8 text-[#ECECEC]/60 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          <span className="text-xs text-[#ECECEC]/70">Добавить</span>
                        </>
                      )}
                    </label>
                  )}
                </div>
              ) : (
                <>
                  {canEditOrder(user) ? (
                    <label className="w-full min-h-[180px] flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/30 dark:border-white/30 hover:border-primary-500 cursor-pointer transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingPhoto}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = async () => {
                            setUploadingPhoto(true);
                            setErrorMsg('');
                            try {
                              await api.orders.addPhoto(order.id, reader.result);
                              loadOrder();
                            } catch (err) {
                              setErrorMsg(err.message || 'Ошибка загрузки');
                            } finally {
                              setUploadingPhoto(false);
                              e.target.value = '';
                            }
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                      {uploadingPhoto ? (
                        <span className="text-[#ECECEC]/80">Загрузка...</span>
                      ) : (
                        <>
                          <svg className="w-12 h-12 text-[#ECECEC]/50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-sm text-[#ECECEC]/70">Добавить фото</span>
                        </>
                      )}
                    </label>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-[#ECECEC]/50">
                      <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm">Нет фото</span>
                    </div>
                  )}
                </>
              )}
            </div>
            {/* Больше половины — информация, цвет, размер и т.д. */}
            <div className="p-4 sm:p-6 space-y-4">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-white/15 dark:border-white/15">
                    <td className="px-0 sm:px-4 py-2 sm:py-3 w-36 sm:w-48 text-[#ECECEC]/80 dark:text-dark-text/80">Клиент</td>
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC] dark:text-dark-text">{order.Client?.name}</td>
                  </tr>
                  <tr className="border-b border-white/15 dark:border-white/15">
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC]/80 dark:text-dark-text/80">Общее количество</td>
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC] dark:text-dark-text">
                      {order.total_quantity ?? order.quantity}
                    </td>
                  </tr>
                  <tr className="border-b border-white/15 dark:border-white/15">
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC]/80 dark:text-dark-text/80">Дедлайн</td>
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC] dark:text-dark-text whitespace-nowrap">{order.deadline}</td>
                  </tr>
                  <tr className="border-b border-white/15 dark:border-white/15">
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC]/80 dark:text-dark-text/80">Статус</td>
                    <td className="px-0 sm:px-4 py-2 sm:py-3">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          STATUS_COLORS[order.OrderStatus?.name] || 'bg-gray-500/20'
                        }`}
                      >
                        {order.OrderStatus?.name}
                      </span>
                    </td>
                  </tr>
                  {order.completed_at && (
                    <tr className="border-b border-white/15 dark:border-white/15">
                      <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC]/80 dark:text-dark-text/80">Завершён</td>
                      <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC] dark:text-dark-text whitespace-nowrap">
                        {new Date(order.completed_at).toLocaleString('ru-RU')}
                      </td>
                    </tr>
                  )}
                  <tr className="border-b border-white/15 dark:border-white/15">
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC]/80 dark:text-dark-text/80">Цех пошива</td>
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC] dark:text-dark-text">{order.Floor?.name || '—'}</td>
                  </tr>
                  {(order.OrderFloorDistributions?.[0]?.created_at) && (
                    <tr className="border-b border-white/15 dark:border-white/15">
                      <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC]/80 dark:text-dark-text/80">Дата распределения</td>
                      <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC] dark:text-dark-text whitespace-nowrap">
                        {new Date(order.OrderFloorDistributions[0].created_at).toLocaleString('ru-RU')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {/* Цвета и размеры */}
              {(() => {
                const variants = order.variants || [];
                const sizes = order.sizes || [];
                const colors = order.colors || [];
                const totalQty = order.total_quantity ?? order.quantity ?? 0;
                const getQty = (c, s) =>
                  variants.find((v) => v.color === c && v.size === s)?.quantity ?? 0;
                if (variants.length === 0 && !order.color) {
                  return (
                    <p className="text-[#ECECEC]/80 dark:text-dark-text/80 text-sm">Варианты не указаны</p>
                  );
                }
                if (variants.length === 0) {
                  return (
                    <p className="text-[#ECECEC]/80 dark:text-dark-text/80 text-sm">
                      Цвет: {order.color || '—'}, количество: {totalQty}
                    </p>
                  );
                }
                return (
                  <div className="overflow-x-auto">
                    <p className="text-sm font-medium text-[#ECECEC] dark:text-dark-text/90 mb-2">Цвета и размеры</p>
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-white/20 dark:border-white/20">
                          <th className="text-left px-3 py-2 font-medium text-[#ECECEC] dark:text-dark-text/90 border-b border-r border-white/15 dark:border-white/15">
                            Цвет
                          </th>
                          {sizes.map((s) => (
                            <th
                              key={s}
                              className="px-3 py-2 font-medium text-[#ECECEC] dark:text-dark-text/90 border-b border-white/15 dark:border-white/15 text-center"
                            >
                              {s}
                            </th>
                          ))}
                          <th className="px-3 py-2 font-medium text-[#ECECEC] dark:text-dark-text/90 border-b border-white/15 dark:border-white/15 text-center">
                            Итого
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {colors.map((color) => {
                          const rowSum = sizes.reduce((a, s) => a + getQty(color, s), 0);
                          return (
                            <tr key={color} className="border-b border-white/15 dark:border-white/15">
                              <td className="px-3 py-2 text-[#ECECEC] dark:text-dark-text border-b border-r border-white/15 dark:border-white/15">
                                {color}
                              </td>
                              {sizes.map((size) => (
                                <td
                                  key={size}
                                  className="px-3 py-2 text-[#ECECEC]/90 dark:text-dark-text/80 border-b border-white/15 dark:border-white/15 text-center"
                                >
                                  {getQty(color, size) || '—'}
                                </td>
                              ))}
                              <td className="px-3 py-2 font-medium text-[#ECECEC] dark:text-dark-text border-b border-white/15 dark:border-white/15 text-center">
                                {rowSum}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-b border-white/20 dark:border-white/20">
                          <td className="px-3 py-2 font-medium text-[#ECECEC] dark:text-dark-text border-r border-white/15 dark:border-white/15">
                            Итого
                          </td>
                          {sizes.map((size) => {
                            const colSum = colors.reduce((a, c) => a + getQty(c, size), 0);
                            return (
                              <td
                                key={size}
                                className="px-3 py-2 font-medium text-[#ECECEC] dark:text-dark-text text-center"
                              >
                                {colSum}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 font-bold text-[#ECECEC] dark:text-dark-text text-center">
                            {totalQty}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

      {/* Блок задач раскроя — до Распределённых операций */}
      {cuttingTasks.length > 0 && (
        <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 dark:border-white/25 overflow-hidden mt-4 sm:mt-6 transition-block">
          <div className="p-4 sm:p-6 border-b border-white/25 dark:border-white/25">
            <h2 className="text-base sm:text-lg font-medium text-[#ECECEC] dark:text-dark-text">
              Раскрой
            </h2>
            <p className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mt-1">
              Цех: {[...new Set(cuttingTasks.map((t) => t.cutting_type).filter(Boolean))].join(', ') || '—'}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-accent-3/80 dark:bg-dark-900 border-b border-white/25 dark:border-white/25">
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Заказ</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Операция</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Статус</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Ответственный</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">По факту</th>
                  {canEditCutting && (
                    <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Действия</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {cuttingTasks.map((task) => {
                  const variants = order.OrderVariants || [];
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
                  const isExpanded = expandedCuttingTaskIds.has(task.id);
                  return (
                    <React.Fragment key={task.id}>
                      <tr className="border-b border-white/10 dark:border-white/10">
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleCuttingTaskExpand(task.id)}
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
                            <div>
                              <span className="text-primary-400 font-medium">#{order.id}</span>
                              <div className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80">{order.Client?.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 align-top">{task.operation || 'раскрой'}</td>
                        <td className="px-4 py-3 align-top">
                          {canEditCutting ? (
                            <select
                              value={task.status}
                              onChange={(e) => handleCuttingStatusChange(task, e.target.value)}
                              className="px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm"
                            >
                              <option value="Ожидает">Ожидает</option>
                              <option value="В работе">В работе</option>
                              <option value="Готово">Готово</option>
                            </select>
                          ) : (
                            <span>{task.status}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 align-top">{task.responsible || '—'}</td>
                        <td className="px-4 py-3 align-top">
                          {rows.length > 0 && (
                            isExpanded && canEditCutting ? (
                              <button
                                onClick={() => setCuttingCompleteModalTask(task)}
                                className="min-w-[200px] px-2.5 py-1 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                              >
                                {task.status === 'Готово' ? 'Редактировать по факту' : 'Завершить по факту'}
                              </button>
                            ) : !isExpanded ? (
                              <div className="text-sm text-[#ECECEC]/90 dark:text-dark-text/90">
                                <span>План: {rows.reduce((s, r) => s + (r.quantity_planned || 0), 0)}</span>
                                <span className="mx-2">|</span>
                                <span>Факт: {rows.reduce((s, r) => s + (r.quantity_actual || 0), 0)}</span>
                              </div>
                            ) : !canEditCutting && task.status === 'Готово' ? (
                              <span className="text-[#ECECEC]/80">—</span>
                            ) : null
                          )}
                        </td>
                        {canEditCutting && (
                          <td className="px-4 py-3 align-top">
                            <button
                              onClick={() => handleCuttingDeleteTask(task)}
                              className="text-red-500 hover:text-red-400 text-sm"
                            >
                              Удалить
                            </button>
                          </td>
                        )}
                      </tr>
                      <tr className="border-b border-white/15 dark:border-white/15 bg-accent-2/20 dark:bg-dark-900/50">
                        <td colSpan={canEditCutting ? 6 : 5} className="px-4 py-0 overflow-hidden">
                          <div
                            className="grid transition-[grid-template-rows] duration-300 ease-out"
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
          </div>
        </div>
      )}

      <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 dark:border-white/25 overflow-hidden transition-block">
        <div className="p-6 border-b border-white/25 dark:border-white/25">
          <h2 className="text-lg font-medium text-[#ECECEC] dark:text-dark-text mb-2">
            Распределённые операции
          </h2>
          {ops.length > 0 && (
            <p className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80">
              Этаж: <span className="text-[#ECECEC] dark:text-dark-text">{order.BuildingFloor?.name || '—'}</span>
              {' · '}
              Технолог: <span className="text-[#ECECEC] dark:text-dark-text">{order.Technologist?.User?.name || '—'}</span>
            </p>
          )}
        </div>
        {!ops.length ? (
          <div className="p-4 sm:p-6 text-[#ECECEC]/80 dark:text-dark-text/80">Операции не распределены</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b border-white/20 dark:border-white/20">
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">
                  Операция
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">
                  Швея
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">
                  План
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">
                  Факт
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">
                  Статус
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">
                  Дата
                </th>
              </tr>
            </thead>
            <tbody>
              {ops.map((op) => {
                const editable = canEditActual(user, op);
                const done = (op.actual_quantity ?? 0) >= (op.planned_quantity || 0);
                const displayVal = editingActual[op.id] !== undefined ? editingActual[op.id] : (op.actual_quantity ?? '');
                return (
                  <tr key={op.id} className="border-b border-white/15 dark:border-white/15">
                    <td className="px-4 py-3 text-[#ECECEC] dark:text-dark-text">
                      {op.Operation?.name}
                    </td>
                    <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">
                      {op.Sewer?.User?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">
                      {op.planned_quantity}
                    </td>
                    <td className="px-4 py-3">
                      {editable ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            value={displayVal}
                            onChange={(e) => handleActualChange(op.id, e.target.value)}
                            className="w-20 px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveActual(op)}
                            disabled={savingOp === op.id || editingActual[op.id] === undefined}
                            className="text-xs px-2 py-1 rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                          >
                            {savingOp === op.id ? '…' : 'Сохранить'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[#ECECEC]/90 dark:text-dark-text/80">
                          {op.actual_quantity ?? '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          done
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {done ? 'Выполнено' : 'Не выполнено'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 whitespace-nowrap">
                      {op.planned_date || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}

        {canComplete(user) && !isCompleted && ops.length > 0 && (
          <div className="p-6 border-t border-white/25 dark:border-white/25">
            <button
              type="button"
              onClick={() => setShowCompleteConfirm(true)}
              disabled={!allOpsDone || completing}
              title={
                !allOpsDone && notDoneOps.length > 0
                  ? notDoneOps.some((o) => (o.status || 'Ожидает') !== 'Готово')
                    ? 'Завершите операции по цепочке: раскрой → пошив → финиш'
                    : `Не заполнен факт: ${notDoneOps.map((o) => o.Operation?.name).join(', ')}`
                  : ''
              }
              className="px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {completing ? 'Завершение...' : 'Завершить заказ'}
            </button>
            {!allOpsDone && notDoneOps.length > 0 && (
              <p className="mt-2 text-sm text-amber-400">
                {notDoneOps.some((o) => (o.status || 'Ожидает') !== 'Готово')
                  ? 'Завершите операции по цепочке: раскрой → пошив → финиш'
                  : `Заполните факт по операциям: ${notDoneOps.map((o) => o.Operation?.name).join(', ')}`}
              </p>
            )}
          </div>
        )}
      </div>
      </div>

      {showCompleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-accent-3 dark:bg-dark-900 rounded-xl p-4 sm:p-6 max-w-md w-full border border-white/25 dark:border-white/25">
            <h2 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
              Подтверждение
            </h2>
            <p className="text-[#ECECEC]/90 dark:text-dark-text/80 mb-6">
              Завершить заказ? Статус будет изменён на «Готов», заказ будет помечен как выполненный.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowCompleteConfirm(false)}
                className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleComplete}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700"
              >
                Завершить
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 bg-slate-900/75 flex items-start justify-center z-50 overflow-y-auto p-4 sm:pt-16 sm:pb-8">
          <div className="bg-[#2a2d35] rounded-xl p-4 sm:p-6 max-w-4xl w-full min-h-[90vh] sm:min-h-0 border border-white/20 dark:border-white/20 shadow-2xl">
            <h2 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
              Редактировать заказ
            </h2>
            <form onSubmit={handleSaveEdit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-4">
                <div>
                  <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Клиент</label>
                  <select
                    value={editForm.client_id}
                    onChange={(e) => setEditForm({ ...editForm, client_id: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                    required
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Название</label>
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Общее количество</label>
                  <input
                    type="number"
                    min="1"
                    value={editForm.total_quantity}
                    onChange={(e) => setEditForm({ ...editForm, total_quantity: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Дедлайн</label>
                  <input
                    type="date"
                    value={editForm.deadline}
                    onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Месяц плана</label>
                  <input
                    type="month"
                    value={editForm.planned_month}
                    onChange={(e) => setEditForm({ ...editForm, planned_month: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Цех пошива</label>
                  <select
                    value={editForm.floor_id}
                    onChange={(e) => setEditForm({ ...editForm, floor_id: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                  >
                    <option value="">—</option>
                    {floors.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
                {['admin', 'manager'].includes(user?.role) && (
                  <div>
                    <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Статус</label>
                    <select
                      value={editForm.status_id}
                      onChange={(e) => setEditForm({ ...editForm, status_id: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                    >
                      {statuses.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="mb-4">
                <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Комментарий</label>
                <textarea
                  value={editForm.comment}
                  onChange={(e) => setEditForm({ ...editForm, comment: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                  rows={2}
                />
              </div>

              {/* Цвета и размеры (как при создании) */}
              <div className="border-t border-white/25 dark:border-white/25 pt-4 mt-4">
                <h3 className="text-sm font-semibold text-[#ECECEC] dark:text-dark-text mb-3">Цвета и размеры</h3>
                <div className="mb-3">
                  <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-2">Размеры</label>
                  <div className="flex flex-wrap gap-2 items-center mb-2">
                    <span className="text-[#ECECEC]/60 dark:text-dark-text/60 text-xs mr-1">Цифровые:</span>
                    {[...NUMERIC_SIZES, ...editSelectedSizes.filter((s) => /^\d+$/.test(s) && !NUMERIC_SIZES.includes(s))].map((name) => (
                      <label key={name} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={editSelectedSizes.includes(name)}
                          onChange={(e) => {
                            if (e.target.checked) editAddSize(name);
                            else editRemoveSize(name);
                          }}
                          className="rounded"
                        />
                        <span className="text-[#ECECEC] dark:text-dark-text text-sm">{name}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center mb-2">
                    <span className="text-[#ECECEC]/60 dark:text-dark-text/60 text-xs mr-1">Буквенные:</span>
                    {[...LETTER_SIZES, ...editSelectedSizes.filter((s) => !/^\d+$/.test(s) && !LETTER_SIZES.includes(s))].map((name) => (
                      <label key={name} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={editSelectedSizes.includes(name)}
                          onChange={(e) => {
                            if (e.target.checked) editAddSize(name);
                            else editRemoveSize(name);
                          }}
                          className="rounded"
                        />
                        <span className="text-[#ECECEC] dark:text-dark-text text-sm">{name}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <input
                      type="text"
                      value={editNewSizeInput}
                      onChange={(e) => setEditNewSizeInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), editAddSize(editNewSizeInput.trim()))}
                      placeholder="+ Добавить размер"
                      className="px-3 py-1.5 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text text-sm min-w-[120px]"
                    />
                    <button
                      type="button"
                      onClick={() => editAddSize(editNewSizeInput.trim())}
                      className="text-sm px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                    >
                      Добавить
                    </button>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-2">Цвета</label>
                  <div className="flex flex-wrap gap-2 items-center">
                    {editColors.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text text-sm"
                      >
                        {c}
                        <button type="button" onClick={() => editRemoveColor(c)} className="text-red-400 hover:text-red-300">×</button>
                      </span>
                    ))}
                    <div className="relative flex gap-2" ref={editColorDropdownRef}>
                      <input
                        ref={editColorInputRef}
                        type="text"
                        value={editNewColorInput}
                        onChange={(e) => setEditNewColorInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), editAddColor(editNewColorInput.trim()))}
                        onFocus={() => editNewColorInput?.trim().length >= 2 && editColorSuggestions.length > 0 && setEditColorDropdownOpen(true)}
                        placeholder="+ Добавить цвет"
                        className="px-3 py-1.5 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text text-sm min-w-[120px]"
                      />
                      <button type="button" onClick={() => editAddColor(editNewColorInput.trim())} className="text-sm px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700">
                        Добавить
                      </button>
                      {editColorDropdownOpen && editColorSuggestions.length > 0 && (
                        <ul className="absolute z-10 w-full mt-1 py-1 bg-accent-2 dark:bg-dark-800 border border-white/25 dark:border-white/25 rounded-lg shadow-lg max-h-40 overflow-auto top-full left-0 min-w-[180px]">
                          {editColorSuggestions.map((c) => (
                            <li
                              key={c.id}
                              className="px-4 py-2 cursor-pointer hover:bg-accent-1/30 dark:hover:bg-dark-2 text-[#ECECEC] dark:text-dark-text text-sm"
                              onClick={() => editAddColor(c.name)}
                            >
                              {c.name}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
                {editSelectedSizes.length > 0 && editColors.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-white/25 dark:border-white/25 -mx-1">
                    <table className="w-full text-sm border-collapse min-w-[280px] table-fixed">
                      <thead>
                        <tr className="border-b border-white/20 dark:border-white/20">
                          <th className="text-left px-3 py-2 font-medium text-[#ECECEC] dark:text-dark-text/90">Цвет</th>
                          {editSelectedSizes.map((s) => (
                            <th key={s} className="px-2 py-2 font-medium text-[#ECECEC] dark:text-dark-text/90 text-center w-20">{s}</th>
                          ))}
                          <th className="px-3 py-2 font-medium text-[#ECECEC] dark:text-dark-text/90 text-center">Итого</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editColors.map((color) => {
                          const rowSum = editSelectedSizes.reduce((a, s) => a + (parseInt(editGetCell(color, s), 10) || 0), 0);
                          return (
                            <tr key={color} className="border-b border-white/15 dark:border-white/15">
                              <td className="px-3 py-2 text-[#ECECEC] dark:text-dark-text">{color}</td>
                              {editSelectedSizes.map((size) => (
                                <td key={size} className="px-2 py-2 text-center w-20">
                                  <input
                                    type="number"
                                    min="0"
                                    value={editGetCell(color, size)}
                                    onChange={(e) => editSetCell(color, size, e.target.value)}
                                    className="w-16 min-w-16 mx-auto block px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text text-center text-sm box-border"
                                  />
                                </td>
                              ))}
                              <td className="px-2 py-2 text-center w-20">
                                <input
                                  type="number"
                                  min="0"
                                  value={editEditingRowTotal?.color === color ? editEditingRowTotal.value : String(rowSum)}
                                  onFocus={() => setEditEditingRowTotal({ color, value: String(rowSum) })}
                                  onChange={(e) => setEditEditingRowTotal((p) => (p?.color === color ? { ...p, value: e.target.value } : p))}
                                  onBlur={(e) => {
                                    editDistributeRowTotal(color, e.target.value);
                                    setEditEditingRowTotal(null);
                                  }}
                                  onKeyDown={(e) => e.key === 'Enter' && (e.target.blur(), e.preventDefault())}
                                  title="Введите итог — распределится по размерам автоматически"
                                  className="w-16 min-w-16 mx-auto block px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text text-center text-sm box-border font-medium"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-b border-white/20 dark:border-white/20">
                          <td className="px-3 py-2 font-medium">Итого</td>
                          {editSelectedSizes.map((size) => {
                            const colSum = editColors.reduce((a, c) => a + (parseInt(editGetCell(c, size), 10) || 0), 0);
                            return <td key={size} className="px-2 py-2 font-medium text-center w-20">{colSum}</td>;
                          })}
                          <td className={`px-3 py-2 font-bold text-center ${editMatrixSum === editTotalQty && editTotalQty > 0 ? 'text-green-400' : editMatrixSum > 0 ? 'text-red-400' : ''}`}>
                            {editMatrixSum}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                    <p className={`text-sm px-3 py-2 ${editMatrixSum === editTotalQty && editTotalQty > 0 ? 'text-green-400' : editMatrixSum > 0 ? 'text-red-400' : 'text-[#ECECEC]/80'}`}>
                      Сумма: {editMatrixSum} / {editTotalQty}
                      {editMatrixSum === editTotalQty && editTotalQty > 0 ? ' ✓' : editMatrixSum > 0 ? ' — не совпадает' : ''}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-3 justify-end pt-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={saving || !editVariantsValid}
                  className="px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingPhoto && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setViewingPhoto(null)}
        >
          <img
            src={viewingPhoto}
            alt="Фото"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {cuttingCompleteModalTask && (
        <CompleteByFactModal
          task={{ ...cuttingCompleteModalTask, Order: order }}
          onClose={() => setCuttingCompleteModalTask(null)}
          onSave={(actualVariants) =>
            cuttingCompleteModalTask.status === 'Готово'
              ? handleCuttingEditActualVariants(cuttingCompleteModalTask, actualVariants)
              : handleCuttingCompleteByFact(cuttingCompleteModalTask, actualVariants)
          }
          isEditMode={cuttingCompleteModalTask.status === 'Готово'}
        />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-accent-3 dark:bg-dark-900 rounded-xl p-4 sm:p-6 max-w-md w-full border border-white/25 dark:border-white/25">
            <h2 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
              Удалить заказ?
            </h2>
            <p className="text-[#ECECEC]/90 dark:text-dark-text/80 mb-6">
              Заказ «{order.title}» будет удалён безвозвратно. Все распределённые операции и связи будут удалены.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg bg-red-500/80 text-white font-medium hover:bg-red-500"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
