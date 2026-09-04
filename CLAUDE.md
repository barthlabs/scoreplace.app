# scoreplace.app - Projeto de Contexto

## O que e o scoreplace.app

Plataforma web de gestao de torneios esportivos e board games. App SPA (Single Page Application) em **vanilla JS puro** â sem frameworks. Hospedado no **Firebase Hosting** (site `scoreplace-app`) com dominio customizado `scoreplace.app` — **desde ago/2026; NÃO é mais GitHub Pages**. Publicar exige `firebase deploy --only hosting`; `git push` versiona o repo e **não** muda o site. Detalhe na seção Deploy e em `project_prod_deploy_target`.

> ⚠️ **CONVENÇÃO CRÍTICA — nomes de formato são SÓ EXIBIÇÃO (desde jun/2026, staging):** na tela, "Liga" virou **"Pontos Corridos"** e "Grupos + Eliminatórias" virou **"Fase de Grupos"**. MAS o valor interno `t.format` é INTOCADO de propósito: continua `'Liga'` (legado `'Ranking'`) e `'Fase de Grupos + Eliminatórias'`; os códigos seguem `'liga'`/`'grupos_mata'`; `_isLigaFormat` checa `=== 'Liga'`. **Regra dos dois lados:** falando com o usuário/UI = use os nomes novos; lendo/escrevendo LÓGICA = os valores são AINDA os antigos — NUNCA "consertar" `=== 'Liga'` achando que é resíduo (quebra motor de sorteio/autoDraw/dados). Exibição passa por `window._formatDisplayName(fmt)` (store.js) ou pelas chaves i18n `format.*`. Detalhe na memória `project_format_rename_display_only`.

- **Versao atual:** `1.7` (definida em `window.SCOREPLACE_VERSION` no store.js; esquema alinhado às lojas desde a v1.1 — ver memória `project_version_scheme_store_aligned`)
- ⛔ **A VERSÃO NATIVA É A MESMA DA WEB — `X.Y.Z` (ordem do dono, 27/ago/2026).**
  `MARKETING_VERSION` (iOS) e `versionName` (Android) passam a carregar o PATCH, iguaizinhos
  ao `window.SCOREPLACE_VERSION`. Antes a loja usava só `MAJOR.MINOR` (a build 265 subiu como
  "2.1" com o código da 2.1.6), e o dono cortou o padrão pela raiz: _"altere esse padrao que
  é impossivel de alcancar. vc sempre faz cagada na nativa e nunca fica x.y no final…
  adotemos o mesmo padrao da web x.y.z"_.
  **Por que ele está certo:** com dois esquemas, "alinhado" virava julgamento — e a conta
  batia de formas diferentes a cada leva. Com um só, alinhamento é comparação de string:
  o que o testador lê no TestFlight é o mesmo número que o `version.txt` do ar.
  O `CURRENT_PROJECT_VERSION` (build) segue independente e sempre incrementando — ele é da
  Apple, não do produto. Primeira build no padrão novo: **2.1.22 (266)**.
- **Convenção de versão (a partir de 30 Abr 2026):** `MAJOR.MINOR.PATCH-channel` no padrão semver. Em fase **beta**, incremento PATCH a cada deploy (`1.0.0-beta` → `1.0.1-beta` → `1.0.2-beta` → ...). MINOR sobe quando há feature significativa nova; MAJOR reservado pra v2.0 (mudanças incompatíveis). Estável: dropar o `-beta` (`1.0.0`).
- **URL principal:** https://scoreplace.app
- **GitHub repo:** `barthlabs/scoreplace.app` — ⚠️ **NÃO é `rstbarth/scoreplace.app`**, que este arquivo afirmou até 10/ago/2026. Os dois existem: `rstbarth/` é um espelho **ABANDONADO** (último push 20/mai/2026, `main` em `0ce285bb`) e `barthlabs/` é o `origin` de verdade. Isso importa porque o GitHub é **o backup** contra a corrupção do `.git` pelo Drive ([[project_git_repo_lives_in_google_drive]]): empurrar backup pro espelho morto — ou LER dele achando que é atual — é falha silenciosa. Conferir sempre com `git remote -v`.
- **Banco de dados:** Cloud Firestore (projeto Firebase: `scoreplace-app`)
- **Auth:** Firebase Auth com Google Sign-In (popup)
- **localStorage:** prefixo `scoreplace_*` (preferências, cache)
- **Email de suporte:** scoreplace.app@gmail.com

## 🚀 Fase de Desenvolvimento — BETA

**O projeto está em fase BETA desde 2026-04-29.** Regras a partir daqui:

- **Dados são REAIS.** Torneios, partidas casuais, presenças, locais, perfis — tudo que o usuário cria PERSISTE. Não apagar nada sem comunicação prévia.
- **Schemas estáveis.** Mudanças de schema agora exigem código de migração ou backward-compat. Não pode quebrar dados existentes silenciosamente.
- **Reset de coleções proibido** sem aviso explícito aos usuários afetados. Em alpha era livre — em beta é compromisso.
- **Defensive code OK** quando lidar com docs antigos: branches `if (legacy_shape)`, fallbacks pra campos opcionais, normalização de payload no read são aceitáveis e recomendados.
- **Comunicação obrigatória** antes de qualquer mudança que afete dados do usuário.

### Reset histórico (transição alpha → beta) — 2026-04-29
Na transição do alpha pra beta foi feito o reset final das coleções:
- ❌ Apagadas: `tournaments`, `venues`, `presences`, `casualMatches`, `mail`
- ✅ Preservadas: `users` (perfis dos amigos com aceite de termos), notificações já lidas

A partir desse reset, **base de dados é considerada produção** e qualquer alteração destrutiva exige fluxo formal.

### Critérios de saída pra v1.0.0 estável
- ✅ Performance Lighthouse ≥ 60 (atual 64 — aceito definitivamente; não impede lojas)
- ✅ Acessibilidade ≥ 95 (atual 96)
- ✅ E2E ≥ 10 cenários green (34 testes)
- ✅ Sentry recebendo eventos
- ✅ Backup Firestore diário
- ✅ Quotas + alertas Firebase (3 policies + budget)
- ✅ Privacy + Termos publicados
- ✅ Revisão jurídica (Privacy/Terms cobre uso — fechado em 2026-05-28)
- ✅ 30 dias de uso real sem bug crítico — início 2026-06-11 (primeiro torneio real), janela cumprida em 2026-07-11.
  ⚠️ **A numeração seguiu pelas LOJAS, não pelo marco "v1.0.0 estável"**: a v1.1 alinhou o esquema (ver
  `project_version_scheme_store_aligned`) e o app está publicado na faixa **1.7.x**. O rótulo "beta" sobrevive
  no texto de algumas telas — trocar isso é decisão de produto pendente, não critério técnico em aberto.

## Historico do Projeto

Projeto criado em Março 2026 como **scoreplace.app**. Lançado em beta soft em 29 de Abril de 2026 (v1.0.0-beta), após ~400 versões alpha consolidando os 5 pilares: torneios, partidas casuais, presença, locais e stats.

### Changelog → `docs/CHANGELOG.md`

O changelog completo **saiu deste arquivo** (19/ago/2026). Ele somava **507 KB dos
565 KB** do `CLAUDE.md` — 90% do que era carregado em toda sessão — e é **histórico, não
instrução**. Nada foi apagado: está inteiro em [`docs/CHANGELOG.md`](docs/CHANGELOG.md).

- detalhe de uma versão: `grep -n "1\.9\.5" docs/CHANGELOG.md`
- o que foi ao ar quando: `git log --oneline | grep 1.9.5`
- o que o USUÁRIO vê como novidade: `js/release-notes.js` (é outra coisa — texto para
  quem joga, não para quem programa)

⚠️ **Não trazer o changelog de volta pra cá.** O `CLAUDE.md` é lido inteiro toda vez; o
que entra nele tem que mudar uma DECISÃO de quem está programando. Registro de versão não
muda — ele só ocupa o lugar de quem muda.
⚠️ **Entrada nova de versão vai pro `docs/CHANGELOG.md`**, no topo, não aqui.

## Arquitetura

```
scoreplace-app/
|-- index.html          # Entry point SPA (topbar com Inicio, Explorar, Notificacoes, ?, Login)
|-- css/
|   |-- style.css       # Variaveis de tema e estilos base
|   |-- components.css  # Componentes (botoes, modais, cards, forms)
|   |-- layout.css      # Layout principal
|   |-- bracket.css     # Estilos do chaveamento/bracket
|   |-- responsive.css  # Media queries (767px / 768-1199px / 1200px+)
|   `-- drag-drop.css   # Drag-and-drop (sorteio)
|-- js/
|   |-- theme.js              # Injecao de tema (antes do body para evitar flicker)
|   |-- store.js              # SCOREPLACE_VERSION + AppStore + Firestore sync + realtime listener + auto-update checker
|   |-- firebase-db.js        # CRUD Firestore (saveTournament, loadAllTournaments, etc.)
|   |-- notifications.js      # Sistema de notificacoes toast + FCM client
|   |-- notification-catalog.js # Catalogo central de tipos de notificacao (tournament, presence, casual, org, social, etc.)
|   |-- ui.js                 # Helpers de UI (modais, elementos interativos)
|   |-- router.js             # Roteador hash-based (#dashboard, #tournaments, #venues, #my-venues, #presence, #casual, etc.)
|   |-- main.js               # Inicializacao + modal Help (searchable accordion) + modal Criacao Rapida
|   |-- hints.js              # Sistema "Dicas do App" - baloes contextuais por area/contexto
|   |-- email-templates.js    # Templates de email (convites, resultados, lembretes)
|   |-- i18n.js               # Sistema i18n - window._t(key, vars), toggle PT/EN
|   |-- i18n-pt.js            # Strings PT-BR (centenas de chaves)
|   |-- i18n-en.js            # Strings EN
|   |-- venue-db.js           # CRUD Firestore para locais (venues) - save, claim, search, rate
|   |-- presence-db.js        # CRUD Firestore para presencas (check-in/check-out, quem esta no local)
|   |-- presence-geo.js       # Auto check-in via Geolocation, calculo de distancia, GPS centering
|   `-- views/
|       |-- landing.js              # Landing page publica (5 pilares - torneios, casual, presenca, locais, stats)
|       |-- auth.js                 # Firebase Auth REAL + perfil completo (idade, altura, esportes, niveis notif, CEPs)
|       |-- dashboard.js            # Tela inicial: welcome card, nudges, pills (presence/casual), cards de torneios
|       |-- tournaments-utils.js    # Funcoes utilitarias de torneios
|       |-- tournaments-sharing.js  # Compartilhamento, convites, QR Code, "Adicionar a agenda"
|       |-- tournaments-analytics.js# Estatisticas e analytics
|       |-- tournaments-organizer.js# Ferramentas do organizador
|       |-- tournaments-categories.js# Sistema de categorias: merge/unmerge, auto-assign, estimativa de duracao
|       |-- tournaments-enrollment.js# Inscricao/desinscricao, adicionar participante/time, excluir torneio
|       |-- tournaments-draw-prep.js# Preparacao de sorteio, enquetes (polls), resolucao times/potencia de 2
|       |-- tournaments-draw.js     # Geracao de chaves, drag-and-drop (painel final pulado desde v0.14.40)
|       |-- tournaments.js          # Orquestrador principal: render de cards, detalhes, comunicacao
|       |-- create-tournament.js    # Modal criacao/edicao + logo canvas generator + GSM config + Estimativas
|       |-- participants.js         # Gestao de participantes
|       |-- pre-draw.js             # Tela de pre-sorteio
|       |-- chaves.js              # MOTOR de chaves deterministico - a chave e funcao pura de (N, formato)
|       |-- bracket-model.js        # Model do bracket (extraido de bracket.js) - estruturas de dados puras
|       |-- bracket-logic.js        # Computacao de standings, Swiss pairing, advance winner, auto-finish, 3rd place
|       |-- bracket.js              # Renderizacao bracket + classificacao + GSM display + Liga "Seu jogo" layout
|       |-- bracket-ui.js           # UI interativa: save result inline, set scoring overlay, TV mode, sort standings
|       |-- host-transfer.js        # Sistema de co-organizacao (compartilhar/transferir), participant picker
|       |-- rules.js                # Regras do torneio
|       |-- explore.js              # Explorar torneios publicos + cards de amigos compactos
|       |-- venues.js               # #venues - descoberta publica de locais (mapa interativo, GPS, filtros, avaliacoes)
|       |-- venue-owner.js          # #my-venues - gerenciamento para proprietarios (grade 7x24, quadras multi-sport)
|       |-- presence.js             # #presence - check-in/check-out, quem esta no local, plano de presenca
|       `-- notifications-view.js   # View de notificacoes
```

> **Nota:** `result-modal.js` e `enroll-modal.js` foram removidos em v0.16.42 (cleanup
> de dead code). Resultados de partida usam `_saveResultInline()` em bracket-ui.js;
> compartilhamento de torneio usa `_showAppInviteQR` + página `#invite` (v0.15.72).
> Features de Partida Casual (live scoring, momentum, Wake Lock) vivem em
> bracket-ui.js, bracket.js e dashboard.js.

### Os 5 Pilares do scoreplace.app
O produto gira em torno de **5 pilares** integrados (documentados na landing e no manual):
1. **Torneios** - SPA completa para eliminatorias, Liga/Suico, grupos, duplas.
2. **Partidas Casuais** - placar ao vivo sem criar torneio, QR/share, lobby, Wake Lock, momentum charts.
3. **Presenca** - check-in/out em locais, "quem esta aqui", plano de presenca, auto check-in via GPS, notificacao de amigos.
4. **Locais (Venues)** - mapa interativo de descoberta, filtros por distancia/esporte, avaliacoes, reivindicacao por proprietario, cadastro comunitario (grade 7x24 + quadras multi-sport), Pro monetization.
5. **Stats/Perfil** - estatisticas individuais e por torneio, historico, meu desempenho, amigos.

### Cache-busters atuais (index.html)
Cada `<script>`/`<link>` carrega `?v=<versao em que AQUELE arquivo mudou>` — não a versão atual do app. Então o
index.html tem vários números convivendo (ex.: `auth.js?v=1.7.12` ao lado de `bracket-logic.js?v=1.7.10`), e isso
é o esperado: só sobe o buster do que foi tocado. **Esquecer o buster = o navegador servir o arquivo velho** e o
fix não chegar em ninguém (aconteceu no redesenho do placar, que precisou de commit só pra isso).
`scripts/check-cache-busters.js` roda no gate.

**IMPORTANTE — validação do index.html:** sempre após editar `index.html`, rodar:
```bash
grep -c "<script" index.html && grep -c "</script>" index.html
```
Os dois números precisam ser iguais. Tag `<script>` sem fechamento consome silenciosamente as tags seguintes (ver incidente v0.16.11).

## Regras de Seguranca de Codigo

### CRITICO: Nunca deixar build/cache/node_modules/worktrees dentro da arvore sincronizada pelo Google Drive
⚠️ **JÁ CORRIGIDO (16/ago/2026) — o repo SAIU do Drive.** O repositório de trabalho é **`~/dev/scoreplace.app`**, em disco local comum. A pasta do Drive (`~/Library/CloudStorage/GoogleDrive-.../Meu Drive/scoreplace.app-main`) continua existindo, mas hoje é **só cofre de backup** — sem `.git` e sem código: guarda o bundle do repo, a **keystore do Android** (insubstituível) e os segredos locais. Tem um `LEIA-ME.txt` lá dentro explicando. O resto deste parágrafo é o **histórico do porquê**, e segue valendo como regra: **nunca clonar, criar worktree, `npm install` ou `./gradlew` dentro do Drive de novo.**

Enquanto o projeto viveu lá, isso ja corrompeu o `.git` uma vez, renomeando objetos (ver `project_git_repo_lives_in_google_drive`), e trava o Finder/`fileproviderd` do macOS de forma recorrente: builds do Gradle (`android/build`, `android/app/build`, `android/wear/build`, `android/.gradle`) e instalacoes de `npm` (`node_modules` na raiz, em `functions/`, `functions-autodraw/`, `functions-stripe/`) geram dezenas de milhares de arquivos pequenos que o Drive tenta sincronizar um a um. Quando esses arquivos sao apagados/recriados (rebuild, `npm install`) antes do Drive terminar de processar, o Finder trava tentando mover pra Lixeira e o `fileproviderd` entra em loop consumindo 100%+ de CPU por horas — so resolve matando o Google Drive (Sair, nao so fechar a janela) e, se persistir, forcando o Finder a reiniciar via Monitor de Atividade. Aconteceu de novo em 15/ago/2026 com mais de 78 mil itens acumulados na Lixeira.

**Git worktrees (`.claude/worktrees/*`) sao o maior agravante**: cada worktree e um checkout completo do repo: se `npm install`/`./gradlew` rodar dentro dela, o problema se multiplica por N worktrees. Em 15/ago/2026 as 3 worktrees ativas somavam mais de 600MB de `node_modules`/build cache duplicado, tudo dentro do Drive — foi limpo manualmente nessa data, mas volta a acontecer a cada novo build/install se ninguem limpar.

**Regra pratica** (essas pastas ja estao no `.gitignore` — o problema nao e git, e o Drive sincronizar localmente arquivos que nao deveriam ficar muito tempo no disco):
1. Ao terminar uma sessao de build/teste/install (nesta pasta OU numa worktree), limpar os diretorios gerados: `rm -rf android/build android/app/build android/wear/build android/.gradle node_modules functions/node_modules functions-autodraw/node_modules functions-stripe/node_modules .firebase outputs playwright-report test-results www firestore-debug.log` (caminhos relativos a raiz de cada worktree/checkout).
2. Antes de rodar uma bateria pesada de build/teste (`./gradlew assembleDebug`, `npm run test:e2e`, etc.), considerar fechar o Google Drive primeiro (icone na barra de menu -> engrenagem -> Sair) e reabrir depois — evita a corrida entre o build e o sync.
3. NAO "resolver" isso symlinkando `node_modules` (ou `build/`) pra fora do Drive sem tambem garantir que o `.gitignore` ignora o link em si e nao so o diretorio — foi exatamente isso que quebrou o GitHub Pages em 02/ago/2026 (`upload-pages-artifact` faz `tar --dereference`, o link aponta pra maquina local, o tar falha). Ver comentario nas linhas finais do `.gitignore` antes de mexer nisso de novo.
4. ✅ **FEITO em 16/ago/2026** (era "se tiver a chance de reestruturar"; foi reestruturado — o repo está em `~/dev/scoreplace.app`). A correcao definitiva e nao ter o repo dentro de uma pasta sincronizada por nuvem — Google Drive/iCloud nao substituem o GitHub como fonte de verdade/backup, e ativamente atrapalham build tools. Preferir clonar em `~/dev/` ou equivalente fora de qualquer sync.

### OBRIGATORIO: Validacao Sintatica Apos Qualquer Edicao
**CRITICO:** Apos QUALQUER edicao de codigo (especialmente auditorias de seguranca, escaping de XSS, ou operacoes de busca-e-troca em massa), DEVE-SE validar que todo arquivo JS modificado faz parse sem erros de sintaxe. Executar antes de fazer deploy:

```bash
for f in $(find js/ -name '*.js' ! -name '*.backup'); do
  node --check "$f" 2>&1 || echo "SYNTAX ERROR in $f";
done
```

Se `node` nao estiver disponivel, no minimo inspecionar visualmente todo handler onclick/oninput modificado para garantir que template literals estao fechados corretamente.

### Padrao Perigoso Conhecido: Escaping em onclick com Multiplos Argumentos
Ao escapar IDs em onclick handlers dentro de template literals, **nunca** quebrar o template literal entre argumentos.

**ERRADO (quebra o arquivo inteiro):**
```js
onclick="func('${String(id).replace(/'/g, "\\'")}'${', \'arg2\''})"
```
O `'${'` fecha a string JS prematuramente â SyntaxError â arquivo inteiro nao carrega e TODAS as funcoes definidas nele deixam de existir silenciosamente.

**CORRETO:**
```js
onclick="func('${String(id).replace(/'/g, "\\'")}', 'arg2')"
```
Apenas valores dinamicos (variaveis) precisam de `${}`. Argumentos fixos (strings literais) vao diretamente no template.

### Incidente Historico (v0.4.3-alpha)
A auditoria XSS da v0.4.3 aplicou escaping em ~30 onclick handlers. Nos casos com dois parametros, o padrao de escaping quebrou a sintaxe do template literal em `tournaments-draw-prep.js` (linha 106) e `bracket.js` (linha 773). Ambos os arquivos falharam ao carregar por completo, desabilitando silenciosamente: toggleRegistrationStatus, checkPowerOf2, showPowerOf2Panel, zoom do bracket, toggle de visibilidade de rodada, e encerramento de rodada. Isso passou despercebido por multiplos deploys porque nao havia etapa de validacao sintatica. Corrigido na v0.4.3e.

## Padrao de Codigo

### Roteamento
Hash-based SPA routing em `router.js`. Rotas: `#dashboard`, `#tournaments`, `#pre-draw`, `#bracket`, `#participants`, `#rules`, `#explore`, `#notifications`, `#profile`, `#support`, `#privacy`, `#terms`, `#invite`. Cada view e uma funcao `render[ViewName](container)` exportada globalmente.

#### REGRA CRITICA (v1.3.5-beta) — SEMPRE usar o padrao centralizado de page-route
**NUNCA recriar o cabecalho padrao via hacks CSS em `.modal-overlay`.**
Quando precisar de uma tela com topbar visivel + back-header + conteudo full-width
scrollavel, usar EXATAMENTE o mesmo padrao de `#support`, `#privacy`, `#terms`,
`#invite`, `#profile`:

1. Definir `window.renderXxxPage(container)` que chama `_renderBackHeader({href, label, middleHtml, rightHtml})` e seta `container.innerHTML = hdr + bodyHtml`.
2. Adicionar `case 'xxx':` em `js/router.js` chamando `window.renderXxxPage(viewContainer)`.
3. Converter qualquer `_openXxxModal()` legado em wrapper que faz `window.location.hash = '#xxx'`.
4. Criar `window._closeXxxPage()` se houver call-sites externos de fechamento.
5. Topbar (logo + nav + hamburger) FICA VISIVEL — modal-overlay cobre topbar, page-route nao.

**Exemplos canonicos pra copiar:**
- `window.renderSupportPage` em `js/store.js` (~linha 1198)
- `window.renderInvitePage` em `js/views/tournaments-sharing.js`
- `window.renderProfilePage` em `js/views/auth.js` (a partir da v1.3.5-beta)

**Anti-padrao (sinais de alerta):** se voce esta fazendo qualquer um destes pra
uma tela que deveria seguir o padrao standard, **PARE** e procure exemplos de
`renderXxxPage`:
- `top: 60px !important` em modal-overlay
- Adicionar id de modal a multiplos seletores CSS de back-header
- Injetar `_renderBackHeader` HTML dentro de `.modal-overlay > .modal`
- `position: fixed; inset: 0; z-index: 10020` pra "fazer modal full-screen"
- Hooks em `openModal()` pra coordenar fechamento com hashchange

**User (Maio 2026):** _"a administração disso está centralizada no app justamente para vc não ficar tentando copiar o que já está feito e aprovado. encontre isso e aplique o que já está feito, centralizado e aprovado sem tentar recriar o que descrevi."_ — _"isso precisa ser lembrado e nunca esquecido."_

**Modal-overlay continua valido para:** dialogos rapidos (login, share QR, GSM
config), prompts (alertDialog, confirmDialog), e overlays full-screen onde voce
QUER esconder a topbar (ex: `#venues-detail-overlay`, `#enrollment-report-modal`).

### Estado Global
`window.AppStore` em `store.js` com metodos:
- `sync()` â salva torneios do organizador no Firestore (ATENCAO: so salva torneios onde organizerEmail === currentUser.email)
- `toggleViewMode()` â alterna organizador/participante
- `isOrganizer(tournament)` â verifica se usuario logado e organizador
- `getVisibleTournaments()`, `getMyOrganized()`, `getMyParticipations()`
- `addTournament(data)`, `logAction(tournamentId, message)`
- `loadFromFirestore()`, `loadUserProfile(uid)`

**IMPORTANTE:** `sync()` so salva torneios do organizador. Inscricoes de nao-organizadores devem chamar `FirestoreDB.saveTournament(t)` diretamente.

### Autenticacao
Firebase Auth (compat mode) em `auth.js` com credenciais REAIS do projeto `scoreplace-app`:
- `handleGoogleLogin()` â popup Google real
- `simulateLoginSuccess(user)` â atualiza AppStore + UI do topbar (avatar + nome + icone logout)
- `handleLogout()` â Firebase signout + reset de UI
- `setupLoginModal()`, `setupProfileModal()` â criam modais no DOM
- Dominio autorizado no Firebase: `scoreplace.app`
- Auto-inscricao pos-login via `_pendingEnrollTournamentId` (sessionStorage)
- Perfil inclui: `notifyLevel` (todas/importantes/fundamentais), `preferredCeps` (string CSV)
- Botoes de filtro de notificacao: `_toggleNotifyFilter(level)`, `_applyNotifyFilterUI(level)`
- Apos login, dispara `_checkTournamentReminders()` e `_checkNearbyTournaments()` com delay de 3s

### Sistema de Notificacoes (tournaments.js)
Funcoes centralizadas no topo de `tournaments.js`:
- `_notifLevelAllowed(userLevel, notifLevel)` â verifica se notificacao deve ser enviada
- `_sendUserNotification(uid, notifData)` â envia para um usuario (Firestore subcollection `users/{uid}/notifications/`)
- `_notifyTournamentParticipants(tournament, notifData, excludeEmail)` â envia para todos inscritos
- `_checkTournamentReminders()` â lembretes 7d/2d/dia-do, deduplicacao via localStorage
- `_checkNearbyTournaments()` â torneios no CEP de preferencia (unica excecao: envia mesmo sem inscricao)
- Niveis de notificacao: 'fundamental', 'important', 'all'
- Comunicacao do organizador: `_sendOrgCommunication(tId)` com modal de texto + seletor de importancia
- Botao "Comunicar Inscritos" visivel so para organizador na view de detalhe

### Logo de Torneio (create-tournament.js)
- Canvas API com paletas por esporte (`_sportColorPalettes`), gradientes, emoji watermark
- Considera: venue, sport, format na geracao
- Botoes: Gerar (ð¨), Regerar (ð), Lock/Unlock (ð/ð), Download (â¬ï¸), Upload (ð), Clear (â)
- Upload: FileReader + canvas resize (max 400x400, JPEG quality 0.85)
- Dados salvos no Firestore: `logoData` (base64), `logoLocked` (boolean)
- Logo exibida no dashboard cards (56x56) e na view de detalhe

### Help Modal (main.js)
- `setupHelpModal()` substitui `setupAboutModal()`
- 16 secoes accordion com classe `.help-section.open` para animacao
- Campo de busca `#help-search-input` com `_filterHelpSections()` para filtragem em tempo real
- Secao "Sobre" aberta por padrao (versao, copyright)

### Fluxo de Convite (Invite Flow)
1. Usuario recebe link `https://scoreplace.app/#tournaments/{id}`
2. Router permite acesso SEM login â salva `_pendingInviteHash`
3. Pagina de detalhes do torneio exibe CTA "Inscrever-se" em destaque
4. Clique no botao dispara login Google
5. Apos login, auto-inscricao via `_pendingEnrollTournamentId` (sessionStorage)
6. Redireciona para pagina do torneio com usuario ja inscrito

### Fluxo de Criacao de Torneio
1. Usuario clica "+Novo Torneio" no dashboard
2. Abre `modal-quick-create` (modal intermediario em `main.js`) com:
   - Seletor de modalidade esportiva
   - "Criar Torneio" â cria com defaults + auto-nome + redireciona para pagina do torneio
   - "Detalhes Avancados" â abre `modal-create-tournament` (formulario completo em `create-tournament.js`)
   - "Cancelar" â fecha sem criar
3. Auto-nome: "Torneio [modo] de [modalidade] de [primeiro nome do usuario]"

### Deteccao de Alteracoes em Torneio (create-tournament.js)
Ao salvar edicao de torneio, compara campos antes/depois:
- Campos monitorados: name, startDate, endDate, venue, format, maxParticipants, enrollmentMode, registrationLimit
- Se houver alteracoes, notifica participantes via `_notifyTournamentParticipants` (level: 'important')

### ⛔ CONTRASTE — regra permanente, nos DOIS temas (ordem do dono, 16/ago/2026)
> _"tudo sempre tem que apresentar essa regra de contraste. nos temas claro e escuro. sempre.
> em tudo o que temos agora e em tudo o que viermos a criar."_

Todo texto tem que passar **WCAG AA (4.5:1; 3:1 se grande)** e toda caixa tem que se separar do
fundo **nos dois temas**. Travado por `tests/contraste-nos-dois-temas.test.js` (no `npm test`, que
roda no `hosting.predeploy` → quebrou, **não publica**).

Ao escrever UI nova:
- **Não use hex pálido inline** (`color:#fde68a`) como cor de texto: no tema claro ele cai sobre
  fundo claro. Ou use token (`var(--text-*)`), ou acrescente a tradução no bloco `[data-theme="light"]`
  de `css/style.css` — o teste cobra.
- **Fundo/borda translúcidos** (`rgba(255,255,255,α)`, `rgba(0,0,0,α)`) precisam da tradução do
  tema claro. Alpha novo = teste vermelho.
- **Superfície INVERTIDA** (`.stat-box`, `.tourn-config-box`, `window._photoReadBox()`) é tarja
  ESCURA com texto CLARO **nos dois temas** — ali o remap se desliga. Texto de acento sobre ela
  vem de **CLASSE** (ex.: `.stat-accent`), nunca de hex inline (o remap só reescreve `style` inline).
- **A régua não é `#fff`**: quase todo texto secundário mora numa caixa com tinta de 6%, então meça
  contra `rgb(238,233,247)`. Foi o que reprovou um `--text-muted` que passava no branco puro.
- Texto sobre botão de cor **sólida** renderiza igual nos dois temas → não é bug de tema claro.

Detalhe e histórico: memória `feedback_contraste_sempre_nos_dois_temas`.

### CSS / Responsividade
- Mobile-first com breakpoints: `max-width: 767px`, `768px-1199px`, `min-width: 1200px`
- Touch targets: labels com minimo 44px, checkboxes 22px
- Modais viram bottom-sheets em mobile
- Datas empilham verticalmente em mobile (classe `dates-row`)
- Botao hero (`.btn-create-hero`) e absolute no desktop, static no mobile
- Variaveis CSS em `:root` para temas (dark padrao, light, high-contrast, catppuccin)

### Busca de Local (Venue)
- Google Places API (New) â `AutocompleteSuggestion.fetchAutocompleteSuggestions()` (programmatic, sem UI do Google)
- Custom UI: input `#tourn-venue` + dropdown `#venue-suggestions` em dark theme
- Restrito ao Brasil: `includedRegionCodes: ['br']`
- Dados salvos: venue, venueLat, venueLon, venueAddress, venuePlaceId, venueAccess
- API key: compartilhada com Firebase (Google Cloud Console projeto scoreplace-app)
- **NAO usar** `PlaceAutocompleteElement` â causa crash de tela branca

### Botoes do Organizador (Tournament Detail View)
- **Inscricoes abertas, sem sorteio**: Convidar, Inscrever-se, +Participante, +Time (if mode allows), Encerrar Inscricoes, Sortear, Comunicar Inscritos, Apagar
- **Inscricoes fechadas, sem sorteio**: Reabrir Inscricoes, Sortear, Comunicar Inscritos, Apagar
- **Apos sorteio (nao iniciado)**: Iniciar Torneio, Ver Chaves, Comunicar Inscritos, Apagar
- **Torneio em andamento**: Badge "Em andamento", Ver Chaves, Comunicar Inscritos, Apagar
- `hasDraw` deve usar `(Array.isArray(t.matches) && t.matches.length > 0) || (Array.isArray(t.rounds) && t.rounds.length > 0) || (Array.isArray(t.groups) && t.groups.length > 0)`

## Versionamento

O projeto segue semver simplificado. Versao definida em `window.SCOREPLACE_VERSION` (store.js).
Visivel para o usuario no modal "Help" (secao Sobre, primeira accordion).

- **0.1.x-alpha** â Fase inicial. Firestore ativo, auth real, fluxo de convite
- **0.2.x-alpha** â Fase atual. Unificacao Liga/Ranking, encerramento automatico, podio, validacoes, seguranca
- **0.3.x-alpha** â Rankings, historico, PWA, push notifications
- **0.4.x-alpha** â Auditoria completa, novos temas, sistema GSM
- **1.0.0** â Release estavel

## Proximos Passos Conhecidos

⚠️ **Esta seção foi reescrita em 19/ago/2026 porque estava MENTINDO.** Ela dizia que o
Apple Watch tinha sido "rolled back e poderia voltar", que os testes eram "uma suíte
básica em tests.html" e que as notas de versão viviam no `main.js` — tudo falso e capaz
de mandar uma sessão inteira pro caminho errado. Instrução desatualizada é pior que
instrução ausente: a ausência faz perguntar, a mentira faz agir.
**Regra:** item aqui que virar realidade sai daqui no MESMO commit em que virou.

### Estado real do que costumava aparecer como "em aberto"
- **Relógio (Apple Watch / Wear)** — FEITO e no TestFlight. Motor de pontuação NATIVO com
  event-sourcing (Caminho B), paridade provada entre JS, Swift e Java nos mesmos vetores.
  Ver a memória `project_watch_caminho_b_event_sourcing`. ⏳ O que falta é AUTONOMIA: o
  motor local só arma no 0-0 e o relógio ainda depende do celular logado ao lado.
- **Testes** — 386+ suítes por `npm test`, que é GATE do deploy (roda no predeploy).
  ⚠️ A lista é À MÃO em `tests/run-unit.js`: teste fora dela nunca roda e a suíte fica
  verde mentindo. Ver `project_test_suite_is_a_hardcoded_list`.
- **Notas de versão** — `js/release-notes.js` (texto pra QUEM JOGA), com gate próprio
  (`scripts/check-release-notes.js`). Não é o changelog, que é `docs/CHANGELOG.md`.
- **Performance** — NÃO está resolvida. Frente aberta e medida: montar a tela de um
  torneio grande (Confra, 137 inscritos) ainda é o custo dominante. Ver a memória
  `project_replay_e_lista_em_blocos_pendentes`.

### Quando iniciar uma nova feature
1. Ler as MEMÓRIAS do projeto antes deste arquivo — elas têm as armadilhas já pagas.
2. Checar se já existe: `git log --oneline | grep <tema>` e `docs/CHANGELOG.md`.
3. Padrão vanilla JS + AppStore + views globais + i18n (`_t(chave)`).
4. Na MESMA leva: bump de versão, cache-busters, nota de versão, `npm test` verde e
   `scripts/deploy-hosting.sh` — o main descreve o que está no ar.

## Cloud Functions (ESTÃO NESTE REPOSITÓRIO — não deferir por "não estão no repo")

**IMPORTANTE — leia antes de dizer que algo depende de backend "fora do repo".**
As Cloud Functions são versionadas AQUI. O `.gitignore` só ignora `node_modules`,
nunca o código-fonte. **TRÊS** codebases (o 3º nasceu depois deste texto):

- **`functions/`** — codebase `default` (**nodejs22**, ver `firebase.json`). É o grande
  (`functions/index.js`). ~52 exports; conferir a lista viva com
  `grep -o '^exports\.[A-Za-z0-9_]*' functions/index.js`. Entre elas: `sendMagicLink`,
  `setParticipantsProfile`, `backupFirestore`, `enrollParticipant`/`deenrollParticipant`,
  `applyLetzplayScans`, `respondHostInvite`, `sweepAbandonedTournaments`, os triggers
  `autoMergeOnProfileUpdate`/`enforceUniqueDisplayName`/`syncMatchRosters`, e vários
  `cleanup*`/`scheduled*`.
  ⚠️ **As CFs de WhatsApp SAÍRAM** (`processWhatsAppQueue`, `notifyLeagueRoundWhatsApp`,
  `sendWhatsAppMagicLink`): o canal morreu com o bloqueio da Meta — ver
  `project_whatsapp_meta_2fa_block`. Hoje "WhatsApp" no app é só link `wa.me` + grupo
  (`project_whatsapp_is_wame_only`). **O servidor NÃO envia SMS**: quem envia é o Firebase,
  pelo cliente (`signInWithPhoneNumber`) — saber isso evita projetar fluxo que não existe.

  **Módulos PUROS ao lado do index** (`*-core.js` + `merge-rules.js`/`uid-sweep.js`): o
  `index.js` não é `require`-ável em teste (registra onCall/onSchedule e lê secrets no
  import), então toda regra que dói errar mora num módulo puro, com `functions/test-*.js`
  no `npm test` exercitando o CÓDIGO REAL — não uma réplica, que já deixou suíte verde com
  o index revertido. Hoje: `merge-rules` (quem sobrevive na fusão), `profile-merge-core`
  (o que viaja de perfil, e a escolha ATÔMICA do letzplay), `name-unique-core` (detecta
  homônimo; **NÃO exporta variante, e há teste travando isso**) × `name-variant-core`
  (a variante do login federado), `enroll-core`, `waitlist-core`, `abandon-core`,
  `cohost-core`, `pair-core`, `reminder-core`, `uid-sweep`.
- **`functions-autodraw/`** — deployment SEPARADO (tem `firebase.json` + `.firebaserc`
  próprios). Contém `autoDraw` (onSchedule every 1 hour — sorteia a próxima rodada
  de Liga e notifica) e `sendPushNotification` (FCM). A notificação genérica
  "Nova rodada sorteada!" sai daqui.
  - **IMPORTANTE (v2.3.91+):** `autoDraw` NÃO é mais um stub 1×1 — ele roda a
    lógica REAL de sorteio do cliente (Rei/Rainha, duplas, equilíbrio, categorias,
    folgas, desempate) via `draw-core.js` (shim Node `window=globalThis`) que dá
    `require()` em cópias dos arquivos do app em `functions-autodraw/vendor/`.
    `bracket-logic.js` expõe `window._generateNextRound` só pra isso. Validar com
    `cd functions-autodraw && node test-draw.js` antes de deployar. Ver memória
    `project_autodraw_server_parity`.
  - ⚠️ **O `vendor/` é GERADO — e "zero drift" só é verdade porque hoje há TRAVA.**
    Este arquivo dizia que o predeploy (`copy-vendor.js`, hook em `firebase.json`)
    garantia zero drift. Garante no que SOBE pro servidor; **não garante no que você
    TESTA**. 52 arquivos de teste carregam o servidor por `draw-core.js`, que dá
    `require()` no **vendor**, não no fonte — então, entre um deploy e outro, `npm test`
    exercitava a cópia congelada. Medido em 23/ago/2026: mudei `identity-core.js`/
    `bracket-logic.js`/`bracket-ui.js`, `npm test` deu **435/435 verde**; rodei o deploy
    da CF (que re-sincroniza o vendor) e **12 suítes quebraram na hora**
    (`late-entry-idempotent`, `late-dupla-pow2-grow`, `e2e-form-pair`,
    `classificatory-phase-sweep`, `functions-autodraw/test-integrate-late`…). E não era
    acidente: nos 45 dias anteriores, **737 de 1296 commits (57%) tinham vendor velho**.
    Desde então:
    - **`scripts/check-vendor-fresh.js` BARRA o `npm test`** (roda antes das suítes, no
      script `test` do `package.json`) se qualquer arquivo da lista divergir. Conserto:
      `node functions-autodraw/copy-vendor.js`.
    - **o `pre-commit` roda o copy sozinho** e põe o `vendor/` no MESMO commit da mudança
      em `js/views/` — por isso o bloqueio custa zero (ligue com `scripts/install-hooks.sh`).
    - **nunca editar `functions-autodraw/vendor/` à mão**: é saída de gerador, e a trava
      acusa na hora. Cobertura: `tests/vendor-do-autodraw-nao-fica-velho.test.js`.

**Deploy das functions (o `firebase` CLI está instalado e autenticado nesta máquina
como `rstbarth@gmail.com`; deploy é ação outward-facing → confirmar com o usuário):**

⛔ **NUNCA rodar `firebase deploy --only functions` puro, e NUNCA `--force`.** Os três
codebases (`functions/`, `functions-autodraw/`, `functions-stripe/`) se enxergam como
"default" — o deploy puro de qualquer um lista as funções dos OUTROS como "a deletar";
com `--force` DELETA (aconteceu em 02/ago/2026: ~15min de outage total das CFs, os
três codebases se apagando mutuamente — memória `project_autodraw_deploy_footgun`).
Sem `--force` o não-interativo aborta — o abort É o aviso, não um obstáculo.

- **Usar SEMPRE o script** (monta o deploy alvejado por nome sozinho, lendo os exports;
  roda os testes do autodraw antes de deployar sorteio):
  ```bash
  scripts/deploy-functions.sh main       # functions/ (o script LÊ os exports; não confie em contagem fixa)
  scripts/deploy-functions.sh autodraw   # functions-autodraw/ (roda test-draw.js antes; falhou = não deploya)
  scripts/deploy-functions.sh stripe     # functions-stripe/ (codebase NOMEADO — prefixo functions:stripe:)
  scripts/deploy-functions.sh all        # os três; aceita --dry-run
  ```
- Antes de mexer em função que roda em produção (ex.: `autoDraw` de hora em hora num
  torneio ao vivo), validar com o emulador (`firebase emulators:start --only functions`).
- Depois do deploy do autodraw, commitar o diff de `functions-autodraw/vendor/`
  (o predeploy re-sincroniza de `js/views/`).

**Segredos** (Evolution API, Stripe, etc.) vivem em `firebase functions:secrets:set …`,
NUNCA no git. `infra/whatsapp/` tem o Evolution API (Railway). O número que envia
WhatsApp e o do "Fale com o Desenvolvedor" é **barthlabs +55 11 98772-6873**
(WhatsApp Business orgânico apenas — `SCOREPLACE_DEV_WHATSAPP = '5511987726873'` em
store.js). Números queimados (não usar): `+55 11 91693-6454` e `+55 11 96658-1959`
(WhatsApp Business banidos pela Meta, jul/2026) e o stopgap pessoal
`+55 11 99723-7733` (conta TIM bloqueada, jul/2026).

## Revisão cruzada (Claude ⇄ GPT) — NADA se implementa sem o APROVADO do outro

Ordens do dono (04/set/2026): _"quero que o GPT sempre revise o que o Claude vai implementar,
pra sermos mais assertivos"_ · _"não executar o plano de cada ajuste sem aprovação: se ele
indicar ajustes, submete de novo até ele aprovar, e daí sim edita"_ · _"quem dispara indica o
modelo e esforço do revisor, e o revisor indica o modelo e esforço de quem executa"_ · _"pode ser
bidirecional? se eu disparar do Claude, GPT revisa; se disparar do GPT, Claude revisa"_ ·
_"quero poder desligar essa revisão automática e reativar quando voltarem os créditos"_.

**A ferramenta é uma só, `scripts/revisar.sh`, e os atalhos dizem QUEM revisa:**
- `scripts/revisar-com-gpt.sh` — o GPT (Codex CLI do app ChatGPT, `codex exec`, só leitura)
  revisa o que o **Claude** vai fazer. É o que o Claude usa.
- `scripts/revisar-com-claude.sh` — o Claude (`claude -p`, sem Edit/Write/Bash) revisa o que o
  **Codex** vai fazer. É o que o Codex usa (este arquivo é o mesmo AGENTS.md que ele lê).
- `scripts/revisar.sh` sem atalho = **auto**: o oposto de quem chamou (dentro do Claude Code
  chama o GPT; dentro do Codex chama o Claude; sem pista, os dois e os dois têm que aprovar).
  É assim que o `deploy-hosting.sh` chama no passo 1.8.

**A faixa é o PISO** — uma regra sobre os arquivos tocados (`revisar.sh faixa [arquivos]` só
classifica), não opinião de modelo:

| faixa | o que toca | revisor GPT | revisor Claude |
|---|---|---|---|
| **trivial** | só CSS/texto/notas/ícones, ou (só no diff) só o bump em `store.js` | não roda | não roda |
| **normal** | telas, componentes, fluxo de UI | perfil `revisao-normal` (medium) | sonnet, medium |
| **crítica** | `functions*/`, `firestore.rules`, `firebase.json`, `sw.js`, `store.js`, `router.js`, `main.js`, DB/presença/venue, chave/sorteio/format2/placar/inscrição/perfil/auth/W.O./fases, `scripts/deploy-*`, `scripts/check-*`, `scripts/revisar*`, `extensions/`, arquivo NOVO nesses lugares, ou diff > 300 linhas (não rastreados contam) | perfil `revisao-critica` (high) | opus, high |

**Quem escolhe o motor:** quem dispara indica o do revisor por `--modelo`/`--esforco` (nunca
abaixo do piso). O revisor devolve na 2ª linha do parecer `EXECUTOR: modelo=… esforco=…`, a
indicação dele pra quem vai executar. Como a sessão não troca o próprio modelo, quem executa
**diz a indicação ao dono antes de implementar** (ele troca com `/model` e `/effort` no Claude,
ou `/model` no Codex) ou executa por subagente com `model:` correspondente. Perfis do GPT em
`~/.codex/revisao-*.config.toml`; `~/dev/scoreplace.app` está *trusted* no `~/.codex/config.toml`.

**O fluxo, nesta ordem (faixa normal ou crítica), igual pros dois lados:**
1. **Plano antes de editar.** Escreva `.claude/tmp/plano-<assunto>.md`: o que muda, em quais
   arquivos, por quê, o que se espera ver. Rode `scripts/revisar-com-<outro>.sh plano <arquivo>`.
2. **Só `VEREDITO: APROVADO` libera** (exit 0). RESSALVAS (exit 1) e BLOQUEIO (exit 2)
   ⇒ atenda os pontos NO PLANO (seção "Resposta ao parecer": o que mudou e, se discorda, por
   quê) e **submeta de novo** — o script anexa o parecer anterior pra conferência ponto a ponto.
   Repita até APROVADO. ⛔ Nenhuma edição de código antes disso. Na faixa crítica o Claude
   pede também o subagente `revisor-critico` (Opus, high) e leva as divergências pro plano.
3. **Diff antes de publicar.** O `deploy-hosting.sh` roda `revisar.sh diff` (auto) no passo
   1.8 (origin/main..HEAD + sujo). Só APROVADO deixa passar; o resto **para o deploy antes do
   push** — "abort é o aviso". Sem veredito (exit 3) e cota esgotada (exit 4) NÃO são aprovação.
4. Escapes: `SP_GPT_FAIXA=normal|critica` só ELEVA (trivial é recusado). `SP_SEM_GPT=1` só no
   diff e só com uma linha `sem-gpt: <motivo>` num commit a publicar; nunca vale pra plano.
5. **Interruptor, um por lado:** `revisar-com-gpt.sh desligar "<motivo>"` / `ligar` e
   `revisar-com-claude.sh desligar "<motivo>"` / `ligar`; `revisar.sh status` mostra os dois.
   As chaves vivem em `~/.codex/scoreplace-revisao.desligada` e `~/.claude/scoreplace-revisao.desligada`
   (fora do repo, valem pra toda worktree). Desligado, aquele lado **passa com aviso** e o
   deploy segue. ⚠️ Enquanto um lado estiver desligado, quem implementa **diz isso em toda
   resposta que implementa algo** (o dono precisa lembrar de religar) e o plano continua
   sendo escrito.

Os pareceres ficam em `.claude/tmp/parecer-<revisor>-plano-<assunto>.md` e
`parecer-<revisor>-diff.md` (último) mais cópias datadas; `.claude/` é gitignored. ⛔ O revisor
**nunca edita**; quem implementa é quem disparou. ⚠️ Custo medido em 04/set: GPT, 56 mil
tokens num diff de 3 arquivos e 110 mil num plano crítico (a cota fechou no 2º parecer; reabre
06/set/2026 23:24). Por isso a faixa trivial existe e por isso o plano vai completo de primeira.

## Deploy

### ⚠️ PRIMEIRA COISA NUM CLONE NOVO: ligar os hooks

```bash
scripts/install-hooks.sh
```

**Hook não viaja no git.** Ele vive em `.git/hooks/`, que não é versionado — então o
`pre-push` que existia sumiu no reclone de 16/ago/2026 e ninguém notou até a **1.9.106 ir
pro ar com o `version.txt` do commit em 1.9.105**. Por isso o código dos hooks mora em
`scripts/hooks/` (versionado) e o instalador só os LIGA. Confira com
`scripts/install-hooks.sh --check`; uma instalação vale pra todas as worktrees (elas
compartilham o `.git/hooks` do repo pai).

**O que cada um faz:**
- **`pre-commit`** — roda o prerender (2,3s, idempotente) e põe `index.html` + `version.txt`
  DENTRO do commit. Eles são DERIVADOS de `window.SCOREPLACE_VERSION` (store.js); sem isso
  quem os gera é só o `hosting.predeploy`, que roda dentro da cópia em /tmp — o gerado vai
  pro ar e nunca volta pro repo, e o `main` para de descrever o ar.
- **`pre-push`** — só GUARDA: barra o push se o snapshot estiver velho e roda `npm test`
  quando o destino é `main`. Escapes: `SP_SKIP_HOOKS=1` (tudo) e `SP_HOOK_SKIP_TEST=1`
  (só a suíte — é o que o `deploy-hosting.sh` usa, porque o `hosting.predeploy` roda a
  MESMA suíte logo depois e aborta o upload sozinho).

⛔ **NUNCA gerar o snapshot no `pre-push` com `git commit --amend`** — foi como o hook
antigo estava documentado e **NÃO FUNCIONA**. O git congela o que vai ser empurrado ANTES
de chamar o pre-push, então o amend nasce fora do push. MEDIDO em laboratório (21/ago/2026):
foi pro remoto o commit PRÉ-amend (com `version.txt` velho) e o HEAD local ficou no
PÓS-amend — ou seja, além de não corrigir nada, deixa **local e remoto divergentes**, que é
exatamente o estado que faz o `deploy-hosting.sh` abortar na leva seguinte.

E mesmo sem hook nenhum instalado o ar não sai torto: o `deploy-hosting.sh` gera e commita
o snapshot no **passo 1.5**, antes de empurrar. Com o `pre-commit` ligado esse passo é
no-op; sem ele, vira o commit "`<versão> — snapshot do prerender que está no ar`"
automático, em vez do remendo manual.

⚠️ **PROD É FIREBASE HOSTING desde ago/2026 — NÃO é mais GitHub Pages.** Publicar é **UM comando**:

```bash
scripts/deploy-hosting.sh
```

Ele faz, nesta ordem: confere árvore limpa → **empurra HEAD pro `main`** (fast-forward; divergiu = aborta) → extrai o commit com `git archive` → carimba → `firebase deploy --only hosting` → confere o `version.txt` **no ar**. Aceita `--dry-run`.

⛔ **NUNCA `firebase deploy --only hosting` na mão.** Desde 12/ago/2026 há trava (`scripts/check-deploy-alignment.js`, 1º item do `hosting.predeploy`) que **bloqueia o deploy de qualquer coisa que não esteja em `origin/main`** — e, numa cópia extraída sem `.git`, bloqueia se não houver o carimbo que o script escreve.

**POR QUE A TRAVA EXISTE — e por que não é paranoia:** em 12/ago/2026 a produção ficou em **1.8.27 com o `origin/main` em 1.8.24**, 5 commits atrás. Ninguém errou comando: era o comportamento NORMAL do fluxo (cada sessão publica do seu branch/worktree e nada obrigava a empurrar pro main). A armadilha é que a leva seguinte publicada a partir do `main` **REBAIXA a produção**, tirando do ar versões que já servem gente. Ordem do dono: _"as coisas precisam estar alinhadas… apenas as versoes da loja ficam desalinhadas por um curto periodo de tempo por logistica apenas."_ Ou seja: **web publicada == `main`, sempre**; só as lojas podem atrasar, porque ali a revisão é de terceiro.

**A regra em uma linha: o `main` descreve o que está no ar.** Se `git rev-parse origin/main` não bate com o commit publicado, alguma coisa está errada — e a trava existe pra isso não chegar até esse ponto.

Escape hatch só pra emergência declarada: `SP_SKIP_ALIGNMENT=1` (avisa no console e o motivo tem que ir no commit).

⚠️ **DEPLOYAR SEMPRE DE UMA CÓPIA LOCAL EXTRAÍDA — sem rede, sem GitHub** (regra do dono, 07/ago/2026: _"pode até manter um backup no github, mas nao podemos ficar dependendo dele no dia a dia"_):

```bash
rm -rf /tmp/sp-deploy && mkdir -p /tmp/sp-deploy
git archive HEAD | tar -x -C /tmp/sp-deploy          # árvore COMMITADA, do repo LOCAL
# ⚠️ node_modules: apontar pro do REPO DE TRABALHO, não pro "$PWD" — ver a armadilha abaixo
ln -s "/Users/rtb/dev/scoreplace.app/node_modules" /tmp/sp-deploy/node_modules
ls /tmp/sp-deploy/node_modules/@playwright/test >/dev/null || echo "SYMLINK QUEBRADO — pare aqui"
cd /tmp/sp-deploy && firebase deploy --only hosting --project scoreplace-app
```

🪤 **A armadilha do `node_modules` quando se deploya DE UM WORKTREE (mordeu na 1.8.2).**
A receita antiga dizia `ln -s "$PWD/node_modules"`. Só que **worktree do git não tem
`node_modules` próprio** — os testes só passam nele porque o Node **sobe os diretórios**
até achar o do repo pai. Na cópia extraída em `/tmp` não existe pai, então o symlink fica
**pendurado** e o predeploy morre com `Cannot find module '@playwright/test'` em 3 suítes
de Chromium — **que estavam verdes no worktree**. Parece regressão do commit e não é.

Por que assim, e não das outras duas formas que já foram usadas:

- **`git archive` não usa rede.** O `git worktree add … origin/main` que se usava antes precisa que o commit esteja no GitHub, e **GitHub cai** — caiu em 06/ago, em major outage, no meio de uma leva. Publicar produção não pode depender de um terceiro. GitHub fica como **backup**, nunca como dependência do dia a dia.
- **Sai do Google Drive.** O `hosting.public` é `"."`, então **todo arquivo não-commitado da pasta vai pro ar junto** (na 1.7.60 havia 6 `_desenho-*.html` de rascunho que teriam sido publicados) — e a pasta ainda é compartilhada com outras sessões. O `.gitignore` **não** protege: quem filtra é o `ignore` do `firebase.json`. `git archive` entrega só o que está commitado, e o `/tmp` fica fora do sync do Drive, que já renomeou objetos do `.git` e quebrou o repo ([[project_git_repo_lives_in_google_drive]]).
- **Conferir antes de subir:** `find /tmp/sp-deploy \( -name '* 2' -o -name '* 3' -o -name '.DS_Store' \)` tem que voltar vazio.

⚠️ O `git archive` lê o `.git` local — se ele estiver corrompido pelo Drive, reparar primeiro (o commit está salvo no GitHub, que é justamente pra isso que o backup serve).

⛔ **Nunca `firebase deploy` puro** (sem `--only`): ele entra nos codebases de functions e os três se apagam mutuamente — ver `project_autodraw_deploy_footgun`.

**GATE DE PRODUÇÃO — agora ele mora onde a publicação acontece.** O `hosting.predeploy`
do `firebase.json` é `["npm test", "npm run prerender"]`: a suíte roda **antes de qualquer
upload** e, se reprovar, o deploy **aborta sem subir nada**. Antes o gate vivia no workflow
do GitHub, onde já não bloqueava coisa alguma — o deploy do Firebase é manual e não passava
por ele. **PROVADO, não presumido:** troquei o predeploy por um comando que falha, rodei o
deploy e ele parou com `Error: hosting predeploy error: Command terminated with non-zero
exit code 1`, com o `version.txt` ao vivo intacto. ⚠️ Nunca pôr `| tail` num predeploy — o
pipe transforma o exit code em zero e o gate vira decoração (mesma armadilha do
`deploy-functions.sh`).

**O GITHUB PAGES FOI DESATIVADO (07/ago/2026).** Ele continuava `built`, com
`cname: scoreplace.app`, disparando um build a cada push — um **segundo publicador
dormente** que mentia nos dois sentidos: vermelho parecia deploy quebrado (não era: quem
publica é o Firebase) e verde parecia deploy feito (também não era). E o build dele ficava
atrasado — se o DNS voltasse pra lá, o ar viraria a versão velha. Removidos: o site do Pages
(via API), o `CNAME`, o `.nojekyll` e o `pages.yml`. O que sobreviveu do workflow foi o que
valia: virou `.github/workflows/ci.yml`, que **só roda a suíte** e não publica nada.

**A REDE DE BAIXO É AUTOMÁTICA (22/ago/2026).** Além do GitHub, o repo inteiro é
guardado num `.bundle` único dentro do Drive — a rede pra quando o GitHub cai (já caiu no
meio de uma publicação, em 06/ago/2026). Isso **não depende mais de ninguém lembrar**: o
`deploy-hosting.sh` chama `scripts/backup-bundle.sh` no passo 8, então **o ar, o `main` e o
backup saem juntos**. O script gera em `/tmp`, roda `git bundle verify` e **só então** troca
o arquivo (bundle corrompido que substitui um bom é pior que backup nenhum), e pula sozinho
se já estiver empatado. Drive desmontado **não derruba** um deploy já publicado: avisa e sai 0.

```bash
scripts/backup-bundle.sh --check   # sai 1 se o backup estiver atrás do main
```

**POR QUE VIROU SCRIPT:** em 22/ago/2026 o bundle estava em **1.8.93 com o ar em 2.0.6 —
225 commits atrás**. Ninguém errou comando: o procedimento estava escrito à mão no
`LEIA-ME.txt` do Drive, e procedimento à mão não é executado. Segunda rede 225 commits
atrás não é rede. Mesma lição do `check-deploy-alignment.js`: o que não é gate, não acontece.

⚠️ A pasta do Drive guarda também a **keystore do Android** (`android-signing/`) e os
segredos locais — coisas que **nunca** entram no git. Ela não é lixo a ser apagado; é cofre.

**BACKUP:** o backup do código é o **GitHub**, e ele não foi tocado — desativar o Pages
removeu só o papel de publicar. Como `hosting.public` é `"."`, o site é a raiz do repo
servida como está: **qualquer commit pode ser republicado** com checkout + deploy. **E o Firebase guarda histórico próprio: MEDIDO em 07/ago/2026, 9 releases
`FINALIZED`** (o mais antigo de 24/jun). Ou seja, dá pra voltar no ar uma versão anterior
sem depender de rebuild. ⚠️ O CLI **não** expõe isso — `firebase --help` só tem canais,
`hosting:clone` e `hosting:disable`. A leitura e o rollback são pela API REST, e o token
tem que ser o de **Application Default** (`gcloud auth application-default
print-access-token`) com `x-goog-user-project`; com o token de usuário comum dá
`PERMISSION_DENIED` — foi o que me fez concluir errado que não havia histórico.

```bash
T=$(gcloud auth application-default print-access-token)
# listar as versões guardadas
curl -s -H "Authorization: Bearer $T" -H "x-goog-user-project: scoreplace-app" \
  "https://firebasehosting.googleapis.com/v1beta1/projects/scoreplace-app/sites/scoreplace-app/releases?pageSize=10"
# voltar o ar pra uma delas (ROLLBACK — publica versão ANTIGA; confirmar com o dono)
curl -s -X POST -H "Authorization: Bearer $T" -H "x-goog-user-project: scoreplace-app" \
  "https://firebasehosting.googleapis.com/v1beta1/sites/scoreplace-app/releases?versionName=<versions/ID>"
```

⚠️ **Rollback NÃO é rotina de deploy** — ele coloca no ar uma versão MAIS VELHA. Só se
usa pra estancar uma leva que quebrou produção, e é ação outward-facing: confirmar antes.

**Como foi medido (06–07/ago/2026):** `scoreplace.app` resolve para **199.36.158.100** (IP
do Firebase; os 185.199.x do Pages não respondem mais pelo domínio); `scoreplace.app` e
`scoreplace-app.web.app` devolvem a mesma versão, com `last-modified` batendo no segundo com
o `Last Release Time` de `firebase hosting:channel:list`; e o `firebase deploy --only
hosting` levou o `version.txt` ao vivo de 1.7.59 → 1.7.60 na hora. De quebra, em 06/ago o
GitHub Actions/Pages ficou em **major outage** e o site seguiu servindo normal.

### DNS
⚠️ Os registros do GitHub Pages abaixo são **HISTÓRICO** — o domínio foi movido pro Firebase Hosting (ver acima).
- A records: 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
- CNAME www â rstbarth.github.io

### Pre-requisitos
- **Hooks ligados**: `scripts/install-hooks.sh` (ver o topo desta seção — sem isso o
  snapshot do prerender não entra nos commits)
- Git inicializado na pasta local com remote `origin` apontando para `https://github.com/barthlabs/scoreplace.app.git` (⚠️ **não** `rstbarth/…` — ver o aviso lá em cima)
- `gh auth setup-git` executado para autenticacao via GitHub CLI
- `.gitignore` configurado (`.DS_Store`, `.claude/`, `*.backup`, `*.bak`, `outputs/`, `extensions/`, `functions/node_modules/`)

### Fluxo de deploy padrao

**Versionamento (a partir de 30 Abr 2026):** semver `MAJOR.MINOR.PATCH-channel`. Em beta, PATCH incrementa a cada release (`1.0.3-beta` → `1.0.4-beta`). MINOR sobe em feature significativa. MAJOR só em v2 (incompat). Estável dropa `-beta`.

1. Validar sintaxe de todos os JS modificados: `for f in $(find js/ -name '*.js' ! -name '*.backup'); do node --check "$f" 2>&1 || echo "SYNTAX ERROR in $f"; done`
2. Atualizar cache-busters em `index.html` para arquivos modificados
3. **O snapshot da landing é AUTOMÁTICO desde 21/ago/2026** — o `pre-commit` roda `npm run prerender` e põe `index.html` + `version.txt` dentro do commit (e o `deploy-hosting.sh` refaz isso no passo 1.5 como rede). Ligue os hooks uma vez: `scripts/install-hooks.sh`. **Por que isso importa:** o prerender baked-in inclui `window.SCOREPLACE_VERSION` — sem regerar, a landing mostra a versão antiga até o JS hidratar (e pra usuário sem JS habilitado, eternamente). Bugs pagos: v0.17.87 no ar com a landing em v0.17.72; e a 1.9.106, publicada com o `version.txt` do commit em 1.9.105.
4. **OBRIGATÓRIO antes de declarar "fixed" e pedir validação ao usuário**: validar o fix via Chrome MCP no site deployado. Mínimo: navigate + fetch HTML + DOM inspection (botões existem, handlers attached, modais render OK). Se o fluxo exige login real / GPS / múltiplas contas e não consigo simular, **avisar explicitamente "não testei, pode quebrar"** antes de pedir teste manual. Pattern proibido: empilhar hotfix em cima de hotfix sem auditar relacionados — quando bug X aparece, listar TODOS os call paths do fluxo afetado, ler arquivos relevantes por completo, identificar bugs latentes do mesmo tipo, fazer UM fix consolidado. Bug reportado: 9 hotfixes em sequência (v0.17.83-91) onde cada fix expunha outro bug latente. Causa: declarar "fixed" sem validação prévia.
5. `git add` dos arquivos alterados (evitar `git add .` — adicionar arquivos especificos)
6. `git commit` com mensagem descritiva
7. `git push origin main` (versiona o repo — **NÃO publica**)
8. **PUBLICAR**: `git worktree add --detach /tmp/dep origin/main`, ligar `node_modules` por symlink, e `firebase deploy --only hosting --project scoreplace-app` de dentro dele
9. Verificar AO VIVO: `curl -s https://scoreplace.app/version.txt` tem que bater com o `version.txt` do commit, e o JS servido tem que conter o símbolo NOVO e zero ocorrências do antigo
10. **Indicar versão deployada na confirmação ao usuário** (terminar com "v0.X.Y-alpha deployada")
