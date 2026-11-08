/* Service worker do Painel da Vida: só recebe os avisos (não guarda cache). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Painel da Vida', {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const lista = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of lista) { if (c.url.startsWith(self.registration.scope)) { await c.focus(); try { await c.navigate(url); } catch (err) { /* ok */ } return; } }
    await self.clients.openWindow(url);
  })());
});
