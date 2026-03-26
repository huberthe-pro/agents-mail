/**
 * Users page logic
 */

let usersTable;

function initUsersPage() {
  const searchInput = document.getElementById('user-search');

  usersTable = new DataTable({
    container: '#users-table',
    columns: [
      { key: 'email', label: 'Email', class: 'truncate' },
      { key: 'display_name', label: 'Display Name' },
      { key: 'created_at', label: 'Created', render: (v) => formatDateShort(v) },
      {
        key: 'is_active',
        label: 'Status',
        render: (v) => {
          if (v === 0) return '<span class="badge badge-banned">Banned</span>';
          return '<span class="badge badge-active">Active</span>';
        },
      },
      {
        key: '_actions',
        label: '',
        render: (_, row) => {
          const isBanned = row.is_active === 0;
          return `
            <div style="display:flex;gap:6px;justify-content:flex-end;">
              <button class="btn ${isBanned ? 'btn-ghost' : 'btn-danger'} btn-ban" data-id="${row.id}" data-active="${row.is_active ? 1 : 0}">
                ${isBanned ? 'Unban' : 'Ban'}
              </button>
            </div>
          `;
        },
      },
    ],
    fetchData: async (page, limit) => {
      const params = { page, limit };
      if (searchInput.value.trim()) params.search = searchInput.value.trim();
      const res = await api.getUsers(params);
      return { data: res.users || res.data || [], total: res.pagination?.total || res.total || 0 };
    },
    pageSize: 50,
    emptyMessage: 'No users found.',
  });

  // Search with debounce
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => usersTable.resetAndLoad(), 300);
  });

  // Delegate button clicks
  document.getElementById('users-table').addEventListener('click', async (e) => {
    const banBtn = e.target.closest('.btn-ban');
    if (!banBtn) return;

    const id = banBtn.dataset.id;
    const currentlyActive = banBtn.dataset.active === '1';
    const action = currentlyActive ? 'ban' : 'unban';

    const confirmed = await confirmAction(
      `${currentlyActive ? 'Ban' : 'Unban'} User`,
      `Are you sure you want to ${action} this user?`
    );
    if (!confirmed) return;

    try {
      await api.toggleUser(id, !currentlyActive);
      showToast(`User ${action}ned successfully`, 'success');
      usersTable.reload();
    } catch (err) {
      showToast(`Failed to ${action} user: ${err.message}`, 'error');
    }
  });

  usersTable.load();
}

document.addEventListener('DOMContentLoaded', initUsersPage);
