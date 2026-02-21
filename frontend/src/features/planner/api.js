/**
 * API планировщика (Planner)
 */

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
if (!import.meta.env.DEV && !import.meta.env.VITE_API_URL) {
  console.error('VITE_API_URL is not defined');
}

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() && { Authorization: `Bearer ${getToken()}` }),
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    const err = new Error(data.error || `Ошибка ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * @param {{ days?: number, limit?: number }} params
 */
export async function getPriority(params = {}) {
  const q = new URLSearchParams();
  if (params.days != null) q.set('days', params.days);
  if (params.limit != null) q.set('limit', params.limit);
  return request(`/api/planner/priority${q.toString() ? `?${q}` : ''}`);
}

/**
 * @param {{ days?: number }} params
 */
export async function getBottleneckMap(params = {}) {
  const q = new URLSearchParams();
  if (params.days != null) q.set('days', params.days);
  return request(`/api/planner/bottleneck-map${q.toString() ? `?${q}` : ''}`);
}

/**
 * @param {{ days?: number }} params
 */
export async function getRecommendations(params = {}) {
  const q = new URLSearchParams();
  if (params.days != null) q.set('days', params.days);
  return request(`/api/planner/recommendations${q.toString() ? `?${q}` : ''}`);
}
