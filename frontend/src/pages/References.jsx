/**
 * Справочники
 */

import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useRefreshOnVisible } from '../hooks/useRefreshOnVisible';

export default function References() {
  const { user } = useAuth();
  const [tab, setTab] = useState('floors');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newFloorName, setNewFloorName] = useState('');
  const [addingFloor, setAddingFloor] = useState(false);
  const [newTechnologist, setNewTechnologist] = useState({ name: '', email: '', password: '', floor_id: '', building_floor_id: '' });
  const [addingTechnologist, setAddingTechnologist] = useState(false);
  const [newSewer, setNewSewer] = useState({ name: '', phone: '', technologist_id: '' });
  const [addingSewer, setAddingSewer] = useState(false);
  const [floors, setFloors] = useState([]);
  const [buildingFloors, setBuildingFloors] = useState([]);
  const [technologistsByFloor, setTechnologistsByFloor] = useState([]);
  const [newBuildingFloorName, setNewBuildingFloorName] = useState('');
  const [addingBuildingFloor, setAddingBuildingFloor] = useState(false);
  const [newCuttingTypeName, setNewCuttingTypeName] = useState('');
  const [addingCuttingType, setAddingCuttingType] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [addingClient, setAddingClient] = useState(false);
  const [newOperation, setNewOperation] = useState({ name: '', norm_minutes: '', category: 'SEWING', default_floor_id: '', locked_to_floor: false });
  const [addingOperation, setAddingOperation] = useState(false);
  const [deletingOperationId, setDeletingOperationId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      let res = [];
      if (tab === 'floors') res = await api.references.floors();
      else if (tab === 'building-floors') res = await api.references.buildingFloors();
      else if (tab === 'cutting-types') res = await api.references.cuttingTypes(user?.role && ['admin', 'manager'].includes(user.role));
      else if (tab === 'clients') res = await api.references.clients();
      else if (tab === 'operations') res = await api.references.operations();
      else if (tab === 'order-status') res = await api.references.orderStatus();
      else if (tab === 'technologists') res = await api.references.technologists();
      else if (tab === 'sewers') res = await api.references.sewers();
      setData(res);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tab]);

  // Автообновление при возврате в приложение — новые клиенты/заказы от админа появятся на всех устройствах
  useRefreshOnVisible(load);

  useEffect(() => {
    if (tab === 'technologists' || tab === 'sewers') {
      api.references.floors().then(setFloors).catch(() => setFloors([]));
    }
    if (tab === 'technologists' || tab === 'operations') {
      api.references.buildingFloors().then(setBuildingFloors).catch(() => setBuildingFloors([]));
    }
  }, [tab]);

  useEffect(() => {
    if (tab === 'sewers') {
      api.references.technologists().then((data) => setTechnologistsByFloor(data || [])).catch(() => setTechnologistsByFloor([]));
    } else {
      setTechnologistsByFloor([]);
    }
  }, [tab]);

  const handleAddFloor = async (e) => {
    e.preventDefault();
    const name = newFloorName.trim();
    if (!name) return;
    setAddingFloor(true);
    try {
      await api.references.addFloor(name);
      setNewFloorName('');
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingFloor(false);
    }
  };

  const handleAddCuttingType = async (e) => {
    e.preventDefault();
    const name = newCuttingTypeName.trim();
    if (!name) return;
    setAddingCuttingType(true);
    try {
      await api.references.addCuttingType(name);
      setNewCuttingTypeName('');
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingCuttingType(false);
    }
  };

  const handleAddClient = async (e) => {
    e.preventDefault();
    const name = newClientName.trim();
    if (!name) return;
    setAddingClient(true);
    try {
      await api.references.addClient(name);
      setNewClientName('');
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingClient(false);
    }
  };

  const handleAddOperation = async (e) => {
    e.preventDefault();
    const name = newOperation.name.trim();
    if (!name) {
      alert('Укажите название операции');
      return;
    }
    const norm = parseFloat(newOperation.norm_minutes);
    if (isNaN(norm) || norm < 0) {
      alert('Укажите норму времени (минуты, число ≥ 0)');
      return;
    }
    setAddingOperation(true);
    try {
      await api.references.addOperation({
        name,
        norm_minutes: norm,
        category: newOperation.category || 'SEWING',
        default_floor_id: newOperation.default_floor_id || null,
        locked_to_floor: newOperation.locked_to_floor,
      });
      setNewOperation({ name: '', norm_minutes: '', category: 'SEWING', default_floor_id: '', locked_to_floor: false });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingOperation(false);
    }
  };

  const handleDeleteOperation = async (id) => {
    if (!window.confirm('Удалить операцию?')) return;
    setDeletingOperationId(id);
    try {
      await api.references.deleteOperation(id);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingOperationId(null);
    }
  };

  const handleAddBuildingFloor = async (e) => {
    e.preventDefault();
    const name = newBuildingFloorName.trim();
    if (!name) return;
    setAddingBuildingFloor(true);
    try {
      await api.references.addBuildingFloor(name);
      setNewBuildingFloorName('');
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingBuildingFloor(false);
    }
  };

  const handleAddTechnologist = async (e) => {
    e.preventDefault();
    const { name, email, password, floor_id, building_floor_id } = newTechnologist;
    if (!name?.trim() || !email?.trim() || !password || !floor_id || !building_floor_id) {
      alert('Заполните все поля: ФИО, email, пароль, цех пошива, этаж');
      return;
    }
    setAddingTechnologist(true);
    try {
      await api.references.addTechnologist({ name: name.trim(), email: email.trim(), password, floor_id, building_floor_id });
      setNewTechnologist({ name: '', email: '', password: '', floor_id: '', building_floor_id: '' });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingTechnologist(false);
    }
  };

  const handleAddSewer = async (e) => {
    e.preventDefault();
    const { name, phone, technologist_id } = newSewer;
    if (!name?.trim() || !phone?.trim() || !technologist_id) {
      alert('Заполните все поля: ФИО, номер телефона, выберите этаж и технолога');
      return;
    }
    setAddingSewer(true);
    try {
      await api.references.addSewer({ name: name.trim(), phone: phone.trim(), technologist_id });
      setNewSewer({ name: '', phone: '', technologist_id: '' });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingSewer(false);
    }
  };

  const formatRowValue = (k, v, row) => {
    if (v == null) return '—';
    if (typeof v !== 'object') return String(v);
    if (k === 'User' && v?.name) return v.name;
    if (k === 'Floor' && v?.name) return v.name;
    if (k === 'BuildingFloor' && v?.name) return v.name;
    if (k === 'Technologist') {
      if (v?.User?.name && v?.Floor?.name) return `${v.User.name} (${v.Floor.name})`;
      if (v?.User?.name) return v.User.name;
      if (v?.Floor?.name) return v.Floor.name;
    }
    return String(v?.name ?? v?.id ?? '—');
  };

  const getTableColumns = () => {
    if (tab === 'clients' && data.length > 0) {
      return [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Название' },
      ];
    }
    if (tab === 'cutting-types' && data.length > 0) {
      return [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Название' },
        { key: 'is_active', label: 'Активен', getValue: (row) => (row.is_active ? 'Да' : 'Нет') },
      ];
    }
    if (tab === 'operations' && data.length > 0) {
      return [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Название' },
        { key: 'norm_minutes', label: 'Норма (мин)' },
        { key: 'category', label: 'Категория', getValue: (row) => ({ CUTTING: 'Раскрой', SEWING: 'Пошив', FINISH: 'Финиш' }[row.category] || row.category) },
        { key: 'BuildingFloor', label: 'Этаж по умолчанию' },
        { key: 'locked_to_floor', label: 'Привязан к этажу', getValue: (row) => (row.locked_to_floor ? 'Да' : 'Нет') },
        {
          key: '_actions',
          label: '',
          getValue: (row) =>
            ['admin', 'manager'].includes(user?.role) ? (
              <button
                type="button"
                onClick={() => handleDeleteOperation(row.id)}
                disabled={deletingOperationId === row.id}
                className="px-2 py-1 text-sm rounded bg-red-600/80 hover:bg-red-600 text-white disabled:opacity-50"
              >
                {deletingOperationId === row.id ? '...' : 'Удалить'}
              </button>
            ) : null,
        },
      ];
    }
    if (tab === 'technologists' && data.length > 0) {
      return [
        { key: 'id', label: 'ID' },
        { key: 'User', label: 'ФИО' },
        { key: 'email', label: 'Email', getValue: (row) => row.User?.email ?? row.email },
        { key: 'Floor', label: 'Этаж' },
      ];
    }
    if (tab === 'sewers' && data.length > 0) {
      return [
        { key: 'id', label: 'ID' },
        { key: 'User', label: 'ФИО' },
        { key: 'phone', label: 'Телефон', getValue: (row) => row.User?.phone ?? row.phone ?? '—' },
        { key: 'Technologist', label: 'Технолог (Этаж)' },
      ];
    }
    return null;
  };

  const cols = getTableColumns();

  const tabs = [
    { id: 'floors', label: 'Цехи пошива' },
    { id: 'building-floors', label: 'Этажи' },
    { id: 'cutting-types', label: 'Типы раскроя' },
    { id: 'clients', label: 'Клиенты' },
    { id: 'operations', label: 'Операции' },
    { id: 'order-status', label: 'Статусы заказов' },
    { id: 'technologists', label: 'Технологи' },
    { id: 'sewers', label: 'Швеи' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <h1 className="text-2xl font-bold text-[#ECECEC] dark:text-dark-text">Справочники</h1>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="p-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/40 dark:hover:bg-dark-3 disabled:opacity-50"
          title="Обновить"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg ${
              tab === t.id ? 'bg-primary-600 text-white' : 'bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'floors' && ['admin', 'manager'].includes(user?.role) && (
        <form onSubmit={handleAddFloor} className="mb-4 flex gap-2">
          <input
            type="text"
            value={newFloorName}
            onChange={(e) => setNewFloorName(e.target.value)}
            placeholder="Добавить цех пошива (например: Цех №1)"
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[200px]"
          />
          <button
            type="submit"
            disabled={addingFloor || !newFloorName.trim()}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {addingFloor ? 'Добавление...' : 'Добавить'}
          </button>
        </form>
      )}
      {tab === 'building-floors' && ['admin', 'manager'].includes(user?.role) && (
        <form onSubmit={async (e) => { e.preventDefault(); const n = newBuildingFloorName.trim(); if (!n) return; setAddingBuildingFloor(true); try { await api.references.addBuildingFloor(n); setNewBuildingFloorName(''); load(); } catch (err) { alert(err.message); } finally { setAddingBuildingFloor(false); } }} className="mb-4 flex gap-2">
          <input
            type="text"
            value={newBuildingFloorName}
            onChange={(e) => setNewBuildingFloorName(e.target.value)}
            placeholder="Добавить этаж (например: Этаж 1)"
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[200px]"
          />
          <button type="submit" disabled={addingBuildingFloor || !newBuildingFloorName.trim()} className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
            {addingBuildingFloor ? 'Добавление...' : 'Добавить'}
          </button>
        </form>
      )}
      {tab === 'clients' && ['admin', 'manager'].includes(user?.role) && (
        <form onSubmit={handleAddClient} className="mb-4 flex gap-2">
          <input
            type="text"
            value={newClientName}
            onChange={(e) => setNewClientName(e.target.value)}
            placeholder="Добавить клиента (например: ООО Ромашка)"
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[200px]"
          />
          <button
            type="submit"
            disabled={addingClient || !newClientName.trim()}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {addingClient ? 'Добавление...' : 'Добавить'}
          </button>
        </form>
      )}
      {tab === 'cutting-types' && ['admin', 'manager'].includes(user?.role) && (
        <form onSubmit={handleAddCuttingType} className="mb-4 flex gap-2">
          <input
            type="text"
            value={newCuttingTypeName}
            onChange={(e) => setNewCuttingTypeName(e.target.value)}
            placeholder="Добавить тип раскроя (например: Цех №3)"
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[200px]"
          />
          <button
            type="submit"
            disabled={addingCuttingType || !newCuttingTypeName.trim()}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {addingCuttingType ? 'Добавление...' : 'Добавить'}
          </button>
        </form>
      )}
      {tab === 'building-floors' && ['admin', 'manager'].includes(user?.role) && (
        <form onSubmit={handleAddBuildingFloor} className="mb-4 flex gap-2">
          <input
            type="text"
            value={newBuildingFloorName}
            onChange={(e) => setNewBuildingFloorName(e.target.value)}
            placeholder="Добавить этаж (например: Этаж 1)"
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[200px]"
          />
          <button type="submit" disabled={addingBuildingFloor || !newBuildingFloorName.trim()} className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
            {addingBuildingFloor ? 'Добавление...' : 'Добавить'}
          </button>
        </form>
      )}
      {tab === 'technologists' && ['admin', 'manager'].includes(user?.role) && (
        <form onSubmit={handleAddTechnologist} className="mb-4 flex flex-wrap gap-2 items-end">
          <input
            type="text"
            value={newTechnologist.name}
            onChange={(e) => setNewTechnologist({ ...newTechnologist, name: e.target.value })}
            placeholder="ФИО"
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[140px]"
          />
          <input
            type="email"
            value={newTechnologist.email}
            onChange={(e) => setNewTechnologist({ ...newTechnologist, email: e.target.value })}
            placeholder="Email"
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[160px]"
          />
          <input
            type="password"
            value={newTechnologist.password}
            onChange={(e) => setNewTechnologist({ ...newTechnologist, password: e.target.value })}
            placeholder="Пароль (мин. 6)"
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[120px]"
          />
          <select
            value={newTechnologist.floor_id}
            onChange={(e) => setNewTechnologist({ ...newTechnologist, floor_id: e.target.value })}
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[140px]"
          >
            <option value="">Цех пошива</option>
            {floors.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <select
            value={newTechnologist.building_floor_id}
            onChange={(e) => setNewTechnologist({ ...newTechnologist, building_floor_id: e.target.value })}
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[140px]"
          >
            <option value="">Этаж</option>
            {buildingFloors.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={addingTechnologist || !newTechnologist.name?.trim() || !newTechnologist.email?.trim() || !newTechnologist.password || newTechnologist.password.length < 6 || !newTechnologist.floor_id || !newTechnologist.building_floor_id}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {addingTechnologist ? 'Добавление...' : 'Добавить'}
          </button>
        </form>
      )}

      {tab === 'sewers' && ['admin', 'manager'].includes(user?.role) && (
        <form onSubmit={handleAddSewer} className="mb-4 flex flex-wrap gap-2 items-end">
          <input
            type="text"
            value={newSewer.name}
            onChange={(e) => setNewSewer({ ...newSewer, name: e.target.value })}
            placeholder="ФИО"
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[140px]"
          />
          <input
            type="tel"
            value={newSewer.phone}
            onChange={(e) => setNewSewer({ ...newSewer, phone: e.target.value })}
            placeholder="Телефон"
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[140px]"
          />
          <select
            value={newSewer.technologist_id}
            onChange={(e) => setNewSewer({ ...newSewer, technologist_id: e.target.value })}
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[160px]"
          >
            <option value="">Технолог</option>
            {technologistsByFloor.map((t) => (
              <option key={t.id} value={t.id}>{t.User?.name || `ID ${t.id}`} — {t.Floor?.name || ''}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={addingSewer || !newSewer.name?.trim() || !newSewer.phone?.trim() || !newSewer.technologist_id}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {addingSewer ? 'Добавление...' : 'Добавить'}
          </button>
        </form>
      )}

      {tab === 'operations' && ['admin', 'manager'].includes(user?.role) && (
        <form onSubmit={handleAddOperation} className="mb-4 flex flex-wrap gap-2 items-end">
          <input
            type="text"
            value={newOperation.name}
            onChange={(e) => setNewOperation({ ...newOperation, name: e.target.value })}
            placeholder="Название операции"
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[180px]"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={newOperation.norm_minutes}
            onChange={(e) => setNewOperation({ ...newOperation, norm_minutes: e.target.value })}
            placeholder="Норма (мин)"
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[100px]"
          />
          <select
            value={newOperation.category}
            onChange={(e) => setNewOperation({ ...newOperation, category: e.target.value })}
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[140px]"
          >
            <option value="CUTTING">Раскрой</option>
            <option value="SEWING">Пошив</option>
            <option value="FINISH">Финиш</option>
          </select>
          <select
            value={newOperation.default_floor_id}
            onChange={(e) => setNewOperation({ ...newOperation, default_floor_id: e.target.value })}
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[140px]"
          >
            <option value="">Этаж по умолчанию</option>
            {buildingFloors.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-[#ECECEC] dark:text-dark-text cursor-pointer">
            <input
              type="checkbox"
              checked={newOperation.locked_to_floor}
              onChange={(e) => setNewOperation({ ...newOperation, locked_to_floor: e.target.checked })}
              className="rounded"
            />
            Привязан к этажу
          </label>
          <button
            type="submit"
            disabled={addingOperation || !newOperation.name?.trim() || newOperation.norm_minutes === ''}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {addingOperation ? 'Добавление...' : 'Добавить'}
          </button>
        </form>
      )}

      <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 dark:border-white/25 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
        ) : Array.isArray(data) && data.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/20 dark:border-white/20">
                {cols ? cols.map((c) => (
                  <th key={c.key} className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">
                    {c.label}
                  </th>
                )) : Object.keys(data[0]).filter((k) => !k.includes('_at')).map((k) => (
                  <th key={k} className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-b border-white/15 dark:border-white/15">
                  {cols ? cols.map((c) => (
                    <td key={c.key} className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">
                      {c.getValue ? c.getValue(row) : formatRowValue(c.key, row[c.key], row)}
                    </td>
                  )) : Object.entries(row)
                    .filter(([k]) => !k.includes('_at'))
                    .map(([k, v]) => (
                      <td key={k} className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">
                        {formatRowValue(k, v, row)}
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-[#ECECEC]/80 dark:text-dark-text/80">Нет данных</div>
        )}
      </div>
    </div>
  );
}
