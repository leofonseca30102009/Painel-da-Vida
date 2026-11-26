// Lógica pura de "mudar a rotina daqui pra frente" (sem acesso ao banco, para poder testar).
// Uma tarefa fixa vale para todos os dias seguintes. Ela pode ter vigência: `de` (primeiro dia) e `ate` (último dia).
// Mudar "a partir de X": a fixa antiga termina em X-1 e a nova começa em X. Nada do passado é reescrito.

export type Fixa = { titulo: string; hora?: string | null; dias: number[]; area?: string | null; de?: string; ate?: string };
export type Doc = { id: string; data: Record<string, any> };
export type Ops = {
  adicionar?: { titulo?: string; hora?: string | null; dias?: number[]; area?: string }[];
  remover?: string[];
  alterar?: { titulo?: string; novo_titulo?: string; hora?: string | null; dias?: number[]; area?: string }[];
};

const addDias = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const diaSemana = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
const perDeHora = (h?: string | null) => { if (!h) return 'Manhã'; const n = +h.slice(0, 2); return n < 12 ? 'Manhã' : n < 18 ? 'Tarde' : 'Noite'; };
const okHora = (h?: string | null) => (h && /^\d{1,2}:\d{2}$/.test(h) ? h.padStart(5, '0') : null);
const norm = (t: unknown) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
// igual ao slug do app (index.html), porque o id da tarefa fixa usa ele
export const slug = (t: unknown) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28);
const diasOk = (d: unknown): number[] | null => { if (!Array.isArray(d)) return null; const l = Array.from(new Set(d.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))).sort(); return l.length ? l : null; };
const NOMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const diasTxt = (d: number[]) => { const s = d.join(); return s === '0,1,2,3,4,5,6' ? 'todo dia' : s === '1,2,3,4,5' ? 'seg a sex' : d.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((x) => NOMES[x]).join(', '); };
const ativa = (f: Fixa, hoje: string) => !f.ate || f.ate >= hoje;
// a fixa gera tarefa neste dia?
export const valeNoDia = (f: Fixa, d: string) => f.dias.includes(diaSemana(d)) && (!f.de || d >= f.de) && (!f.ate || d <= f.ate);

function achar(lista: Fixa[], nome: string, hoje: string): { f?: Fixa; erro?: string } {
  const alvo = norm(nome); if (!alvo) return { erro: 'Faltou o nome da tarefa fixa.' };
  const at = lista.filter((f) => ativa(f, hoje));
  const ex = at.filter((f) => norm(f.titulo) === alvo); if (ex.length === 1) return { f: ex[0] };
  const parc = at.filter((f) => norm(f.titulo).includes(alvo) || alvo.includes(norm(f.titulo)));
  if (parc.length === 1) return { f: parc[0] };
  const nomes = at.map((f) => `"${f.titulo}"`).join(', ') || 'nenhuma';
  return { erro: parc.length > 1 ? `Mais de uma tarefa fixa combina com "${nome}". Seja mais específico. Fixas atuais: ${nomes}.` : `Não achei a tarefa fixa "${nome}". Fixas atuais: ${nomes}.` };
}

// Aplica as mudanças nas tarefas fixas valendo de `ini` em diante. `ini` já vem sem datas passadas.
export function aplicarRotina(atuais: Fixa[], ini: string, hoje: string, ops: Ops, areas: string[]): { fixas: Fixa[]; resumo: string[]; erro?: string } {
  const lista: Fixa[] = atuais.map((f) => ({ ...f, dias: Array.isArray(f.dias) ? f.dias.slice() : [] }));
  const resumo: string[] = [];
  const area = (a?: string | null) => areas.find((x) => x.toLowerCase() === String(a || '').toLowerCase()) || null;
  const fechar = (f: Fixa) => { // a fixa deixa de valer a partir de `ini`
    if (f.de && f.de >= ini) lista.splice(lista.indexOf(f), 1);
    else { const fim = addDias(ini, -1); f.ate = f.ate && f.ate < fim ? f.ate : fim; }
  };
  const quando = ini > hoje ? ` a partir de ${ini}` : ' de hoje em diante';

  for (const nome of ops.remover || []) {
    const r = achar(lista, String(nome), hoje); if (r.erro) return { fixas: atuais, resumo, erro: r.erro };
    fechar(r.f!); resumo.push(`Tirei "${r.f!.titulo}"${quando}.`);
  }
  for (const m of ops.alterar || []) {
    const r = achar(lista, String(m.titulo || ''), hoje); if (r.erro) return { fixas: atuais, resumo, erro: r.erro };
    const velho = r.f!; const dias = m.dias === undefined ? velho.dias : diasOk(m.dias);
    if (!dias) return { fixas: atuais, resumo, erro: `Os dias de "${velho.titulo}" precisam ser números de 0 (domingo) a 6 (sábado).` };
    const novo: Fixa = { titulo: String(m.novo_titulo || velho.titulo).trim().slice(0, 80), hora: m.hora === undefined ? velho.hora || null : okHora(m.hora), dias, area: m.area ? area(m.area) || velho.area || null : velho.area || null };
    if (ini > hoje) novo.de = ini;
    const tinhaDe = velho.de && velho.de >= ini; fechar(velho);
    if (tinhaDe && velho.de && velho.de >= ini) novo.de = velho.de; // ela ainda nem tinha começado: só reescreve
    lista.push(novo); resumo.push(`Mudei "${velho.titulo}"${quando}: ${novo.titulo}${novo.hora ? ' às ' + novo.hora : ''}, ${diasTxt(novo.dias)}.`);
  }
  for (const n of ops.adicionar || []) {
    const titulo = String(n.titulo || '').trim().slice(0, 80); const dias = diasOk(n.dias);
    if (!titulo || !dias) return { fixas: atuais, resumo, erro: 'Para adicionar uma tarefa fixa preciso do título e dos dias (0 = domingo ... 6 = sábado).' };
    const f: Fixa = { titulo, hora: okHora(n.hora), dias, area: area(n.area) }; if (ini > hoje) f.de = ini;
    lista.push(f); resumo.push(`Adicionei "${titulo}"${n.hora ? ' às ' + okHora(n.hora) : ''}, ${diasTxt(dias)},${quando}.`);
  }
  // fixas que já terminaram não precisam ficar guardadas
  return { fixas: lista.filter((f) => ativa(f, hoje)), resumo };
}

// Acerta as tarefas fixas já criadas (de `ini` em diante) para ficarem como as novas fixas mandam.
// Tarefas já feitas ficam como estão. Retorna só o que mudou.
export function ajustarTarefasCriadas(tarefas: Doc[], fixas: Fixa[], ini: string, areas: string[]): { id: string; data: Record<string, any> }[] {
  const out: { id: string; data: Record<string, any> }[] = [];
  for (const t of tarefas) {
    const d = t.data; if (!d || !d.fixa || d.feito || d.apagada || !d.data || d.data < ini) continue;
    const f = fixas.find((x) => slug(x.titulo) === slug(d.titulo) && valeNoDia(x, d.data));
    if (!f) { out.push({ id: t.id, data: { ...d, apagada: true } }); continue; }
    const hora = f.hora || null; const periodo = hora ? perDeHora(hora) : 'Manhã'; const ar = f.area && areas.includes(f.area) ? f.area : d.area;
    if (d.titulo !== f.titulo || (d.hora || null) !== hora || d.periodo !== periodo || d.area !== ar) out.push({ id: t.id, data: { ...d, titulo: f.titulo, hora, periodo, area: ar } });
  }
  return out;
}
