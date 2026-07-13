import type { AppNotification } from "./types";

export function markNotificationsRead(notifications: AppNotification[], ids?: string[]) {
  const targetIds = ids ? new Set(ids) : null;
  return notifications.map((notification) => (
    !targetIds || targetIds.has(notification.id)
      ? { ...notification, read: true }
      : notification
  ));
}
