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

- **Hoje**: tarefas do dia, registro do dia (sono, exercício, água, humor), últimos 7 dias (um cartão que alterna entre sono, exercício, humor e água, com os gastos fixos ao lado), lembretes de hoje, próximas entregas e dinheiro do mês (com o que falta receber de clientes).
- **Tarefas**: dia a dia por período (manhã, tarde, noite), com horário e tarefas fixas; uma tarefa ligada a um passo de meta marca o passo junto. Embaixo, os lembretes do dia, com atalhos rápidos (em 30 min, em 1 hora, hoje à noite, amanhã cedo) e aviso na hora enquanto o painel estiver aberto.
- **Trabalho**, na ordem do processo:
  - **Prospecção**: leads por nicho, avanço no funil (abordado → respondeu → interessado → proposta → fechado), follow-ups do dia e resultado por nicho. Ao fechar um lead, abre o cadastro do cliente.
  - **Mensagens**: modelos por tipo (abertura, follow-up, último toque, respostas, proposta, fechamento, outros).
  - **Clientes**: clientes já fechados, valor do projeto, mensalidade opcional e cobranças do mês. "Recebi" lança a entrada em Dinheiro.
  - **Entregas**: o que falta entregar e o que já foi entregue, filtrando por cliente.
- **Dinheiro**: saldo da conta (pedido na primeira vez e no começo de cada mês; entre um e outro, se atualiza com os lançamentos), entrou e saiu do mês, contas fixas (lançadas sozinhas todo mês no dia certo), mês a mês, com categorias de saída e entrada, lançamentos e gráfico de 6 meses. Valores com centavos (1.234,56).
- **Planos**: metas da semana, do mês, do ano e de longo prazo. Uma meta pode contar sozinha pela Prospecção, pelos clientes com mensalidade ou pelo que foi recebido de clientes.
- **Treinos**: treino do dia por grupo muscular (seleções prontas como Peito + Tríceps ou criadas por você), séries por exercício e cardio.
- **Ferramentas**: apps e sites que você usa, com o e-mail ou usuário de cada um (nunca a senha).

No celular, as abas ficam numa barra embaixo; o que não cabe vai para **Mais**.

## Seus dados

No app, toque na bolinha com a sua inicial (canto superior) para **baixar uma cópia** dos seus dados ou **importar** um arquivo.
