// Anotar pela Siri: o atalho do iPhone manda o que a pessoa falou e vira um lembrete no Painel da Vida.
// POST ?k=CHAVE  com {"texto": "..."} (ou formulário, ou ?t=...). A chave é guardada só como hash em public.siri_tokens.
// Entende "hoje", "amanhã", "depois de amanhã", dias da semana, "dia 25", "25/11" e horas como "às 15h", "15:30",
// "3 da tarde", "9 da manhã", "meio-dia". Responde em texto curto para a Siri ler em voz alta.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const TZ = 'America/Sao_Paulo';
const txt = (s: string, status = 200) => new Response(s, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
const novoId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const agoraHM = () => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
const addDias = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const diaSemana = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const NUM: Record<string, number> = { uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12 };
const SEM: [RegExp, number][] = [[/\bdomingo\b/, 0], [/\bsegunda(-feira)?\b/, 1], [/\bterca(-feira)?\b/, 2], [/\bquarta(-feira)?\b/, 3], [/\bquinta(-feira)?\b/, 4], [/\bsexta(-feira)?\b/, 5], [/\bsabado\b/, 6]];
const NOME_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

// tira do texto as partes de data e hora e devolve o que sobrou
function entender(original: string) {
  let t = ' ' + original.trim() + ' '; let n = semAcento(t);
  const H = hoje(); let data: string | null = null; let hora: string | null = null;
  const corta = (re: RegExp) => { const m = re.exec(n); if (!m) return null; t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length); n = n.slice(0, m.index) + ' ' + n.slice(m.index + m[0].length); return m; };
  // data
  let m: RegExpExecArray | null;
  if (corta(/\b(para |pra )?depois de amanha\b/)) data = addDias(H, 2);
  else if (corta(/\b(para |pra )?amanha\b/)) data = addDias(H, 1);
  else if (corta(/\b(para |pra )?hoje\b/)) data = H;
  if (!data && (m = corta(/\b(no |na |dia |para o dia |pra dia )?(\d{1,2})\/(\d{1,2})(\/\d{2,4})?\b/))) {
    const [y] = H.split('-'); let d = `${y}-${m[3].padStart(2, '0')}-${m[2].padStart(2, '0')}`; if (d < H) d = `${+y + 1}${d.slice(4)}`; data = d;
  }
  if (!data && (m = corta(/\b(no |para o |pro |pra )?dia (\d{1,2})\b/))) {
    const dd = +m[2]; let [y, mo] = H.split('-').map(Number); if (dd < +H.slice(8)) { mo++; if (mo > 12) { mo = 1; y++; } } data = `${y}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  if (!data) for (const [re, wd] of SEM) {
    const r = new RegExp('\\b(na |no |nessa |nesta |proxima |para |pra )*' + re.source.replace(/^\\b/, ''));
    if ((m = corta(r))) { let k = (wd - diaSemana(H) + 7) % 7; if (k === 0) k = 7; data = addDias(H, k); break; }
  }
  // hora
  if (corta(/\b(ao |as |a )?meio[- ]dia\b/)) hora = '12:00';
  else if (corta(/\b(a )?meia[- ]noite\b/)) hora = '00:00';
  if (!hora && (m = corta(/\b(as |a |la pelas |pelas )?(\d{1,2})(?:[:h](\d{2}))?\s*(?:h|horas?)?\s*(da manha|da tarde|da noite)\b/))) {
    let h = +m[2]; const mi = m[3] ? +m[3] : 0; if (m[4] !== 'da manha' && h < 12) h += 12; if (m[4] === 'da noite' && h === 24) h = 0; hora = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  }
  if (!hora && (m = corta(/\b(as |a |la pelas |pelas )?(uma|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)( e meia)?\s*(da manha|da tarde|da noite)\b/))) {
    let h = NUM[m[2]]; if (m[4] !== 'da manha' && h < 12) h += 12; hora = `${String(h).padStart(2, '0')}:${m[3] ? '30' : '00'}`;
  }
  if (!hora && (m = corta(/\b(as |a |pelas )?(\d{1,2})[:h](\d{2})\b/))) { const h = +m[2]; if (h < 24) hora = `${String(h).padStart(2, '0')}:${m[3]}`; }
  if (!hora && (m = corta(/\b(as |a |pelas )(\d{1,2})\s*(h|horas?)?\b/)) ) { const h = +m[2]; if (h < 24) hora = `${String(h).padStart(2, '0')}:00`; }
  if (!hora && (m = corta(/\b(\d{1,2})\s*(h|horas)\b/))) { const h = +m[1]; if (h < 24) hora = `${String(h).padStart(2, '0')}:00`; }
  if (!data) data = hora && hora <= agoraHM() ? addDias(H, 1) : H;
  // limpa o texto
  let texto = t.replace(/\s{2,}/g, ' ').trim()
    .replace(/^(me )?(lembra(r)?|lembre|anota(r)?|anote|adiciona(r)?|coloca(r)?|cria(r)?|crie)( de| que| pra| para| um| uma| lembrete( de)?| tarefa( de)?| no painel| ai)*[:,]?\s*/i, '')
    .replace(/[\s,.;:-]+(para|pra|no|na|as|a|de)$/i, '').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '').trim();
  if (texto) texto = texto.charAt(0).toUpperCase() + texto.slice(1);
  return { texto: texto.slice(0, 140), data, hora };
}

function falar(d: string, hora: string | null) {
  const H = hoje(); const q = d === H ? 'hoje' : d === addDias(H, 1) ? 'amanhã' : d === addDias(H, 2) ? 'depois de amanhã' : `${NOME_DIA[diaSemana(d)]}, dia ${+d.slice(8)}`;
  return q + (hora ? ` às ${hora.replace(':00', 'h').replace(':', 'h')}` : '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' } });
  try {
    const u = new URL(req.url); const k = u.searchParams.get('k') || '';
    if (k.length < 20) return txt('Link do atalho inválido. No Painel, abra o menu, Anotar por voz, e copie o link de novo.', 401);
    const h = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(k)));
    const { data: tk } = await sb.from('siri_tokens').select('user_id').eq('token_hash', h).maybeSingle();
    if (!tk) return txt('Link do atalho inválido. No Painel, abra o menu, Anotar por voz, e copie o link de novo.', 401);
    let bruto = u.searchParams.get('t') || '';
    if (!bruto && req.method === 'POST') {
      const ct = req.headers.get('content-type') || ''; const corpo = await req.text();
      if (ct.includes('json')) { try { const j = JSON.parse(corpo); bruto = String(j.texto ?? j.text ?? j.t ?? ''); } catch { bruto = corpo; } }
      else if (ct.includes('form')) { bruto = new URLSearchParams(corpo).get('texto') || ''; }
      else bruto = corpo;
    }
    bruto = bruto.trim().slice(0, 500);
    if (!bruto) return txt('Não entendi o que anotar. Tente de novo.', 400);
    const { texto, data, hora } = entender(bruto);
    if (!texto) return txt('Não entendi o que anotar. Tente de novo.', 400);
    await sb.from('docs').upsert({ user_id: tk.user_id, colecao: 'lembretes', id: novoId(), data: { texto, data, hora, feito: false, criado: Date.now(), origem: 'siri' } }, { onConflict: 'user_id,colecao,id' });
    sb.from('siri_tokens').update({ ultimo_uso: new Date().toISOString() }).eq('token_hash', h).then(() => {});
    return txt(`Anotado: ${texto}, ${falar(data, hora)}.`);
  } catch (e) { console.error(e); return txt('Não consegui anotar agora. Tente de novo em instantes.', 500); }
});
