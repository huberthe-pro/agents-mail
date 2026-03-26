export function parseDateFilter(value: string | null, bound: 'start' | 'end'): number | null {
  if (!value) return null;

  if (/^\d+$/.test(value)) {
    return parseInt(value, 10);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const isoValue = bound === 'start'
      ? `${value}T00:00:00Z`
      : `${value}T23:59:59Z`;
    const timestamp = Date.parse(isoValue);
    return Number.isNaN(timestamp) ? null : Math.floor(timestamp / 1000);
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.floor(timestamp / 1000);
}
