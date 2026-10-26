import { localizeDigits } from '../i18n';
import { formatDuration } from '../domain/text/estimate';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return localizeDigits('0 KB');
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const text = `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
  return localizeDigits(text);
}

export function formatClock(ms: number): string {
  return localizeDigits(formatDuration(ms / 1000));
}

export function formatDate(iso: string, lng: string): string {
  try {
    return new Date(iso).toLocaleString(lng === 'bn' ? 'bn-BD' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}
