// Variable: API-Helfer fuer fetch-Aufrufe mit JWT-Token.

/**
 * Fuehrt einen API-Aufruf mit Authorization-Header aus.
 * @param {string} url
 * @param {object} opts { method, body, token, ... }
 * @returns {Promise<object>}
 */
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}

export async function apiFetch(url, opts = {}) {
  const { method = 'GET', body = null, token = null, headers = {} } = opts;

  const fetchHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (token) {
    fetchHeaders['Authorization'] = `Bearer ${token}`;
  }

  const fetchOpts = {
    method,
    headers: fetchHeaders,
  };

  if (body && method !== 'GET') {
    fetchOpts.body = JSON.stringify(body);
  }

  const response = await fetch(apiUrl(url), fetchOpts);

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: `HTTP ${response.status}` };
    }
    throw new Error(errorData.error || errorData.errors?.join(', ') || `Fehler: ${response.status}`);
  }

  return response.json();
}
