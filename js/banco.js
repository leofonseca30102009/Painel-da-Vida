/*
 * Camada de dados do Painel da Vida sobre o Supabase.
 *
 * O painel foi escrito para um banco de "documentos" (coleção/id -> objeto).
 * Esta camada guarda tudo numa tabela só (public.docs) e oferece a mesma
 * interface que o resto do app usa:
 *   banco.doc('tarefas/abc').set({...}) / .update({...}) / .delete() / .onSnapshot(cb)
 *   banco.collection('tarefas').doc()            -> novo id
 *   banco.collection('dias').orderBy('data', 'desc').limit(400).onSnapshot(cb)
 *
 * Tudo do usuário é carregado uma vez para a memória (é pouco: alguns milhares
 * de linhas no máximo), as escritas aparecem na hora e vão para o Supabase em
 * seguida, e mudanças feitas em outro aparelho chegam pelo Realtime.
 */
(function () {
  'use strict';

  const PAGINA = 1000;

  function criarBanco(sb, uid) {
    const cache = new Map(); // colecao -> Map(id -> data)
    const ouvintes = new Set();
    let pronto = false;
    let canal = null;

    const col = (c) => { if (!cache.has(c)) cache.set(c, new Map()); return cache.get(c); };
    const copia = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
    const snapDoc = (id, data) => ({ id, exists: data !== undefined, data: () => copia(data), metadata: { fromCache: false, hasPendingWrites: false } });

    function partes(caminho) {
      const p = String(caminho).split('/');
      if (p.length !== 2 || !p[0] || !p[1]) throw new TypeError('Caminho inválido: ' + caminho);
      return p;
    }
    const novoId = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 20) : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

    function disparar(o) {
      if (!pronto) return;
      try {
        if (o.docId) { o.cb(snapDoc(o.docId, col(o.colecao).get(o.docId))); return; }
        let linhas = Array.from(col(o.colecao).entries()).map(([id, data]) => ({ id, data }));
        if (o.q.orderBy) {
          const { campo, dir } = o.q.orderBy; const s = dir === 'desc' ? -1 : 1;
          linhas.sort((a, b) => {
            const va = a.data ? a.data[campo] : undefined, vb = b.data ? b.data[campo] : undefined;
            if (va === undefined || va === null) return (vb === undefined || vb === null) ? 0 : 1;
            if (vb === undefined || vb === null) return -1;
            return va < vb ? -s : va > vb ? s : 0;
          });
        } else linhas.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        if (o.q.limit) linhas = linhas.slice(0, o.q.limit);
        const docs = linhas.map((l) => snapDoc(l.id, l.data));
        o.cb({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } });
      } catch (e) { console.error(e); }
    }
    function avisar(colecao) { for (const o of ouvintes) if (o.colecao === colecao) disparar(o); }
    function avisarTodos() { for (const o of ouvintes) disparar(o); }

    async function carregar() {
      const novo = new Map();
      for (let de = 0; ; de += PAGINA) {
        const { data, error } = await sb.from('docs').select('colecao,id,data').order('colecao').order('id').range(de, de + PAGINA - 1);
        if (error) throw error;
        for (const r of data) { if (!novo.has(r.colecao)) novo.set(r.colecao, new Map()); novo.get(r.colecao).set(r.id, r.data); }
        if (data.length < PAGINA) break;
      }
      cache.clear(); for (const [k, v] of novo) cache.set(k, v);
      pronto = true; avisarTodos();
    }

    function ouvirMudancas() {
      if (canal) sb.removeChannel(canal);
      canal = sb.channel('docs-' + uid)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'user_id=eq.' + uid }, (p) => {
          if (p.eventType === 'DELETE') { const o = p.old || {}; if (o.colecao && o.id && col(o.colecao).delete(o.id)) avisar(o.colecao); return; }
          const n = p.new || {}; if (!n.colecao || !n.id) return;
          col(n.colecao).set(n.id, n.data); avisar(n.colecao);
        })
        .subscribe();
    }

    async function gravar(colecao, id, data) {
      const { error } = await sb.from('docs').upsert({ user_id: uid, colecao, id, data }, { onConflict: 'user_id,colecao,id' });
      if (error) { await carregar().catch(() => {}); throw traduzir(error); }
    }
    function traduzir(error) {
      const msg = (error && error.message) || '';
      const e = new Error(msg || 'Erro ao salvar');
      e.code = /jwt|token|auth/i.test(msg) ? 'sessao' : /row-level security|permission/i.test(msg) ? 'invalid_argument' : /check constraint|too large/i.test(msg) ? 'quota_exceeded' : 'unavailable';
      return e;
    }

    function docRef(colecao, id) {
      return {
        id, path: colecao + '/' + id,
        async get() { return snapDoc(id, col(colecao).get(id)); },
        async set(data) { const d = copia(data); col(colecao).set(id, d); avisar(colecao); await gravar(colecao, id, d); },
        async update(parcial) {
          const atual = col(colecao).get(id);
          if (atual === undefined) { const e = new Error('Registro não existe'); e.code = 'invalid_argument'; throw e; }
          const d = { ...copia(atual), ...copia(parcial) };
          for (const k of Object.keys(parcial)) if (parcial[k] === undefined) delete d[k];
          col(colecao).set(id, d); avisar(colecao); await gravar(colecao, id, d);
        },
        async delete() {
          const tinha = col(colecao).delete(id); if (tinha) avisar(colecao);
          const { error } = await sb.from('docs').delete().match({ user_id: uid, colecao, id });
          if (error) { await carregar().catch(() => {}); throw traduzir(error); }
        },
        onSnapshot(cb, erro) {
          const o = { colecao, docId: id, cb, erro };
          ouvintes.add(o); disparar(o);
          return () => ouvintes.delete(o);
        }
      };
    }

    function consulta(colecao, q) {
      return {
        orderBy(campo, dir) { return consulta(colecao, { ...q, orderBy: { campo, dir: dir || 'asc' } }); },
        limit(n) { return consulta(colecao, { ...q, limit: n }); },
        where() { return consulta(colecao, q); }, // o app não usa filtros; aceito para compatibilidade
        async get() { let r; disparar({ colecao, q, cb: (s) => { r = s; } }); return r; },
        onSnapshot(cb, erro) {
          const o = { colecao, q, cb, erro };
          ouvintes.add(o); disparar(o);
          return () => ouvintes.delete(o);
        },
        doc(id) { return docRef(colecao, id || novoId()); },
        async add(data) { const r = docRef(colecao, novoId()); await r.set(data); return r; },
        path: colecao
      };
    }

    const banco = {
      doc(caminho) { const [c, id] = partes(caminho); return docRef(c, id); },
      collection(c) { if (!c || c.includes('/')) throw new TypeError('Coleção inválida: ' + c); return consulta(c, {}); },
      carregar, ouvirMudancas,
      tudo() { const o = {}; for (const [c, m] of cache) { o[c] = {}; for (const [id, d] of m) o[c][id] = copia(d); } return o; },
      async importar(objeto, aoAvancar) {
        const linhas = [];
        for (const [c, m] of Object.entries(objeto || {})) {
          if (!m || typeof m !== 'object' || c.includes('/')) continue;
          for (const [id, d] of Object.entries(m)) if (d && typeof d === 'object') linhas.push({ user_id: uid, colecao: c, id: String(id), data: d });
        }
        for (let i = 0; i < linhas.length; i += 200) {
          const { error } = await sb.from('docs').upsert(linhas.slice(i, i + 200), { onConflict: 'user_id,colecao,id' });
          if (error) throw traduzir(error);
          if (aoAvancar) aoAvancar(Math.min(i + 200, linhas.length), linhas.length);
        }
        await carregar();
        return linhas.length;
      }
    };
    return banco;
  }

  window.criarBanco = criarBanco;
})();
