// Teste da camada de dados com um Supabase falso em memória. Rode: node tests/banco.test.js
const assert = require('assert');
global.window = {}; global.crypto = require('crypto').webcrypto;
require('../js/banco.js');
const criarBanco = window.criarBanco;

function sbFalso() {
  const linhas = new Map(); let handler = null;
  const k = (r) => r.user_id + '|' + r.colecao + '|' + r.id;
  return {
    linhas,
    from() {
      return {
        select() { const all = [...linhas.values()].sort((a, b) => (a.colecao + a.id < b.colecao + b.id ? -1 : 1)); const q = { order() { return q; }, async range(a, b) { return { data: all.slice(a, b + 1).map((r) => ({ colecao: r.colecao, id: r.id, data: r.data })), error: null }; } }; return q; },
        async upsert(rows) { for (const r of [].concat(rows)) linhas.set(k(r), JSON.parse(JSON.stringify(r))); return { error: null }; },
        delete() { return { async match(m) { linhas.delete(k(m)); return { error: null }; } }; }
      };
    },
    channel() { const c = { on(_t, _f, h) { handler = h; return c; }, subscribe() { return c; } }; return c; },
    removeChannel() {},
    emitir(p) { handler(p); }
  };
}

(async () => {
  const sb = sbFalso(); const db = criarBanco(sb, 'u1');
  await db.carregar(); db.ouvirMudancas();
  let snaps = []; db.collection('dias').orderBy('data', 'desc').limit(2).onSnapshot((s) => snaps.push(s.docs.map((d) => d.id)));
  assert.deepStrictEqual(snaps.pop(), []);
  await db.doc('dias/2026-10-26').set({ data: '2026-10-26', sono_h: 7 });
  await db.doc('dias/2026-10-28').set({ data: '2026-10-28', sono_h: 8 });
  await db.doc('dias/2026-10-27').set({ data: '2026-10-27', sono_h: 6 });
  assert.deepStrictEqual(snaps.pop(), ['2026-10-28', '2026-10-27'], 'ordena desc e limita');
  await db.doc('dias/2026-10-28').update({ humor: 4 });
  assert.strictEqual(sb.linhas.get('u1|dias|2026-10-28').data.humor, 4, 'update grava no banco');
  assert.strictEqual(sb.linhas.get('u1|dias|2026-10-28').data.sono_h, 8, 'update mantém campos');
  const ref = db.collection('tarefas').doc(); await ref.set({ titulo: 'x' });
  assert.ok(ref.id.length >= 10, 'id novo');
  let docSnap; db.doc('config/perfil').onSnapshot((s) => { docSnap = s; });
  assert.strictEqual(docSnap.exists, false);
  sb.emitir({ eventType: 'INSERT', new: { colecao: 'config', id: 'perfil', data: { meta_sono: 7.5 } } });
  assert.strictEqual(docSnap.exists, true); assert.strictEqual(docSnap.data().meta_sono, 7.5, 'recebe mudança de outro aparelho');
  await db.doc('dias/2026-10-27').delete();
  assert.ok(!sb.linhas.has('u1|dias|2026-10-27'), 'delete apaga no banco');
  assert.deepStrictEqual(snaps.pop(), ['2026-10-28', '2026-10-26']);
  const n = await db.importar({ metas: { m1: { meta: 'Ler', atual: 1, alvo: 12 } }, 'x/y': { a: {} } });
  assert.strictEqual(n, 1, 'importa só coleções válidas');
  assert.ok(db.tudo().metas.m1, 'exporta tudo');
  await assert.rejects(db.doc('nao/existe').update({ a: 1 }), /não existe/);
  console.log('todos os testes passaram');
})().catch((e) => { console.error(e); process.exit(1); });
