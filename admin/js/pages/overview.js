/**
 * Overview page logic
 */

async function initOverviewPage() {
  // Show loading state
  renderStatsCards('#stats-grid', [
    { label: 'Total Agents', color: 'cyan', loading: true },
    { label: 'Total Users', color: 'green', loading: true },
    { label: 'Emails Received (24h)', color: 'amber', loading: true },
    { label: 'Emails Sent (24h)', color: 'red', loading: true },
  ]);

  try {
    const [stats, anomalies] = await Promise.all([
      api.getStats(),
      api.getAnomalies(),
    ]);

    renderStatsCards('#stats-grid', [
      {
        label: 'Total Agents',
        value: stats.agents?.total ?? '-',
        color: 'cyan',
        sub: stats.agents?.active != null ? `${stats.agents.active} active` : undefined,
      },
      {
        label: 'Total Users',
        value: stats.users?.total ?? '-',
        color: 'green',
        sub: stats.users?.active != null ? `${stats.users.active} active` : undefined,
      },
      {
        label: 'Emails Received (24h)',
        value: stats.emails?.received_24h ?? '-',
        color: 'amber',
      },
      {
        label: 'Emails Sent (24h)',
        value: stats.emails?.sent_24h ?? '-',
        color: 'red',
      },
    ]);

    renderAnomalyAlerts('#anomaly-alerts', anomalies?.anomalies || anomalies || []);

  } catch (err) {
    showToast('Failed to load dashboard stats: ' + err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', initOverviewPage);
