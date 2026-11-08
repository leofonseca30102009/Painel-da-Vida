// Avisos do Painel da Vida (notificações push).
// - GET  ?pub        -> chave pública VAPID (para o navegador assinar os avisos)
// - POST {acao:"teste"} com o token do usuário -> manda um aviso de teste para os aparelhos dele
// - POST com o cabeçalho x-cron (chamado a cada minuto pelo pg_cron) -> manda lembretes,
//   tarefas com horário e a palavra da noite que chegaram na hora
// As chaves VAPID são criadas aqui mesmo na primeira vez e ficam só no banco (esquema privado).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const b64u = (buf: Uint8Array) => btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

type Cfg = { vapid_public: string | null; vapid_private: string | null; cron_key: string };
async function config(): Promise<Cfg> {
  let { data, error } = await sb.rpc('push_cfg'); if (error) throw error;
  if (!data.vapid_public) {
    const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', k.privateKey);
    const pub = new Uint8Array([4, ...deB64u(jwk.x!), ...deB64u(jwk.y!)]);
    await sb.rpc('push_cfg_set', { pub: b64u(pub), priv: jwk.d });
    ({ data, error } = await sb.rpc('push_cfg')); if (error) throw error;
  }
  return data as Cfg;
}

function agoraEm(tz: string) {
  let p: Intl.DateTimeFormatPart[];
  try { p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()); }
  catch { return agoraEm('America/Sao_Paulo'); }
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return { data: `${g('year')}-${g('month')}-${g('day')}`, hm: `${g('hour')}:${g('minute')}` };
}
const minutos = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);

type Sub = { endpoint: string; user_id: string; sub: webpush.PushSubscription; tz: string };
async function enviar(subs: Sub[], payload: Record<string, unknown>) {
  let ok = 0;
  for (const s of subs) {
    try { await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 3600, urgency: 'high' }); ok++; }
    catch (e) { const st = (e as { statusCode?: number }).statusCode; if (st === 404 || st === 410) await sb.from('push_subs').delete().eq('endpoint', s.endpoint); else console.error('push', st, (e as Error).message); }
  }
  return ok;
}

async function ciclo() {
  const { data: subs, error } = await sb.from('push_subs').select('endpoint,user_id,sub,tz'); if (error) throw error;
  const porUser = new Map<string, Sub[]>(); (subs as Sub[] || []).forEach((s) => { const l = porUser.get(s.user_id) || []; l.push(s); porUser.set(s.user_id, l); });
  let total = 0;
  for (const [uid, lista] of porUser) {
    const now = agoraEm(lista[0].tz || 'America/Sao_Paulo'); const agora = minutos(now.hm);
    const { data: ds } = await sb.from('docs').select('colecao,id,data').eq('user_id', uid).in('colecao', ['lembretes', 'tarefas']).eq('data->>data', now.data);
    const { data: av } = await sb.from('docs').select('id').eq('user_id', uid).eq('colecao', 'avisos').like('id', `%_${now.data}`);
    const ja = new Set((av || []).map((x: { id: string }) => x.id));
    const marcar = async (id: string) => { await sb.from('docs').upsert({ user_id: uid, colecao: 'avisos', id, data: { em: Date.now() } }, { onConflict: 'user_id,colecao,id' }); };
    for (const d of (ds || []) as { colecao: string; id: string; data: Record<string, unknown> }[]) {
      const x = d.data; const hora = typeof x.hora === 'string' ? x.hora : null;
      if (!hora || x.feito || x.apagada) continue;
      const atraso = agora - minutos(hora); if (atraso < 0 || atraso > 10) continue;
      const aid = `${d.colecao}-${d.id}_${now.data}`; if (ja.has(aid)) continue;
      await marcar(aid); ja.add(aid);
      const lembrete = d.colecao === 'lembretes';
      total += await enviar(lista, { title: lembrete ? '⏰ Lembrete' : `Agora: ${hora}`, body: String(lembrete ? x.texto : x.titulo), tag: aid, url: './#' + (lembrete ? 'resumo' : 'tarefas') });
    }
    // palavra da noite às 21h, se ainda não leu
    const aid = `palavra_${now.data}`;
    if (agora >= minutos('21:00') && agora <= minutos('21:10') && !ja.has(aid)) {
      const { data: lida } = await sb.from('docs').select('id').eq('user_id', uid).eq('colecao', 'biblia').eq('id', now.data).maybeSingle();
      await marcar(aid);
      if (!lida) total += await enviar(lista, { title: '📖 Palavra da noite', body: 'Sem tempo para ler a Bíblia? Aqui está a palavra de hoje.', tag: aid, url: './#resumo' });
    }
  }
  return total;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const cfg = await config();
    webpush.setVapidDetails('mailto:avisos@painel-da-vida.app', cfg.vapid_public!, cfg.vapid_private!);
    if (req.method === 'GET') return json({ pub: cfg.vapid_public });
    if (req.headers.get('x-cron')) {
      if (req.headers.get('x-cron') !== cfg.cron_key) return json({ erro: 'proibido' }, 403);
      return json({ enviados: await ciclo() });
    }
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await sb.auth.getUser(token); if (!u || !u.user) return json({ erro: 'entre na sua conta' }, 401);
    const body = await req.json().catch(() => ({}));
    if (body.acao === 'teste') {
      const { data: subs } = await sb.from('push_subs').select('endpoint,user_id,sub,tz').eq('user_id', u.user.id);
      const n = await enviar((subs || []) as Sub[], { title: 'Painel da Vida', body: 'Pronto! Os avisos estão funcionando neste aparelho. 🙌', tag: 'teste', url: './#resumo' });
      return json({ enviados: n });
    }
    return json({ erro: 'ação desconhecida' }, 400);
  } catch (e) { console.error(e); return json({ erro: (e as Error).message }, 500); }
});
