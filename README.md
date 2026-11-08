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

Na bolinha com a inicial (canto superior) ou em **Mais** (celular) > **Configurações**, cada um escolhe: o nome da saudação, as abas que aparecem, as áreas das tarefas, as **tarefas fixas** (ex.: "17h30 Academia: seg a sex", criadas sozinhas nos próximos 7 dias), os **nichos** de prospecção e a meta de leads por dia, as entregas que se repetem e as categorias de entrada e saída do Dinheiro. Fica salvo na conta de cada um; o código é o mesmo para todos.

## Telas

- **Hoje**: "E agora?" (a próxima coisa mais importante, com botão para fazer), ofensiva no estilo Duolingo (missões do dia, mapa dos últimos 28 dias, escudos e recorde; o contador também fica no topo de todas as abas), palavra da noite (a partir das 19h, um trecho da Bíblia com uma reflexão curta e a contagem de noites seguidas), tarefas do dia, registro do dia (sono, exercício, água, humor), últimos 7 dias (um cartão que alterna entre sono, exercício, humor e água, com os gastos fixos ao lado), lembretes de hoje, próximas entregas e dinheiro do mês (com o que falta receber de clientes).
- **Tarefas**: dia a dia por período (manhã, tarde, noite), com horário e tarefas fixas; uma tarefa ligada a um passo de meta marca o passo junto. Embaixo, os lembretes do dia, com atalhos rápidos (em 30 min, em 1 hora, hoje à noite, amanhã cedo) e aviso na hora enquanto o painel estiver aberto.
- **Trabalho**, na ordem do processo:
  - **Prospecção**: leads por nicho, avanço no funil (abordado → respondeu → interessado → proposta → fechado), follow-ups do dia e resultado por nicho. Ao fechar um lead, abre o cadastro do cliente.
  - **Mensagens**: modelos por tipo (abertura, follow-up, último toque, respostas, proposta, fechamento, outros).
  - **Clientes**: clientes já fechados, valor do projeto, mensalidade opcional e cobranças do mês. "Recebi" lança a entrada em Dinheiro.
  - **Entregas**: o que falta entregar e o que já foi entregue, filtrando por cliente.
- **Dinheiro**: saldo da conta (pedido na primeira vez e no começo de cada mês; entre um e outro, se atualiza com os lançamentos), entrou e saiu do mês, contas fixas (lançadas sozinhas todo mês no dia certo), mês a mês, com categorias de saída e entrada, lançamentos e gráfico de 6 meses. Valores com centavos (1.234,56).
- **Planos**: frase do dia no topo (toque para trocar; edite em Configurações), metas da semana, do mês, do ano e de longo prazo. Uma meta pode contar sozinha pela Prospecção, pelos clientes com mensalidade ou pelo que foi recebido de clientes.
- **Ideias**: bloco de notas para rascunhos de ideias (tela cheia, salva sozinho), com busca, filtro por área, fixar no topo, arquivar e transformar em tarefa de hoje.
- **Treinos**: treino do dia por grupo muscular (seleções prontas como Peito + Tríceps ou criadas por você), séries por exercício e cardio.
- **Revisão**: uma por semana, com os números (tarefas, ofensiva, leads, dinheiro, treinos, Palavra, sono), seus fechamentos do dia e o feedback do Claude (pedido pelo botão ou feito pela revisão de domingo).

No celular, as abas ficam numa barra embaixo; o que não cabe vai para **Mais**.

## Seus dados

No app, toque na bolinha com a sua inicial (canto superior) para **baixar uma cópia** dos seus dados ou **importar** um arquivo.

## Avisos (notificações push)

Em Configurações → "Avisos neste aparelho" → Ligar avisos. Lembretes e tarefas com horário avisam na hora, e a palavra da noite às 21h, mesmo com o painel fechado. No iPhone, só funciona com o painel adicionado à Tela de Início (iOS 16.4 ou mais novo).

Como funciona: `sw.js` recebe os avisos; a função `supabase/functions/avisos` roda a cada minuto (pg_cron + pg_net) e envia pelo padrão Web Push. As chaves VAPID são geradas pela própria função e ficam só no banco (esquema `privado`), nunca no repositório.

## Conector com o Claude

Em Configurações → "Conectar ao Claude" → Gerar link do conector. No Claude: Configurações → Conectores → Adicionar conector personalizado → cole o link. O Claude passa a ver o dia, criar e marcar tarefas, criar lembretes e ideias, lançar dinheiro e resumir a semana. O servidor é a função `supabase/functions/mcp` (MCP via HTTP); cada link é pessoal, guardado só como hash, e gerar outro desativa o anterior.

## Fechamento do dia

À noite, o Hoje mostra "Feche o seu dia": o que foi bem, o que travou e o que fazer amanhã (pode virar tarefas de amanhã).
