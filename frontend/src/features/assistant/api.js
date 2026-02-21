/**
 * API помощника (Analytics & Assistant)
 */

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
if (!import.meta.env.DEV && !import.meta.env.VITE_API_URL) {
  console.error('VITE_API_URL is not defined');
}

function getToken() {
  return sessionStorage.getItem('token');
}

/**
 * Отправить вопрос помощнику
 * @param {string} question - Текст вопроса
 * @returns {Promise<{type: string, data: Array, summary: string}>}
 */
export async function askAssistant(question) {
  const res = await fetch(`${API_URL}/api/assistant/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() && { Authorization: `Bearer ${getToken()}` }),
    },
    body: JSON.stringify({ question }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Ошибка ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
