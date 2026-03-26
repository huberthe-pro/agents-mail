/**
 * Agents page logic
 */

let agentsTable;

function initAgentsPage() {
  const searchInput = document.getElementById('agent-search');
  const statusFilter = document.getElementById('agent-status-filter');

  agentsTable = new DataTable({
    container: '#agents-table',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email', class: 'truncate font-mono', render: (v) => `<span style="font-size:12px">${escapeHtml(v)}</span>` },
      { key: 'owner_email', label: 'Owner', class: 'truncate' },
      { key: 'created_at', label: 'Created', render: (v) => formatDateShort(v) },
      {
        key: 'is_active',
        label: 'Status',
        render: (v) => v ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Inactive</span>',
      },
      {
        key: '_actions',
        label: '',
        render: (_, row) => `
          <div style="display:flex;gap:6px;justify-content:flex-end;">
            <button class="btn btn-ghost btn-toggle" data-id="${row.id}" data-active="${row.is_active ? 1 : 0}">
              ${row.is_active ? 'Deactivate' : 'Activate'}
            </button>
            <button class="btn btn-danger btn-delete" data-id="${row.id}" data-name="${escapeHtml(row.name || row.email)}">
              Delete
            </button>
          </div>
        `,
      },
    ],
    fetchData: async (page, limit) => {
      const params = { page, limit };
      if (searchInput.value.trim()) params.search = searchInput.value.trim();
      if (statusFilter.value) params.status = statusFilter.value;
      const res = await api.getAgents(params);
      return { data: res.agents || res.data || [], total: res.pagination?.total || res.total || 0 };
    },
    pageSize: 50,
    emptyMessage: 'No agents found.',
  });

  // Search with debounce
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => agentsTable.resetAndLoad(), 300);
  });

  statusFilter.addEventListener('change', () => agentsTable.resetAndLoad());

  // Delegate button clicks
  document.getElementById('agents-table').addEventListener('click', async (e) => {
    const toggleBtn = e.target.closest('.btn-toggle');
    const deleteBtn = e.target.closest('.btn-delete');

    if (toggleBtn) {
      const id = toggleBtn.dataset.id;
      const currentlyActive = toggleBtn.dataset.active === '1';
      const action = currentlyActive ? 'deactivate' : 'activate';

      try {
        await api.toggleAgent(id, !currentlyActive);
        showToast(`Agent ${action}d successfully`, 'success');
        agentsTable.reload();
      } catch (err) {
        showToast(`Failed to ${action} agent: ${err.message}`, 'error');
      }
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      const name = deleteBtn.dataset.name;
      const confirmed = await confirmAction(
        'Delete Agent',
        `Are you sure you want to delete "${name}"? This action cannot be undone.`
      );
      if (!confirmed) return;

      try {
        await api.deleteAgent(id);
        showToast('Agent deleted successfully', 'success');
        agentsTable.reload();
      } catch (err) {
        showToast('Failed to delete agent: ' + err.message, 'error');
      }
    }
  });

  agentsTable.load();
}

document.addEventListener('DOMContentLoaded', initAgentsPage);
