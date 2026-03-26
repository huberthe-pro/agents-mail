/**
 * Emails page logic
 */

let emailsTable;

async function initEmailsPage() {
  const agentFilter = document.getElementById('email-agent-filter');
  const dateStart = document.getElementById('email-date-start');
  const dateEnd = document.getElementById('email-date-end');

  // Load anomalies
  try {
    const anomalyRes = await api.getAnomalies();
    const anomalies = anomalyRes?.anomalies || anomalyRes || [];
    renderAnomalyAlerts('#email-anomaly-alerts', anomalies);
  } catch (_) { /* non-critical */ }

  emailsTable = new DataTable({
    container: '#emails-table',
    columns: [
      { key: 'from_address', label: 'From', class: 'truncate font-mono', render: (v) => `<span style="font-size:12px">${escapeHtml(v)}</span>` },
      { key: 'to_address', label: 'To (Agent)', class: 'truncate font-mono', render: (v) => `<span style="font-size:12px">${escapeHtml(v)}</span>` },
      { key: 'subject', label: 'Subject', class: 'truncate', render: (v) => escapeHtml(v || '(no subject)') },
      { key: 'received_at', label: 'Received', render: (v) => formatDate(v) },
    ],
    fetchData: async (page, limit) => {
      const params = { page, limit };
      if (agentFilter.value.trim()) params.agent_id = agentFilter.value.trim();
      if (dateStart.value) params.date_start = dateStart.value;
      if (dateEnd.value) params.date_end = dateEnd.value;
      const res = await api.getEmails(params);
      return { data: res.emails || res.data || [], total: res.pagination?.total || res.total || 0 };
    },
    pageSize: 50,
    emptyMessage: 'No emails found.',
  });

  // Filters
  let filterTimeout;
  const applyFilters = () => {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => emailsTable.resetAndLoad(), 300);
  };

  agentFilter.addEventListener('input', applyFilters);
  dateStart.addEventListener('change', () => emailsTable.resetAndLoad());
  dateEnd.addEventListener('change', () => emailsTable.resetAndLoad());

  emailsTable.load();
}

document.addEventListener('DOMContentLoaded', initEmailsPage);
