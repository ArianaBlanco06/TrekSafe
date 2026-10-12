const PREFIJO = 'treksafe-reminder-dismissed-';

export function isReminderDismissed(expedicionId: string): boolean {
  try {
    return sessionStorage.getItem(`${PREFIJO}${expedicionId}`) === '1';
  } catch {
    return false;
  }
}

export function dismissReminder(expedicionId: string): void {
  try {
    sessionStorage.setItem(`${PREFIJO}${expedicionId}`, '1');
  } catch {
    /* ignore */
  }
}

export function clearReminderDismissal(expedicionId: string): void {
  try {
    sessionStorage.removeItem(`${PREFIJO}${expedicionId}`);
  } catch {
    /* ignore */
  }
}
