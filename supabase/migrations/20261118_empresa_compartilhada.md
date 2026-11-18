Empresa compartilhada (aplicada no Supabase em 18/11/2026):
- tabelas public.empresas, public.empresa_membros, public.empresa_docs (RLS: só membros leem/escrevem; mensagens só o autor edita/apaga)
- funções public.eh_membro, public.criar_empresa(nome, meu_nome), public.entrar_empresa(codigo, meu_nome)
- empresa_docs e empresa_membros no realtime (supabase_realtime)
