/**
 * Reusable data table with pagination
 *
 * Usage:
 *   const table = new DataTable({
 *     container: '#my-table',
 *     columns: [
 *       { key: 'name', label: 'Name' },
 *       { key: 'email', label: 'Email', class: 'truncate' },
 *       { key: 'status', label: 'Status', render: (val) => badgeHtml(val) },
 *       { key: '_actions', label: '', render: (_, row) => actionsHtml(row) },
 *     ],
 *     fetchData: async (page, limit) => {
 *       return { data: [], total: 0 };
 *     },
 *     pageSize: 50,
 *     emptyMessage: 'No records found',
 *   });
 *   table.load();
 */

class DataTable {
  constructor(options) {
    this.container = typeof options.container === 'string'
      ? document.querySelector(options.container)
      : options.container;
    this.columns = options.columns || [];
    this.fetchData = options.fetchData;
    this.pageSize = options.pageSize || 50;
    this.emptyMessage = options.emptyMessage || 'No records found.';
    this.onRowClick = options.onRowClick || null;

    this.page = 1;
    this.total = 0;
    this.data = [];
    this.loading = false;

    this._render();
  }

  _render() {
    const colHeads = this.columns
      .map(c => `<th>${escapeHtml(c.label)}</th>`)
      .join('');

    this.container.innerHTML = `
      <table>
        <thead><tr>${colHeads}</tr></thead>
        <tbody></tbody>
      </table>
      <div class="pagination">
        <span class="pagination-info"></span>
        <div class="pagination-buttons">
          <button class="btn btn-ghost btn-prev" disabled>Previous</button>
          <button class="btn btn-ghost btn-next" disabled>Next</button>
        </div>
      </div>
    `;

    this.tbody = this.container.querySelector('tbody');
    this.info = this.container.querySelector('.pagination-info');
    this.btnPrev = this.container.querySelector('.btn-prev');
    this.btnNext = this.container.querySelector('.btn-next');

    this.btnPrev.addEventListener('click', () => this.prevPage());
    this.btnNext.addEventListener('click', () => this.nextPage());
  }

  async load() {
    this.loading = true;
    this._showLoading();

    try {
      const result = await this.fetchData(this.page, this.pageSize);
      this.data = result.data || [];
      this.total = result.total || 0;
      this._renderRows();
      this._updatePagination();
    } catch (err) {
      this.tbody.innerHTML = `<tr><td colspan="${this.columns.length}" class="loading-row" style="color: var(--accent-red);">Error: ${escapeHtml(err.message)}</td></tr>`;
      showToast(err.message, 'error');
    } finally {
      this.loading = false;
    }
  }

  _showLoading() {
    this.tbody.innerHTML = `
      <tr class="loading-row">
        <td colspan="${this.columns.length}">
          <span class="spinner"></span>
          <span style="margin-left: 8px; color: var(--text-muted);">Loading...</span>
        </td>
      </tr>
    `;
  }

  _renderRows() {
    if (this.data.length === 0) {
      this.tbody.innerHTML = `
        <tr>
          <td colspan="${this.columns.length}">
            <div class="empty-state">
              <p>${escapeHtml(this.emptyMessage)}</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    this.tbody.innerHTML = this.data.map((row, idx) => {
      const cells = this.columns.map(col => {
        const val = col.key === '_actions' ? null : row[col.key];
        const content = col.render ? col.render(val, row, idx) : escapeHtml(String(val ?? ''));
        const cls = col.class ? ` class="${col.class}"` : '';
        return `<td${cls}>${content}</td>`;
      }).join('');

      const clickAttr = this.onRowClick ? ' style="cursor:pointer;"' : '';
      return `<tr data-idx="${idx}"${clickAttr}>${cells}</tr>`;
    }).join('');

    if (this.onRowClick) {
      this.tbody.querySelectorAll('tr').forEach(tr => {
        tr.addEventListener('click', (e) => {
          // Don't fire row click if a button/link was clicked
          if (e.target.closest('button, a')) return;
          const idx = parseInt(tr.dataset.idx);
          this.onRowClick(this.data[idx], idx);
        });
      });
    }
  }

  _updatePagination() {
    const totalPages = Math.max(1, Math.ceil(this.total / this.pageSize));
    const start = this.total === 0 ? 0 : (this.page - 1) * this.pageSize + 1;
    const end = Math.min(this.page * this.pageSize, this.total);

    this.info.textContent = `${start}-${end} of ${this.total}`;
    this.btnPrev.disabled = this.page <= 1;
    this.btnNext.disabled = this.page >= totalPages;
  }

  nextPage() {
    const totalPages = Math.ceil(this.total / this.pageSize);
    if (this.page < totalPages) {
      this.page++;
      this.load();
    }
  }

  prevPage() {
    if (this.page > 1) {
      this.page--;
      this.load();
    }
  }

  goToPage(p) {
    this.page = p;
    this.load();
  }

  reload() {
    this.load();
  }

  resetAndLoad() {
    this.page = 1;
    this.load();
  }
}
