/**
 * API client for Admin Dashboard
 * All requests include credentials for Cloudflare Zero Trust cookies.
 */

// Same-origin: admin frontend is served from /admin/ on the same Worker domain
const API_BASE = window.location.origin;

class ApiClient {
  constructor(base) {
    this.base = base;
  }

  async request(path, options = {}) {
    const url = new URL(path, this.base);

    if (options.params) {
      Object.entries(options.params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          url.searchParams.set(k, v);
        }
      });
      delete options.params;
    }

    const config = {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    const res = await fetch(url.toString(), config);

    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        message = body.error || body.message || message;
      } catch (_) { /* ignore parse error */ }
      throw new Error(message);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  // ---- Stats ----
  getStats() {
    return this.request('/api/admin/stats');
  }

  // ---- Agents ----
  getAgents(params = {}) {
    return this.request('/api/admin/agents', { params });
  }

  toggleAgent(id, isActive) {
    return this.request(`/api/admin/agents/${id}`, {
      method: 'PATCH',
      body: { is_active: isActive ? 1 : 0 },
    });
  }

  deleteAgent(id) {
    return this.request(`/api/admin/agents/${id}`, { method: 'DELETE' });
  }

  // ---- Users ----
  getUsers(params = {}) {
    return this.request('/api/admin/users', { params });
  }

  toggleUser(id, isActive) {
    return this.request(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: { is_active: isActive ? 1 : 0 },
    });
  }

  // ---- Emails ----
  getEmails(params = {}) {
    return this.request('/api/admin/emails', { params });
  }

  getAnomalies() {
    return this.request('/api/admin/emails/anomalies');
  }

  // ---- Audit ----
  getAuditLogs(params = {}) {
    return this.request('/api/admin/audit', { params });
  }
}

const api = new ApiClient(API_BASE);
