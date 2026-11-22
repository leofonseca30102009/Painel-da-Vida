/* Service worker do Painel da Vida: recebe os avisos e permite instalar o app (não guarda cache). */
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
    // link de outro app (ex.: Negócios) abre na janela dele, sem trocar a do Painel
    if (url.startsWith(self.registration.scope)) for (const c of lista) { if (c.url.startsWith(self.registration.scope)) { await c.focus(); try { await c.navigate(url); } catch (err) { /* ok */ } return; } }
    await self.clients.openWindow(url);
  })());
});
// abrir o app pela tela inicial: sempre busca a versão nova; sem internet, mostra um aviso simples
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Painel da Vida</title><body style="font:16px system-ui;padding:40px 24px;text-align:center;color:#333"><h1 style="font-size:20px">Sem internet</h1><p>O Painel da Vida precisa de internet para abrir. Confira a conexão e tente de novo.</p><button onclick="location.reload()" style="font:inherit;padding:10px 18px;border-radius:12px;border:0;background:#0a6cff;color:#fff">Tentar de novo</button></body>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
