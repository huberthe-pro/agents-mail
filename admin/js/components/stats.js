/**
 * Stats card component
 *
 * Usage:
 *   renderStatsCards('#stats-container', [
 *     { label: 'Total Agents', value: 42, color: 'cyan', sub: '+3 this week' },
 *   ]);
 */

function renderStatsCards(containerSelector, cards) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  container.innerHTML = cards.map(card => `
    <div class="stat-card stat-${card.color || 'cyan'}">
      <div class="stat-label">${escapeHtml(card.label)}</div>
      <div class="stat-value">${card.loading ? '<span class="spinner"></span>' : escapeHtml(String(card.value ?? '-'))}</div>
      ${card.sub ? `<div class="stat-sub">${escapeHtml(card.sub)}</div>` : ''}
    </div>
  `).join('');
}

function renderAnomalyAlerts(containerSelector, anomalies) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  if (!anomalies || anomalies.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = anomalies.map(a => `
    <div class="alert-banner">
      <span class="alert-icon">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18" style="color: var(--accent-amber);">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </span>
      <div>
        <div class="alert-title">${escapeHtml(a.agent_name || a.agent_email || 'Unknown Agent')}</div>
        <div class="alert-text">${escapeHtml(a.message || `${a.email_count || '?'} emails in the last ${a.window || '24h'}`)}</div>
      </div>
    </div>
  `).join('');
}
