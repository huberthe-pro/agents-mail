/**
 * Audit logs page logic
 */

let auditTable;

function initAuditPage() {
  const actionFilter = document.getElementById('audit-action-filter');
  const dateStart = document.getElementById('audit-date-start');
  const dateEnd = document.getElementById('audit-date-end');

  auditTable = new DataTable({
    container: '#audit-table',
    columns: [
      { key: 'created_at', label: 'Timestamp', render: (v) => formatDate(v) },
      { key: 'admin_email', label: 'Admin' },
      {
        key: 'action',
        label: 'Action',
        render: (v) => `<span class="badge" style="background:var(--accent-cyan-dim);color:var(--accent-cyan);">${escapeHtml(v)}</span>`,
      },
      { key: 'target', label: 'Target', class: 'truncate' },
      {
        key: 'details',
        label: 'Details',
        class: 'truncate',
        render: (v) => {
          if (!v) return '-';
          if (typeof v === 'object') return `<span class="font-mono" style="font-size:11px">${escapeHtml(JSON.stringify(v))}</span>`;
          return `<span style="font-size:12px">${escapeHtml(String(v))}</span>`;
        },
      },
    ],
    fetchData: async (page, limit) => {
      const params = { page, limit };
      if (actionFilter.value) params.action = actionFilter.value;
      if (dateStart.value) params.date_start = dateStart.value;
      if (dateEnd.value) params.date_end = dateEnd.value;
      const res = await api.getAuditLogs(params);
      return { data: res.logs || res.data || [], total: res.pagination?.total || res.total || 0 };
    },
    pageSize: 50,
    emptyMessage: 'No audit logs found.',
  });

  actionFilter.addEventListener('change', () => auditTable.resetAndLoad());
  dateStart.addEventListener('change', () => auditTable.resetAndLoad());
  dateEnd.addEventListener('change', () => auditTable.resetAndLoad());

  auditTable.load();
}

document.addEventListener('DOMContentLoaded', initAuditPage);
