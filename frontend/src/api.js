/**
 * API клиент для backend
 */

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
if (!import.meta.env.DEV && !import.meta.env.VITE_API_URL) {
  console.error('VITE_API_URL is not defined');
}

function getToken() {
  return sessionStorage.getItem('token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    mode: "cors",
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      window.location.href = '/login';
    }
    const errMsg = data.error || `Ошибка ${res.status}`;
    const err = new Error(errMsg);
    err.status = res.status;
    err.details = data.stack || data.details;
    err.problematic = data.problematic;
    throw err;
  }

  return data;
}

export const api = {
  dashboard: {
    summary: () => request('/api/dashboard/summary'),
  },
  auth: {
    login: (email, password) =>
      request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
  },
  orders: {
    byWorkshop: (workshopId) =>
      request(`/api/orders/by-workshop?workshop_id=${workshopId}`),
    list: (params) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/orders${q ? `?${q}` : ''}`);
    },
    get: (id) => request(`/api/orders/${id}`),
    create: (data) =>
      request('/api/orders', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) =>
      request(`/api/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) =>
      request(`/api/orders/${id}`, { method: 'DELETE' }),
    complete: (id) => request(`/api/orders/${id}/complete`, { method: 'POST' }),
    updateOperationActual: (orderId, opId, actualQuantity) =>
      request(`/api/orders/${orderId}/operations/${opId}/actual`, {
        method: 'PUT',
        body: JSON.stringify({ actual_quantity: actualQuantity }),
      }),
    addPhoto: (id, photo) =>
      request(`/api/orders/${id}/photos`, {
        method: 'POST',
        body: JSON.stringify({ photo }),
      }),
    deletePhoto: (id, index) =>
      request(`/api/orders/${id}/photos/${index}`, { method: 'DELETE' }),
  },
  planning: {
    assign: (data) =>
      request('/api/planning/assign', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateOperation: (id, data) =>
      request(`/api/planning/operations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    day: (date) => request(`/api/planning/day?date=${date}`),
    week: (from, to) => request(`/api/planning/week?from=${from}&to=${to}`),
    month: (month) => request(`/api/planning/month?month=${month}`),
    floors: (workshopId) =>
      request(`/api/planning/floors?workshop_id=${workshopId}`),
    table: (params) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/planning/table?${q}`);
    },
    modelTable: (params) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/planning/model-table?${q}`);
    },
    updateDay: (data) =>
      request('/api/planning/day', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    cuttingSummary: (orderId) =>
      request(`/api/planning/cutting-summary?order_id=${orderId}`),
    calcCapacity: (data) =>
      request('/api/planning/calc-capacity', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    applyCapacity: (data) =>
      request('/api/planning/apply-capacity', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    flowCalc: (data) =>
      request('/api/planning/flow/calc', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    flowApplyAuto: (data) =>
      request('/api/planning/flow/apply-auto', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  orderOperations: {
    floorTasks: (floorId) =>
      request(`/api/order-operations/floor-tasks?floor_id=${floorId}`),
    updateStatus: (id, status) =>
      request(`/api/order-operations/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
    updateVariants: (id, variants) =>
      request(`/api/order-operations/${id}/variants`, {
        method: 'PUT',
        body: JSON.stringify({ variants }),
      }),
    complete: (id) =>
      request(`/api/order-operations/${id}/complete`, { method: 'POST' }),
    updateFloor: (id, floorId) =>
      request(`/api/order-operations/${id}/floor`, {
        method: 'PUT',
        body: JSON.stringify({ floor_id: floorId }),
      }),
  },
  reports: {
    daily: (date) => request(`/api/reports/daily?date=${date}`),
    weekly: (from, to) => request(`/api/reports/weekly?from=${from}&to=${to}`),
    monthly: (month) => request(`/api/reports/monthly?month=${month}`),
    planFact: (from, to) =>
      request(`/api/reports/plan-fact?from=${from}&to=${to}`),
    v2: {
      kpi: (params) =>
        request(`/api/reports/v2/kpi?${new URLSearchParams(params)}`),
      floors: (params) =>
        request(`/api/reports/v2/floors?${new URLSearchParams(params)}`),
      technologists: (params) =>
        request(`/api/reports/v2/technologists?${new URLSearchParams(params)}`),
      sewers: (params) =>
        request(`/api/reports/v2/sewers?${new URLSearchParams(params)}`),
      ordersLate: (params) =>
        request(`/api/reports/v2/orders-late?${new URLSearchParams(params)}`),
      planFact: (params) =>
        request(`/api/reports/v2/plan-fact?${new URLSearchParams(params)}`),
      exportCsv: async (params) => {
        const q = new URLSearchParams(params).toString();
        const token = sessionStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/reports/v2/export.csv?${q}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(await res.text());
        return res.blob();
      },
    },
  },
  settings: {
    deleteAllOrders: () =>
      request('/api/settings/delete-all-orders', { method: 'POST' }),
  },
  ai: {
    query: (query) =>
      request('/api/ai/query', {
        method: 'POST',
        body: JSON.stringify({ query }),
      }),
  },
  finance: {
    bdr2026: () => request('/api/finance/2026/bdr'),
    bdds2026: () => request('/api/finance/2026/bdds'),
    updatePlan: (data) =>
      request('/api/finance/plan', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    addFact: (data) =>
      request('/api/finance/fact', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  procurement: {
    get: (orderId) => request(`/api/procurement?order_id=${orderId}`),
    getAwaiting: () => request('/api/procurement?awaiting=1'),
    list: () => request('/api/procurement?list=1'),
    addItem: (requestId, data) =>
      request(`/api/procurement/${requestId}/items`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateItem: (itemId, data) =>
      request(`/api/procurement/items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteItem: (itemId) =>
      request(`/api/procurement/items/${itemId}`, { method: 'DELETE' }),
    updateStatus: (requestId, status) =>
      request(`/api/procurement/${requestId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
  },
  cutting: {
    tasks: (cuttingType) =>
      request(`/api/cutting/tasks${cuttingType ? `?cutting_type=${encodeURIComponent(cuttingType)}` : ''}`),
    addTask: (data) =>
      request('/api/cutting/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateTask: (id, data) =>
      request(`/api/cutting/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteTask: (id) =>
      request(`/api/cutting/tasks/${id}`, { method: 'DELETE' }),
  },
  warehouse: {
    items: () => request('/api/warehouse/items'),
    addItem: (data) =>
      request('/api/warehouse/items', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    addMovement: (data) =>
      request('/api/warehouse/movements', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    movements: (params) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/warehouse/movements${q ? `?${q}` : ''}`);
    },
  },
  sizes: {
    list: () => request('/api/sizes'),
    add: (name) =>
      request('/api/sizes', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
  },
  workshops: {
    list: () => request('/api/workshops'),
  },
  references: {
    floors: (limit) =>
      request(`/api/references/floors${limit ? `?limit=${limit}` : ''}`),
    buildingFloors: (limit) =>
      request(`/api/references/building-floors${limit ? `?limit=${limit}` : ''}`),
    addBuildingFloor: (name) =>
      request('/api/references/building-floors', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    addFloor: (name) =>
      request('/api/references/floors', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    colors: (search) =>
      request(`/api/references/colors${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    addColor: (name) =>
      request('/api/references/colors', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    clients: () => request('/api/references/clients'),
    addClient: (name) =>
      request('/api/references/clients', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    operations: () => request('/api/references/operations'),
    addOperation: (data) =>
      request('/api/references/operations', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deleteOperation: (id) =>
      request(`/api/references/operations/${id}`, { method: 'DELETE' }),
    orderStatus: () => request('/api/references/order-status'),
    technologists: (floorId, all, buildingFloorId) =>
      request(
        `/api/references/technologists${buildingFloorId ? `?building_floor_id=${buildingFloorId}${all ? '&all=1' : ''}` : floorId ? `?floor_id=${floorId}${all ? '&all=1' : ''}` : ''}`
      ),
    addTechnologist: (data) =>
      request('/api/references/technologists', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    sewers: (technologistId) =>
      request(
        `/api/references/sewers${technologistId ? `?technologist_id=${technologistId}` : ''}`
      ),
    addSewer: (data) =>
      request('/api/references/sewers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    cuttingTypes: (all) =>
      request(`/api/references/cutting-types${all ? '?all=1' : ''}`),
    addCuttingType: (name) =>
      request('/api/references/cutting-types', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    updateCuttingType: (id, data) =>
      request(`/api/references/cutting-types/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteCuttingType: (id) =>
      request(`/api/references/cutting-types/${id}`, { method: 'DELETE' }),
  },
};
