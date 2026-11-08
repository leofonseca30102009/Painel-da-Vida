// Conector do Painel da Vida para o Claude (servidor MCP, transporte Streamable HTTP com respostas JSON).
// Cada pessoa gera um link pessoal em Configurações (…/functions/v1/mcp?k=CHAVE). A chave é guardada
// só como hash (sha-256) em public.mcp_tokens e dá acesso apenas aos dados de quem a gerou.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, mcp-session-id, mcp-protocol-version, authorization', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Expose-Headers': 'mcp-session-id' };
const resp = (o: unknown, status = 200) => new Response(o === null ? null : JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
const novoId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);
const TZ = 'America/Sao_Paulo';
function hoje() { const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); return p; }
const addDias = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const perDeHora = (h?: string | null) => { if (!h) return null; const n = +h.slice(0, 2); return n < 12 ? 'Manhã' : n < 18 ? 'Tarde' : 'Noite'; };
const okData = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
const okHora = (h?: string | null) => (h && /^\d{1,2}:\d{2}$/.test(h) ? h.padStart(5, '0') : null);
const brl = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

type Doc = { id: string; data: Record<string, any> };
async function docs(uid: string, colecao: string, filtro?: (q: any) => any): Promise<Doc[]> {
  let q = sb.from('docs').select('id,data').eq('user_id', uid).eq('colecao', colecao); if (filtro) q = filtro(q);
  const { data, error } = await q.limit(5000); if (error) throw error; return (data || []) as Doc[];
}
async function salvar(uid: string, colecao: string, id: string, data: Record<string, unknown>) {
  const { error } = await sb.from('docs').upsert({ user_id: uid, colecao, id, data }, { onConflict: 'user_id,colecao,id' }); if (error) throw error;
}
async function perfil(uid: string) { const l = await docs(uid, 'config', (q) => q.eq('id', 'perfil')); return l[0] ? l[0].data : {}; }

const TOOLS = [
  { name: 'ver_dia', description: 'Mostra o dia no Painel da Vida: tarefas (com id, horário, período, área e se está feita), lembretes, entregas, leads abordados vs meta e se a palavra do dia foi lida. Sem data, usa hoje.', inputSchema: { type: 'object', properties: { data: { type: 'string', description: 'AAAA-MM-DD' } } } },
  { name: 'criar_tarefas', description: 'Cria uma ou mais tarefas. Use para montar o dia ou a semana. Horário opcional (HH:MM); o período (Manhã/Tarde/Noite) é deduzido do horário. Área deve ser uma das áreas do perfil (veja ver_perfil); se omitida, usa a primeira.', inputSchema: { type: 'object', required: ['tarefas'], properties: { tarefas: { type: 'array', items: { type: 'object', required: ['titulo'], properties: { titulo: { type: 'string' }, data: { type: 'string', description: 'AAAA-MM-DD, padrão hoje' }, hora: { type: 'string', description: 'HH:MM' }, periodo: { type: 'string', enum: ['Manhã', 'Tarde', 'Noite'] }, area: { type: 'string' } } } } } } },
  { name: 'marcar_tarefa', description: 'Marca uma tarefa como feita (ou desfaz, com feito=false). Pegue o id em ver_dia.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, feito: { type: 'boolean' } } } },
  { name: 'remover_tarefa', description: 'Remove uma tarefa (pelo id de ver_dia).', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  { name: 'criar_lembrete', description: 'Cria um lembrete rápido. Com horário, o celular avisa na hora (se os avisos estiverem ligados).', inputSchema: { type: 'object', required: ['texto'], properties: { texto: { type: 'string' }, data: { type: 'string', description: 'AAAA-MM-DD, padrão hoje' }, hora: { type: 'string', description: 'HH:MM' } } } },
  { name: 'resumo_periodo', description: 'Resumo de um período: tarefas feitas/planejadas por dia, prospecção (abordados, respostas, propostas, fechados), entradas e saídas, treinos e palavra lida. Sem datas, usa os últimos 7 dias.', inputSchema: { type: 'object', properties: { inicio: { type: 'string' }, fim: { type: 'string' } } } },
  { name: 'ver_metas', description: 'Lista as metas ativas (semana, mês, ano e longo prazo) com alvo, progresso e passos.', inputSchema: { type: 'object', properties: {} } },
  { name: 'ver_dinheiro', description: 'Dinheiro do mês: entradas, saídas, gastos por categoria, contas fixas e saldo atual da conta.', inputSchema: { type: 'object', properties: { mes: { type: 'string', description: 'AAAA-MM, padrão o mês atual' } } } },
  { name: 'lancar_dinheiro', description: 'Lança uma entrada ou saída de dinheiro. Categoria deve existir no perfil (veja ver_perfil); se omitida, usa Outros.', inputSchema: { type: 'object', required: ['tipo', 'valor'], properties: { tipo: { type: 'string', enum: ['entrada', 'saida'] }, valor: { type: 'number' }, categoria: { type: 'string' }, descricao: { type: 'string' }, data: { type: 'string' } } } },
  { name: 'criar_ideia', description: 'Guarda uma ideia no bloco de notas de Ideias.', inputSchema: { type: 'object', required: ['titulo'], properties: { titulo: { type: 'string' }, texto: { type: 'string' } } } },
  { name: 'ver_ideias', description: 'Lista as notas do bloco de Ideias (id, título, texto). Passe id para ver uma nota inteira.', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } },
  { name: 'completar_ideia', description: 'Acrescenta texto no FINAL de uma nota de Ideias, sem apagar nada do que o usuário escreveu.', inputSchema: { type: 'object', required: ['id', 'texto'], properties: { id: { type: 'string' }, texto: { type: 'string', description: 'Texto a acrescentar (pode ter títulos e listas simples)' } } } },
  { name: 'salvar_relatorio', description: 'Salva a revisão de uma semana na aba Revisão do painel. Use depois de analisar a semana (resumo_periodo, ver_metas). Texto em markdown simples: parágrafos curtos, listas com "- ", títulos com "## ", **negrito**. Inclua: o que foi bem, o que escorregou, padrões, e 3 focos para a próxima semana.', inputSchema: { type: 'object', required: ['inicio', 'texto'], properties: { inicio: { type: 'string', description: 'Segunda-feira da semana, AAAA-MM-DD' }, texto: { type: 'string' }, nota: { type: 'number', description: 'Nota da semana de 0 a 10 (opcional)' } } } },
  { name: 'ver_leads', description: 'Lista os leads da prospecção (id, nome do local, nicho, segmento, cidade, canal, etapa, datas do funil, anotações). Filtre por etapa ou nicho se quiser.', inputSchema: { type: 'object', properties: { etapa: { type: 'string', enum: ['Prospectar', 'Mensagem enviada', 'Respondeu', 'Interessado', 'Proposta enviada', 'Negociando', 'Fechado', 'Perdido'] }, nicho: { type: 'string', description: 'id ou nome do nicho' } } } },
  { name: 'cadastrar_lead', description: 'Cadastra um lead na prospecção. Por padrão entra como "Mensagem enviada" (abordado hoje). Use nicho = id do nicho do perfil (ver_perfil).', inputSchema: { type: 'object', required: ['nome'], properties: { nome: { type: 'string', description: 'Nome do local ou da pessoa' }, nicho: { type: 'string' }, segmento: { type: 'string', description: 'Ex.: Psicóloga, Salão de beleza' }, cidade: { type: 'string' }, instagram: { type: 'string' }, telefone: { type: 'string' }, canal: { type: 'string', enum: ['Instagram', 'WhatsApp', 'Ligação', 'Pessoalmente'] }, notas: { type: 'string' }, abordado: { type: 'boolean', description: 'false para só guardar sem marcar como abordado' } } } },
  { name: 'atualizar_lead', description: 'Muda a etapa de um lead (marca a data da etapa no funil) e/ou acrescenta uma anotação. Pegue o id em ver_leads.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, etapa: { type: 'string', enum: ['Prospectar', 'Mensagem enviada', 'Respondeu', 'Interessado', 'Proposta enviada', 'Negociando', 'Fechado', 'Perdido'] }, anotacao: { type: 'string' } } } },
  { name: 'ver_mensagens', description: 'Lista os modelos de mensagem salvos (id, tipo, título, texto). Tipos: abertura, followup, ultimo, respostas, proposta, fechamento, outros.', inputSchema: { type: 'object', properties: { tipo: { type: 'string' } } } },
  { name: 'salvar_mensagem', description: 'Salva um modelo de mensagem em Trabalho → Mensagens.', inputSchema: { type: 'object', required: ['titulo', 'texto', 'tipo'], properties: { titulo: { type: 'string' }, texto: { type: 'string' }, tipo: { type: 'string', enum: ['abertura', 'followup', 'ultimo', 'respostas', 'proposta', 'fechamento', 'outros'] } } } },
  { name: 'ver_treinos', description: 'Treinos dos últimos dias (data, grupos musculares, exercícios) para sugerir o próximo sem repetir músculo cansado.', inputSchema: { type: 'object', properties: { dias: { type: 'number', description: 'Quantos dias para trás (padrão 14)' } } } },
  { name: 'criar_treino', description: 'Cria um treino já montado na aba Treinos (para o dia indicado, padrão hoje). grupo: peito, costas, ombro, trapezio, biceps, triceps, antebraco, pernas (quadríceps), posterior, gluteos, panturrilha, abdomen, cardio.', inputSchema: { type: 'object', required: ['nome', 'exercicios'], properties: { nome: { type: 'string', description: 'Ex.: Peito + tríceps' }, data: { type: 'string' }, notas: { type: 'string' }, exercicios: { type: 'array', items: { type: 'object', required: ['nome', 'grupo'], properties: { nome: { type: 'string' }, grupo: { type: 'string' }, series: { type: 'number' }, reps: { type: 'number' }, carga: { type: 'number', description: 'kg (opcional)' }, minutos: { type: 'number', description: 'só cardio' } } } } } } },
  { name: 'adicionar_passos', description: 'Adiciona passos (tarefas da meta) a uma meta de Planos. Pegue o id em ver_metas. Com criar_tarefas = true, cada passo com data também vira tarefa ligada à meta.', inputSchema: { type: 'object', required: ['meta_id', 'passos'], properties: { meta_id: { type: 'string' }, passos: { type: 'array', items: { type: 'object', required: ['texto'], properties: { texto: { type: 'string' }, data: { type: 'string', description: 'AAAA-MM-DD (opcional)' }, hora: { type: 'string' } } } }, criar_tarefas: { type: 'boolean' } } } },
  { name: 'ver_perfil', description: 'Nome, áreas das tarefas, tarefas fixas, nichos de prospecção, meta de leads por dia e categorias de dinheiro.', inputSchema: { type: 'object', properties: {} } }
];

const contaFunil = (proj: Doc[], ini: string, fim: string, k: string) => proj.filter((p) => { const v = p.data.datas && p.data.datas[k]; return v && v >= ini && v <= fim; }).length;

async function chamar(uid: string, nome: string, a: Record<string, any>): Promise<string> {
  const H = hoje();
  if (nome === 'ver_perfil') {
    const p = await perfil(uid);
    return JSON.stringify({ nome: p.nome, areas: p.areas, tarefas_fixas: p.fixas, nichos: p.nichos, meta_leads_dia: p.meta_leads_dia ?? 10, categorias_saida: p.cats_saida, categorias_entrada: p.cats_entrada }, null, 1);
  }
  if (nome === 'ver_dia') {
    const d = okData(a.data) || H;
    const [ts, ls, vs, proj, bib, p] = await Promise.all([docs(uid, 'tarefas', (q) => q.eq('data->>data', d)), docs(uid, 'lembretes'), docs(uid, 'videos', (q) => q.eq('data->>entrega', d)), docs(uid, 'projetos'), docs(uid, 'biblia', (q) => q.eq('id', d)), perfil(uid)]);
    const tarefas = ts.filter((t) => !t.data.apagada).map((t) => ({ id: t.id, hora: t.data.hora || null, periodo: t.data.periodo, titulo: t.data.titulo, area: t.data.area, feito: !!t.data.feito })).sort((x, y) => (x.hora || '99').localeCompare(y.hora || '99'));
    const lembretes = ls.filter((r) => r.data.data === d || (d === H && r.data.data < d && !r.data.feito)).map((r) => ({ id: r.id, data: r.data.data, hora: r.data.hora || null, texto: r.data.texto, feito: !!r.data.feito }));
    return JSON.stringify({ data: d, tarefas, feitas: tarefas.filter((t) => t.feito).length, lembretes, entregas: vs.map((v) => ({ titulo: v.data.titulo, cliente: v.data.cliente, status: v.data.status })), leads_abordados: contaFunil(proj, d, d, 'abordado'), meta_leads_dia: p.meta_leads_dia ?? 10, palavra_lida: bib.some((b) => b.data.lido) }, null, 1);
  }
  if (nome === 'criar_tarefas') {
    const p = await perfil(uid); const areas: string[] = Array.isArray(p.areas) && p.areas.length ? p.areas : ['Pessoal'];
    const l = Array.isArray(a.tarefas) ? a.tarefas.slice(0, 40) : []; const feitas: string[] = [];
    for (const t of l) {
      const titulo = String(t.titulo || '').trim().slice(0, 160); if (!titulo) continue;
      const hora = okHora(t.hora); const area = areas.find((x) => x.toLowerCase() === String(t.area || '').toLowerCase()) || areas[0];
      const doc = { titulo, data: okData(t.data) || H, hora, periodo: perDeHora(hora) || (['Manhã', 'Tarde', 'Noite'].includes(t.periodo) ? t.periodo : 'Manhã'), area, feito: false, criado: Date.now() };
      await salvar(uid, 'tarefas', novoId(), doc); feitas.push(`${doc.data}${hora ? ' ' + hora : ''} · ${titulo} (${area})`);
    }
    return feitas.length ? `Criei ${feitas.length} tarefa(s):\n` + feitas.join('\n') : 'Nenhuma tarefa criada (faltou o título).';
  }
  if (nome === 'marcar_tarefa' || nome === 'remover_tarefa') {
    const l = await docs(uid, 'tarefas', (q) => q.eq('id', String(a.id || ''))); if (!l[0]) return 'Não achei essa tarefa. Use ver_dia para pegar o id.';
    const d = { ...l[0].data }; if (nome === 'marcar_tarefa') d.feito = a.feito !== false; else d.apagada = true;
    await salvar(uid, 'tarefas', l[0].id, d); return nome === 'marcar_tarefa' ? `"${d.titulo}" ${d.feito ? 'marcada como feita' : 'desmarcada'}.` : `"${d.titulo}" removida.`;
  }
  if (nome === 'criar_lembrete') {
    const texto = String(a.texto || '').trim().slice(0, 140); if (!texto) return 'Faltou o texto do lembrete.';
    const doc = { texto, data: okData(a.data) || H, hora: okHora(a.hora), feito: false, criado: Date.now() }; await salvar(uid, 'lembretes', novoId(), doc);
    return `Lembrete criado: ${texto} (${doc.data}${doc.hora ? ' às ' + doc.hora : ''}).`;
  }
  if (nome === 'criar_ideia') {
    const titulo = String(a.titulo || '').trim().slice(0, 140); if (!titulo) return 'Faltou o título.';
    await salvar(uid, 'ideias', novoId(), { titulo, texto: String(a.texto || ''), area: '', criado: Date.now(), atualizado: Date.now() }); return `Ideia guardada: ${titulo}.`;
  }
  if (nome === 'ver_ideias') {
    const ls = await docs(uid, 'ideias');
    if (a.id) { const n = ls.find((x) => x.id === a.id); return n ? JSON.stringify({ id: n.id, titulo: n.data.titulo, texto: n.data.texto || '' }, null, 1) : 'Não achei essa nota.'; }
    return JSON.stringify(ls.filter((x) => !x.data.apagada).sort((x, y) => (y.data.atualizado || 0) - (x.data.atualizado || 0)).slice(0, 60).map((x) => ({ id: x.id, titulo: x.data.titulo, inicio: String(x.data.texto || '').slice(0, 160) })), null, 1);
  }
  if (nome === 'completar_ideia') {
    const l = await docs(uid, 'ideias', (q) => q.eq('id', String(a.id || ''))); if (!l[0]) return 'Não achei essa nota. Use ver_ideias.';
    const add = String(a.texto || '').trim().slice(0, 6000); if (!add) return 'Faltou o texto.';
    const d = { ...l[0].data } as Record<string, any>; d.texto = (String(d.texto || '').replace(/\s+$/, '') + '\n\n— Claude, ' + H.slice(8) + '/' + H.slice(5, 7) + ' —\n' + add).replace(/^\s+/, ''); d.atualizado = Date.now();
    await salvar(uid, 'ideias', l[0].id, d); return `Acrescentei ao final de "${d.titulo}".`;
  }
  if (nome === 'lancar_dinheiro') {
    const valor = Math.round(Number(a.valor) * 100) / 100; if (!(valor > 0)) return 'O valor precisa ser maior que zero.';
    const tipo = a.tipo === 'entrada' ? 'entrada' : 'saida'; const p = await perfil(uid);
    const cats: string[] = (tipo === 'entrada' ? p.cats_entrada : p.cats_saida) || []; const categoria = cats.find((c) => c.toLowerCase() === String(a.categoria || '').toLowerCase()) || 'Outros';
    const doc = { tipo, valor, data: okData(a.data) || H, categoria, descricao: String(a.descricao || '').slice(0, 120), criado: Date.now() }; await salvar(uid, 'lancamentos', novoId(), doc);
    return `${tipo === 'entrada' ? 'Entrada' : 'Saída'} de ${brl(valor)} lançada em ${categoria} (${doc.data}).`;
  }
  if (nome === 'ver_dinheiro') {
    const mes = /^\d{4}-\d{2}$/.test(a.mes || '') ? a.mes : H.slice(0, 7);
    const [ls, fx, p] = await Promise.all([docs(uid, 'lancamentos'), docs(uid, 'fixos'), perfil(uid)]);
    const doMes = ls.filter((x) => String(x.data.data || '').startsWith(mes));
    const ent = doMes.filter((x) => x.data.tipo === 'entrada').reduce((t, x) => t + (x.data.valor || 0), 0); const sai = doMes.filter((x) => x.data.tipo !== 'entrada').reduce((t, x) => t + (x.data.valor || 0), 0);
    const cat: Record<string, number> = {}; doMes.filter((x) => x.data.tipo !== 'entrada').forEach((x) => { cat[x.data.categoria || 'Outros'] = (cat[x.data.categoria || 'Outros'] || 0) + (x.data.valor || 0); });
    let saldo: number | null = null; const sd = p.saldo;
    if (sd && typeof sd.valor === 'number') saldo = sd.valor + ls.filter((x) => x.data.data > sd.data || (x.data.data === sd.data && (x.data.criado || 0) > (sd.em || 0))).reduce((t, x) => t + (x.data.tipo === 'entrada' ? 1 : -1) * (x.data.valor || 0), 0);
    return JSON.stringify({ mes, entrou: brl(ent), saiu: brl(sai), gastos_por_categoria: Object.fromEntries(Object.entries(cat).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, brl(v)])), saldo_na_conta: saldo === null ? 'não informado' : brl(saldo), contas_fixas: fx.filter((f) => f.data.ativo !== false).map((f) => `${f.data.nome}: ${f.data.tipo === 'entrada' ? '+' : '−'}${brl(f.data.valor)} todo dia ${f.data.dia}`) }, null, 1);
  }
  if (nome === 'ver_metas') {
    const ps = await docs(uid, 'planos');
    const l = ps.filter((g) => (g.data.status || 'Ativo') === 'Ativo').map((g) => ({ id: g.id, titulo: g.data.titulo, horizonte: g.data.horizonte, periodo: g.data.periodo || null, alvo: g.data.alvo ?? null, atual: g.data.auto ? 'conta sozinha (' + g.data.auto + ')' : (g.data.atual ?? null), unidade: g.data.unidade || null, passos: (g.data.passos || []).map((s: any) => (s.feito ? '[x] ' : '[ ] ') + s.texto) }));
    return JSON.stringify(l, null, 1);
  }
  if (nome === 'resumo_periodo') {
    const fim = okData(a.fim) || H; const ini = okData(a.inicio) || addDias(fim, -6);
    const [ts, proj, ls, tr, bib] = await Promise.all([docs(uid, 'tarefas', (q) => q.gte('data->>data', ini).lte('data->>data', fim)), docs(uid, 'projetos'), docs(uid, 'lancamentos', (q) => q.gte('data->>data', ini).lte('data->>data', fim)), docs(uid, 'treinos', (q) => q.gte('data->>data', ini).lte('data->>data', fim)), docs(uid, 'biblia', (q) => q.gte('id', ini).lte('id', fim))]);
    const dias: Record<string, string> = {}; for (let d = ini; d <= fim; d = addDias(d, 1)) { const t = ts.filter((x) => x.data.data === d && !x.data.apagada); dias[d] = `${t.filter((x) => x.data.feito).length}/${t.length} tarefas`; }
    const soma = (tp: string) => brl(ls.filter((x) => (tp === 'entrada') === (x.data.tipo === 'entrada')).reduce((t, x) => t + (x.data.valor || 0), 0));
    return JSON.stringify({ inicio: ini, fim, tarefas_por_dia: dias, prospeccao: { abordados: contaFunil(proj, ini, fim, 'abordado'), respostas: contaFunil(proj, ini, fim, 'respondeu'), propostas: contaFunil(proj, ini, fim, 'proposta'), fechados: contaFunil(proj, ini, fim, 'fechado') }, entrou: soma('entrada'), saiu: soma('saida'), treinos: tr.length, noites_com_palavra: bib.filter((b) => b.data.lido).length }, null, 1);
  }
  if (nome === 'ver_leads') {
    const [ls, p] = await Promise.all([docs(uid, 'projetos'), perfil(uid)]); const ns: any[] = p.nichos || [];
    const nf = String(a.nicho || '').toLowerCase(); const nid = nf ? (ns.find((n) => n.id.toLowerCase() === nf || String(n.nome).toLowerCase() === nf) || { id: nf }).id : null;
    const l = ls.filter((x) => (!a.etapa || x.data.etapa === a.etapa) && (!nid || x.data.nicho === nid)).sort((x, y) => (y.data.criado || 0) - (x.data.criado || 0)).slice(0, 150)
      .map((x) => ({ id: x.id, nome: x.data.academia, nicho: (ns.find((n) => n.id === x.data.nicho) || {}).nome || x.data.nicho || null, segmento: x.data.segmento || null, cidade: x.data.cidade || null, canal: x.data.canal || null, etapa: x.data.etapa, datas: x.data.datas || {}, notas: x.data.notas || '' }));
    return JSON.stringify({ total: l.length, leads: l }, null, 1);
  }
  if (nome === 'cadastrar_lead') {
    const nomeL = String(a.nome || '').trim().slice(0, 80); if (!nomeL) return 'Faltou o nome do local.';
    const ls = await docs(uid, 'projetos'); if (ls.some((x) => String(x.data.academia || '').trim().toLowerCase() === nomeL.toLowerCase())) return `"${nomeL}" já está no funil. Use atualizar_lead.`;
    const p = await perfil(uid); const ns: any[] = p.nichos || []; const nf = String(a.nicho || '').toLowerCase();
    const nicho = nf ? (ns.find((n) => n.id.toLowerCase() === nf || String(n.nome).toLowerCase() === nf) || {}).id || null : null;
    const abord = a.abordado !== false;
    const doc: Record<string, unknown> = { academia: nomeL, nicho, segmento: String(a.segmento || '').slice(0, 60) || null, cidade: String(a.cidade || '').slice(0, 40), instagram: String(a.instagram || '').slice(0, 60), telefone: String(a.telefone || '').slice(0, 30), canal: a.canal || 'Instagram', etapa: abord ? 'Mensagem enviada' : 'Prospectar', datas: abord ? { abordado: H } : {}, notas: String(a.notas || '').slice(0, 2000), criado: Date.now() };
    await salvar(uid, 'projetos', novoId(), doc); return `Lead "${nomeL}" cadastrado${abord ? ' como abordado hoje' : ''}.`;
  }
  if (nome === 'atualizar_lead') {
    const l = await docs(uid, 'projetos', (q) => q.eq('id', String(a.id || ''))); if (!l[0]) return 'Não achei esse lead. Use ver_leads para pegar o id.';
    const d: Record<string, any> = { ...l[0].data }; const KEY: Record<string, string> = { 'Mensagem enviada': 'abordado', 'Respondeu': 'respondeu', 'Interessado': 'interessado', 'Proposta enviada': 'proposta', 'Negociando': 'proposta', 'Fechado': 'fechado' };
    const ORD = ['abordado', 'respondeu', 'interessado', 'proposta', 'fechado'];
    if (a.etapa) { d.etapa = a.etapa; const k = KEY[a.etapa]; d.datas = { ...(d.datas || {}) }; if (k) ORD.slice(0, ORD.indexOf(k) + 1).forEach((x) => { if (!d.datas[x]) d.datas[x] = H; }); }
    if (a.anotacao) d.notas = (d.notas ? d.notas + '\n' : '') + `${H.slice(8)}/${H.slice(5, 7)}: ${String(a.anotacao).slice(0, 500)}`;
    await salvar(uid, 'projetos', l[0].id, d); return `"${d.academia}" atualizado${a.etapa ? ' para ' + a.etapa : ''}.`;
  }
  if (nome === 'ver_mensagens') {
    const ls = await docs(uid, 'roteiro');
    return JSON.stringify(ls.filter((m) => !a.tipo || m.data.tipo === a.tipo).sort((x, y) => (x.data.ordem ?? 99) - (y.data.ordem ?? 99)).map((m) => ({ id: m.id, tipo: m.data.tipo || 'outros', titulo: m.data.titulo, texto: m.data.texto })), null, 1);
  }
  if (nome === 'salvar_mensagem') {
    const titulo = String(a.titulo || '').trim().slice(0, 80); const texto = String(a.texto || '').trim().slice(0, 2000); if (!titulo || !texto) return 'Faltou título ou texto.';
    const tipos = ['abertura', 'followup', 'ultimo', 'respostas', 'proposta', 'fechamento', 'outros']; const tipo = tipos.includes(a.tipo) ? a.tipo : 'outros';
    const ls = await docs(uid, 'roteiro'); const ordem = Math.max(0, ...ls.map((m) => Number(m.data.ordem) || 0)) + 1;
    await salvar(uid, 'roteiro', novoId(), { titulo, texto, tipo, ordem, criado: Date.now() }); return `Mensagem "${titulo}" salva em ${tipo}.`;
  }
  if (nome === 'ver_treinos') {
    const n = Math.min(60, Math.max(1, Number(a.dias) || 14)); const ini = addDias(H, -n);
    const ls = await docs(uid, 'treinos', (q) => q.gte('data->>data', ini));
    return JSON.stringify(ls.sort((x, y) => String(y.data.data).localeCompare(String(x.data.data))).map((t) => ({ data: t.data.data, nome: t.data.nome || null, grupos: t.data.grupos || null, duracao_min: t.data.duracao_min ?? null, exercicios: (t.data.exercicios || []).map((e: any) => e.tipo === 'cardio' ? `${e.nome} (${e.minutos ?? '?'} min)` : `${e.nome}: ${(e.series || []).map((x: any) => `${x.reps ?? '?'}x${x.carga ?? '-'}kg`).join(', ')}`) })), null, 1);
  }
  if (nome === 'criar_treino') {
    const GR = ['peito', 'costas', 'ombro', 'trapezio', 'biceps', 'triceps', 'antebraco', 'pernas', 'posterior', 'gluteos', 'panturrilha', 'abdomen', 'cardio'];
    const exs = (Array.isArray(a.exercicios) ? a.exercicios : []).slice(0, 20).map((e: any) => {
      const g = GR.includes(e.grupo) ? e.grupo : undefined; const nm = String(e.nome || '').trim().slice(0, 60);
      if (g === 'cardio') return { nome: nm, grupo: g, tipo: 'cardio', minutos: Number(e.minutos) || null, distancia_km: null, intensidade: 'Moderada' };
      const n = Math.min(8, Math.max(1, Number(e.series) || 3)); const r = Math.min(50, Math.max(1, Number(e.reps) || 10)); const c = Number(e.carga) > 0 ? Number(e.carga) : null;
      return { nome: nm, grupo: g, tipo: 'forca', series: Array.from({ length: n }, () => ({ reps: r, carga: c })) };
    }).filter((e: any) => e.nome);
    if (!exs.length) return 'Faltaram os exercícios.';
    const grupos = GR.filter((g) => exs.some((e: any) => e.grupo === g));
    await salvar(uid, 'treinos', novoId(), { nome: String(a.nome || '').slice(0, 60) || 'Treino', grupos, data: okData(a.data) || H, duracao_min: null, exercicios: exs, notas: String(a.notas || '').slice(0, 200), criado: Date.now() });
    return `Treino "${a.nome || 'Treino'}" criado com ${exs.length} exercício(s) em Treinos.`;
  }
  if (nome === 'adicionar_passos') {
    const l = await docs(uid, 'planos', (q) => q.eq('id', String(a.meta_id || ''))); if (!l[0]) return 'Não achei essa meta. Use ver_metas para pegar o id.';
    const g: Record<string, any> = { ...l[0].data }; const passos = Array.isArray(g.passos) ? g.passos.slice() : []; const novos = (Array.isArray(a.passos) ? a.passos : []).slice(0, 30);
    const p = await perfil(uid); const areas: string[] = Array.isArray(p.areas) && p.areas.length ? p.areas : ['Pessoal']; const area = areas.includes(g.area) ? g.area : areas[0];
    let criadas = 0;
    for (const x of novos) {
      const texto = String(x.texto || '').trim().slice(0, 160); if (!texto) continue; const pid = 'p' + novoId().slice(0, 8); passos.push({ id: pid, texto, feito: false });
      const data = okData(x.data); if (a.criar_tarefas && data) { const hora = okHora(x.hora); await salvar(uid, 'tarefas', novoId(), { titulo: texto, data, hora, periodo: perDeHora(hora) || 'Manhã', area, feito: false, plano: l[0].id, passo: pid, criado: Date.now() }); criadas++; }
    }
    g.passos = passos; await salvar(uid, 'planos', l[0].id, g); return `Adicionei ${novos.length} passo(s) em "${g.titulo}"${criadas ? ` e criei ${criadas} tarefa(s)` : ''}.`;
  }
  if (nome === 'salvar_relatorio') {
    const ini = okData(a.inicio); if (!ini) return 'Informe a segunda-feira da semana (AAAA-MM-DD).';
    const dt = new Date(ini + 'T12:00:00Z'); const seg = addDias(ini, -((dt.getUTCDay() + 6) % 7));
    const texto = String(a.texto || '').trim().slice(0, 12000); if (!texto) return 'Faltou o texto.';
    const nota = typeof a.nota === 'number' && a.nota >= 0 && a.nota <= 10 ? Math.round(a.nota * 10) / 10 : null;
    await salvar(uid, 'relatorios', seg, { inicio: seg, fim: addDias(seg, 6), texto, nota, autor: 'Claude', criado: Date.now() });
    return `Revisão da semana de ${seg} salva na aba Revisão do painel.`;
  }
  throw new Error('Ferramenta desconhecida: ' + nome);
}

async function usuario(req: Request) {
  const k = new URL(req.url).searchParams.get('k') || (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!k || k.length < 20) return null;
  const h = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(k)));
  const { data } = await sb.from('mcp_tokens').select('user_id').eq('token_hash', h).maybeSingle();
  if (data) sb.from('mcp_tokens').update({ ultimo_uso: new Date().toISOString() }).eq('token_hash', h).then(() => {});
  return data ? (data.user_id as string) : null;
}

async function tratar(uid: string, m: any) {
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result });
  const err = (code: number, message: string) => ({ jsonrpc: '2.0', id: m.id, error: { code, message } });
  if (m.id === undefined || m.id === null) return null; // notificação
  if (m.method === 'initialize') return ok({ protocolVersion: (m.params && m.params.protocolVersion) || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'painel-da-vida', version: '1.0.0' }, instructions: 'Painel da Vida: o app de rotina do usuário (tarefas, lembretes, metas, prospecção, dinheiro, ideias). Responda em português do Brasil. Antes de montar o dia, use ver_perfil e ver_dia. Não crie tarefas que repitam as tarefas fixas do perfil. Mensagens de prospecção: curtas, diretas, sem enrolação, e sempre variando o texto (o WhatsApp bloqueia mensagens repetidas); use ver_mensagens para ver o estilo dele. Nunca apague o que o usuário escreveu nas ideias: use completar_ideia. Datas em AAAA-MM-DD, fuso America/Sao_Paulo.' });
  if (m.method === 'ping') return ok({});
  if (m.method === 'tools/list') return ok({ tools: TOOLS });
  if (m.method === 'tools/call') {
    try { const t = await chamar(uid, m.params.name, m.params.arguments || {}); return ok({ content: [{ type: 'text', text: t }] }); }
    catch (e) { return ok({ content: [{ type: 'text', text: 'Erro: ' + (e as Error).message }], isError: true }); }
  }
  if (m.method === 'resources/list') return ok({ resources: [] });
  if (m.method === 'prompts/list') return ok({ prompts: [] });
  return err(-32601, 'Método não encontrado');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Use POST', { status: 405, headers: { ...cors, Allow: 'POST' } });
  const uid = await usuario(req);
  if (!uid) return resp({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Link do conector inválido. Gere um novo em Configurações do Painel da Vida.' } }, 401);
  let body: any; try { body = await req.json(); } catch { return resp({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }, 400); }
  if (Array.isArray(body)) { const out = (await Promise.all(body.map((m) => tratar(uid, m)))).filter(Boolean); return out.length ? resp(out) : new Response(null, { status: 202, headers: cors }); }
  const r = await tratar(uid, body); return r ? resp(r) : new Response(null, { status: 202, headers: cors });
});
