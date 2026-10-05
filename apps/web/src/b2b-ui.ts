export type SavedViewItem = { id: string; name: string; filters: unknown };
export type NotificationItem = { id: string; readAt?: string | null };

export function getApiMessage(error: unknown, fallback = 'Une erreur est survenue.'): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
    return (error as any).message;
  }
  return fallback;
}

export function getFieldErrors(error: unknown): Record<string, string> {
  const fieldErrors = (error as any)?.data?.errors?.fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== 'object') return {};
  return Object.fromEntries(
    Object.entries(fieldErrors)
      .map(([field, messages]) => [field, Array.isArray(messages) ? messages.filter(Boolean).join(' ') : String(messages ?? '')])
      .filter(([, message]) => message),
  );
}

export const selectSavedView = (views: SavedViewItem[], id: string) =>
  views.find(view => view.id === id) ?? null;

export const renameSavedView = (views: SavedViewItem[], id: string, name: string) =>
  views.map(view => view.id === id ? { ...view, name } : view);

export const removeSavedView = (views: SavedViewItem[], id: string) =>
  views.filter(view => view.id !== id);

export const unreadCount = (items: NotificationItem[]) =>
  items.filter(item => !item.readAt).length;

export const markRead = <T extends NotificationItem>(items: T[], id: string, readAt = new Date().toISOString()) =>
  items.map(item => item.id === id ? { ...item, readAt } : item);

export const reportCompanyTitle = (company?: { clientName?: string; appDomain?: string }) =>
  [company?.clientName, company?.appDomain].filter(Boolean).join(' - ') || 'Rapport management';
