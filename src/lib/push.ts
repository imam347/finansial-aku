function decodeVapidKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export async function enablePushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { ok: false, message: "Browser ini belum mendukung push notification." };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, message: "Izin notifikasi belum diberikan." };

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return { ok: true, message: "Notifikasi perangkat diaktifkan dalam mode demo." };

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidKey(publicKey),
  });
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  return response.ok
    ? { ok: true, message: "Push notification berhasil diaktifkan." }
    : { ok: false, message: "Subscription gagal disimpan. Pastikan Anda sudah login." };
}
