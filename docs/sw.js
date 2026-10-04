// ============================================================================
// Service worker — only for phone reminders (Web Push).
//
// Deliberately does NOT cache anything or intercept page loads, so the
// always-fresh loader in index.html keeps working exactly as before.
// ============================================================================
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: "TNBBI", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(data.title || "TNBBI", {
    body: data.body || "",
    icon: "brand/icon-192.png",
    badge: "brand/favicon.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || "/" },
  }));
});

// Tapping the notification: bring the site forward on the right page — the
// open copy if there is one, otherwise a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of open) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        client.postMessage({ type: "tnbbi-open", url });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
