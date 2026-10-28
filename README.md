# Painel da Vida

Rotina, tarefas, treinos, trabalho, planos e dinheiro num lugar só. Cada pessoa entra com a própria conta e só vê os próprios dados.

- **Front-end:** uma página estática (`index.html`), sem build. Gráficos com d3, banco e login com Supabase.
- **Banco:** uma tabela `public.docs` no Supabase, com regras de acesso (RLS) por usuário. O SQL está em `supabase/schema.sql`.
- **Hospedagem:** GitHub Pages (grátis).

## Estrutura

```
index.html             o app inteiro (telas, estilos e lógica)
config.js              endereço e chave pública do Supabase
js/banco.js            camada de dados (coleção/id -> tabela docs) com tempo real
manifest.webmanifest   para instalar na tela do celular
icons/                 ícones do app
supabase/schema.sql    tabela, regras de acesso e tempo real
tests/banco.test.js    teste da camada de dados (node tests/banco.test.js)
```

## Publicar no GitHub Pages

1. Crie um repositório no GitHub chamado `painel-da-vida` (pode ser público: não há senha nem dado pessoal no código).
2. Envie estes arquivos para ele (botão **Add file > Upload files**, arraste tudo e confirme).
3. No repositório: **Settings > Pages > Build and deployment**: em *Source* escolha **Deploy from a branch**, branch **main**, pasta **/ (root)**, e salve.
4. Em um ou dois minutos o app fica em `https://SEU-USUARIO.github.io/painel-da-vida/`.

## Configurar o login no Supabase

No painel do Supabase, projeto **painel-da-vida**:

1. **Authentication > URL Configuration**
   - *Site URL*: `https://SEU-USUARIO.github.io/painel-da-vida/`
   - *Redirect URLs*: adicione o mesmo endereço.
   Sem isso, o link de confirmação de e-mail e o de troca de senha apontam para o lugar errado.
2. (Opcional) **Authentication > Sign In / Providers > Google** para entrar com Google. Depois mude `google: true` no `config.js`.

O Supabase manda poucos e-mails por hora no plano grátis. Para duas ou três pessoas, sobra.

## Segurança

- A chave em `config.js` é a chave pública (anon). Ela foi feita para ficar no navegador; quem protege os dados são as regras de acesso do banco.
- **Nunca** coloque no repositório a chave `service_role` nem a senha do banco.
- As regras foram testadas: um usuário não lê, não edita, não apaga e não grava no lugar de outro, e quem não fez login não acessa nada.

## Configurações de cada pessoa

Na bolinha com a inicial (canto superior) > **Configurações**, cada um escolhe as abas que aparecem, as metas diárias dos hábitos, os horários de dormir e acordar, as áreas das tarefas e as entregas que se repetem toda semana. Fica salvo na conta de cada um; o código é o mesmo para todos.

## Seus dados

No app, toque na bolinha com a sua inicial (canto superior) para **baixar uma cópia** dos seus dados ou **importar** um arquivo.
