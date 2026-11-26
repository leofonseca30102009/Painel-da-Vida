// Teste da lógica de "mudar a rotina daqui pra frente". Rode: node --experimental-strip-types tests/rotina.test.mjs
import assert from 'node:assert';
import { aplicarRotina, ajustarTarefasCriadas, valeNoDia, slug } from '../supabase/functions/mcp/rotina.ts';

const H = '2026-11-25'; // quarta
const areas = ['Pessoal', 'Escola', 'Cliente', 'Edição', 'Academia', 'Estudo'];
const base = () => [
  { area: 'Academia', dias: [1, 2, 3, 4, 5], hora: '17:30', titulo: 'Academia' },
  { area: 'Edição', dias: [0, 2, 4], hora: '13:00', titulo: 'Editar e entregar o vídeo do Pedro' },
  { area: 'Escola', dias: [1, 2, 3, 4, 5], hora: '07:10', titulo: 'Escola (até 12:10)' }
];

// 1) tirar a academia de hoje em diante: some da lista
let r = aplicarRotina(base(), H, H, { remover: ['academia'] }, areas);
assert.ok(!r.erro); assert.deepStrictEqual(r.fixas.map((f) => f.titulo), ['Editar e entregar o vídeo do Pedro', 'Escola (até 12:10)']);

// 2) tirar a partir de uma data futura: continua valendo até o dia anterior
r = aplicarRotina(base(), '2026-12-01', H, { remover: ['Academia'] }, areas);
const ac = r.fixas.find((f) => f.titulo === 'Academia'); assert.strictEqual(ac.ate, '2026-11-30');
assert.ok(valeNoDia(ac, '2026-11-30') && !valeNoDia(ac, '2026-12-01') && !valeNoDia(ac, '2026-12-02'));

// 3) mudar o horário da escola a partir de hoje: a antiga termina ontem (some), a nova vale sem data final
r = aplicarRotina(base(), H, H, { alterar: [{ titulo: 'Escola', hora: '08:00' }] }, areas);
const esc = r.fixas.filter((f) => f.titulo.startsWith('Escola')); assert.strictEqual(esc.length, 1); assert.strictEqual(esc[0].hora, '08:00'); assert.deepStrictEqual(esc[0].dias, [1, 2, 3, 4, 5]); assert.ok(!esc[0].ate && !esc[0].de);

// 4) mudar a partir de data futura: duas versões convivem, cada uma no seu período
r = aplicarRotina(base(), '2026-12-07', H, { alterar: [{ titulo: 'Academia', hora: '19:00', dias: [1, 3, 5] }] }, areas);
const vs = r.fixas.filter((f) => f.titulo === 'Academia'); assert.strictEqual(vs.length, 2);
assert.ok(valeNoDia(vs.find((f) => f.ate), '2026-12-04') && !valeNoDia(vs.find((f) => f.ate), '2026-12-07'));
assert.ok(!valeNoDia(vs.find((f) => f.de), '2026-12-04') && valeNoDia(vs.find((f) => f.de), '2026-12-07') && !valeNoDia(vs.find((f) => f.de), '2026-12-08'));

// 5) adicionar o novo cliente e a quadra na quinta
r = aplicarRotina(base(), H, H, { adicionar: [{ titulo: 'Editar vídeo do Bruno', hora: '15:00', dias: [1, 3], area: 'edição' }, { titulo: 'Alugar a quadra', dias: [4] }] }, areas);
assert.strictEqual(r.fixas.length, 5); assert.strictEqual(r.fixas.find((f) => f.titulo === 'Editar vídeo do Bruno').area, 'Edição');

// 6) erros: nome que não existe, dia inválido
assert.match(aplicarRotina(base(), H, H, { remover: ['Natação'] }, areas).erro, /Não achei/);
assert.match(aplicarRotina(base(), H, H, { adicionar: [{ titulo: 'X', dias: [9] }] }, areas).erro, /dias/);
assert.strictEqual(aplicarRotina(base(), H, H, { remover: ['Natação'] }, areas).fixas.length, 3, 'erro não muda nada');

// 7) tarefas já criadas: sem academia, as de hoje em diante viram apagadas; feita e passada ficam
const tarefas = [
  { id: 'fx-20261125-academia', data: { titulo: 'Academia', data: '2026-11-25', fixa: true, hora: '17:30', periodo: 'Tarde', area: 'Academia', feito: false } },
  { id: 'fx-20261126-academia', data: { titulo: 'Academia', data: '2026-11-26', fixa: true, hora: '17:30', periodo: 'Tarde', area: 'Academia', feito: false } },
  { id: 'fx-20261124-academia', data: { titulo: 'Academia', data: '2026-11-24', fixa: true, hora: '17:30', periodo: 'Tarde', area: 'Academia', feito: true } },
  { id: 'fx-20261126-escola', data: { titulo: 'Escola (até 12:10)', data: '2026-11-26', fixa: true, hora: '07:10', periodo: 'Manhã', area: 'Escola', feito: false } },
  { id: 'avulsa', data: { titulo: 'Academia', data: '2026-11-26', hora: '18:00', feito: false } }
];
r = aplicarRotina(base(), H, H, { remover: ['Academia'] }, areas);
let mud = ajustarTarefasCriadas(tarefas, r.fixas, H, areas);
assert.deepStrictEqual(mud.map((m) => m.id).sort(), ['fx-20261125-academia', 'fx-20261126-academia']); assert.ok(mud.every((m) => m.data.apagada));

// 8) mudar o horário da escola: a tarefa existente é atualizada no mesmo id (não some)
r = aplicarRotina(base(), H, H, { alterar: [{ titulo: 'Escola', hora: '13:30' }] }, areas);
mud = ajustarTarefasCriadas(tarefas, r.fixas, H, areas);
const m = mud.find((x) => x.id === 'fx-20261126-escola'); assert.ok(m && !m.data.apagada && m.data.hora === '13:30' && m.data.periodo === 'Tarde');

// 9) mudar os dias de seg-sex para seg e qua: quinta (26) é apagada, quarta (25) fica
r = aplicarRotina(base(), H, H, { alterar: [{ titulo: 'Academia', dias: [1, 3] }] }, areas);
mud = ajustarTarefasCriadas(tarefas, r.fixas, H, areas);
assert.deepStrictEqual(mud.map((x) => x.id), ['fx-20261126-academia']);

assert.strictEqual(slug('Escola (até 12:10)'), 'escola-ate-12-10');
console.log('rotina.test: ok');
