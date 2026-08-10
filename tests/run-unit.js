/* Runner dos testes unitários headless — node tests/run-unit.js (ou npm test).
 * Roda cada suíte em processo próprio, mostra a saída e agrega o resultado.
 * Exit code != 0 se qualquer suíte falhar (serve pra CI / pre-deploy).
 */
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SUITES = [
  'tests/test-utils.js',
  // MOTOR DE CHAVES determinístico (js/views/chaves.js): a chave é função pura de
  // (N, formato). Trava os invariantes que quebraram AO VIVO no torneio de casais
  // (1.5.2→1.5.5): auto-confronto Time X vs X, tardio derrubando confronto já
  // sorteado, tardio sem jogo, perdedor sem pouso na inferior. Se estas duas
  // ficarem vermelhas, alguém reintroduziu patch incremental na chave.
  'tests/chaves-aceite.test.js',
  'tests/chaves-stress.test.js',
  // JOGA a chave inteira até o campeão com o _advanceWinner REAL (não simulação).
  // Foi este que pegou os 3 bugs do adapter que os testes de estrutura não viam:
  // double-book do perdedor em fonte de repescagem (auto-confronto), cadeia
  // travada por jogo com os dois lados mortos, e placar recolado em confronto
  // diferente ao cruzar potência de 2.
  'tests/chaves-adapter.test.js',
  'tests/growth-frozen-prefix.test.js',
  // O AVISO da chave cheia ("2 novas equipes para novo confronto") derivado do MESMO estado
  // que faz o motor recusar com 'falta-par'. Existe pra tela nunca prometer o que o motor
  // não fará — e pra o organizador parar de depender de um toast que some.
  'tests/late-growth-gap-banner.test.js',
  // Dupla tardia virando "#10" na chave (bug ao vivo 26/jul): rótulo pela fonte única de
  // nome (uid→perfil) e identidade pelos DOIS uids da dupla — nos dois carimbos do adapter
  // (sorteio e crescimento) — mais a cura do doc já gravado.
  'tests/late-entry-slot-label-uid.test.js',
  // Desfazer dupla: ENTRADA ÚNICA que roteia (roster → splitPair, espera → splitLatePair,
  // lugar nenhum → AVISA). O `return` mudo do roster era o "desfazer não funciona mais" —
  // clique sem toast e sem NENHUMA invocação da CF nos logs.
  'tests/split-dupla-routing.test.js',
  // BYE nunca vira card de jogo — a rodada mostra só confrontos VERDADEIROS e quem passou
  // leva a tag na rodada seguinte. A regra era canônica mas vivia presa no renderer de FASE;
  // a Dupla Eliminatória retorna antes dele e desenhava o "PARTIDA vs BYE (Avança Direto)".
  'tests/bye-never-a-card.test.js',
  // "JOGO N" tem UM contador só. Regressão vista ao vivo: número da chave superior
  // repetido na inferior, porque um 2º contador dentro de renderDoubleElimBracket
  // sobrescrevia a fonte única sem pular BYE e sem deduplicar por id.
  'tests/game-number-single-counter.test.js',
  // A única inversão que existe: FINAL é o último jogo do torneio, 3º/4º um número
  // abaixo (mesmo a final aparecendo ACIMA do 3º na tela). Pegou 2 furos: a Dupla
  // Eliminatória não numerava o 3º lugar, e t.thirdPlaceMatch (que mora fora de
  // t.matches) não era visitado por ninguém, em nenhum formato.
  'tests/game-number-final-last.test.js',
  // O TESTE DO FIASCO: torneio em andamento, com placar lançado, recebe dupla tardia.
  // Prova que o placar sobrevive no MESMO jogo, o tardio ganha jogo de verdade (com
  // pouso na inferior, na dupla), nenhum confronto existente muda, e a chave ainda
  // fecha com campeão. Substitui as ~1.250 linhas de cirurgia incremental.
  'tests/late-entry-recalc.test.js',
  'tests/bracket-logic.test.js',
  // Folga sem identidade não nasce. Medido contra o doc real: com os rótulos
  // apagados o motor gerava uma folga fantasma (p1 undefined, sem uid) que nada
  // conseguia remover depois. Com o guard, a rodada sai IDÊNTICA com e sem rótulo.
  'tests/folga-sem-identidade.test.js',
  // Trava a canonização: o cliente NÃO sorteia a Liga agendada (fim da corrida
  // cliente×CF). Se alguém religar o poller, esta suíte fica vermelha.
  'tests/liga-autodraw-server-only.test.js',
  'tests/draw-cores.test.js',
  // Cânone da LISTA DE ESPERA no AMBIENTE DO SERVIDOR (CF). Falha se alguém devolver
  // as funções pro store.js (não vendorado) — o tardio voltaria a ficar preso na espera.
  'tests/waitlist-core-server.test.js',
  // PORTA DE ENTRADA da espera: fase SORTEADA → lista de espera, nunca o roster. Roda o doc
  // REAL do Confra (111 inscritos, 27 grupos, 83 jogos) pelo computeEnroll da CF e pelo
  // _toggleLigaActive real. Falha se alguém deixar Liga com temporada aberta voltar a
  // empurrar inscrito tardio pra participants — o inscrito fantasma de 02/ago/2026.
  'tests/inscricao-pos-sorteio-vai-pra-espera.test.js',
  // ORDEM do box "📋 Ficaram de fora desta rodada": Lista de espera LOGO ABAIXO dos
  // Desativados, no seu box âmbar, DENTRO do <details>. Roda a IIFE real do bracket.js.
  'tests/ficaram-de-fora-ordem.test.js',
  // W.O. DO ORGANIZADOR: destino do ausente (desativados × fim da fila) + o PRIMEIRO da
  // fila assume a vaga e entra no ELENCO (fica até o fim do torneio). Roda a IIFE real do
  // liga-substitution.js contra o grupo real do Confra. Falha se o substituto voltar a
  // entrar só no grupo (sumiria no sorteio da rodada seguinte).
  'tests/wo-destino-e-suplente.test.js',
  // O diálogo "Substituto" TEM que listar a lista de espera. Bug ao vivo (Confra, 02/ago):
  // dizia "ninguém ficou de fora" com 2 pessoas na fila — lia 1 dos 3 storages e casava
  // por NOME (que vem strippado). Falha se alguém voltar a ler a espera fora do _getWaitlist.
  'tests/wo-fila-aparece-no-substituto.test.js',
  // ESCOLHA 1×2 do destino do ausente + NOTIFICAÇÃO no fim do ciclo, disparadas pelo
  // caminho REAL (wo-claim → _ligaPickFill). Falha se alguém mover a decisão de volta pra
  // _ligaAbsentFlow (que nada chama) ou deixar o ciclo fechar em silêncio.
  'tests/wo-destino-ciclo-notifica.test.js',
  // Quem levou W.O. tem CAMINHO DE VOLTA (o toggle aparece pra quem está na fila) e a
  // busca da chave acha quem está em Desativados / Lista de espera / W.O.
  'tests/wo-volta-e-busca.test.js',
  // Toast de push em foreground: campos vêm de payload.data (contrato DATA-ONLY da CF).
  // Falha se alguém voltar a ler só payload.notification → toast 'scoreplace.app' vazio.
  'tests/fcm-foreground-toast.test.js',
  // Busca nas CHAVES: filtro DOM dos cards de jogo (acento-insensitive, membro de dupla,
  // coluna vazia some, limpar restaura). Verificado também no navegador real.
  'tests/bracket-search.test.js',
  // Globais das views existem DEPOIS do load. Pega definição presa dentro de template
  // literal (vira texto) — que o `node --check` NÃO pega, porque string é sintaxe válida.
  'tests/view-globals-smoke.test.js',
  // "Deixar inscritos ficarem de fora": rodada única é DEFAULT desligado, não cadeado —
  // escolha explícita do organizador vence nos dois sentidos.
  'tests/allow-self-deact-default.test.js',
  // Contexto da TRANSIÇÃO DE FASE sobrevive ao snapshot do Firestore (que substitui os
  // objetos). Sem isso, clicar no painel de pow2 dispara o sorteio da FASE 0.
  'tests/phase-res-info-survives-snapshot.test.js',
  // Destaque VERDE do próprio usuário na classificação: resolve por UID, nunca por nome —
  // senão pinta a linha de um homônimo/dupla alheia.
  'tests/classif-highlight-me.test.js',
  // Busca na CLASSIFICAÇÃO: UMA barra por render (no 1º bloco, sem id duplicado) e o
  // filtro cobrindo as linhas de TODOS os blocos.
  'tests/classif-search.test.js',
  'tests/phase-transition-matrix.test.js',
  'tests/phase-adversarial.test.js',
  'tests/phase-lifecycle.test.js',
  'tests/phase-lifecycle-formats.test.js',
  'tests/phase-chaining.test.js',
  'tests/phase-inactive-include.test.js',
  'tests/phase-promote-line.test.js',
  'tests/advanced-points-dedup.test.js',
  'tests/pa-uid-identity.test.js',
  'tests/uid-name-display.test.js',
  'tests/standings-uid-identity.test.js',
  'tests/h2h-uid-identity.test.js',
  'tests/h2h-matrix-uid.test.js',
  'tests/standings-tiebreakers.test.js',
  'tests/seed-pairing.test.js',
  'tests/grandfinal-lines.test.js',
  'tests/category-transition.test.js',
  'tests/double-elim.test.js',
  'tests/repechage.test.js',
  'tests/live-scoring-resolve.test.js',
  'tests/sport-rules-canonical.test.js',
  'tests/advantage-sport-derived.test.js',
  'tests/sport-scoring-rules.test.js',
  'tests/result-approval-gate.test.js',
  'tests/draw-schedule.test.js',
  'tests/wa-group-link.test.js',
  // O grupo de WhatsApp é DO GRUPO. Reproduz o incidente do Confra (03/ago/2026):
  // identidade lida por NOME (que o strip do save apaga) → chave de irmãos vazia →
  // o link de UM grupo espelhado nos 81 jogos dos 27 grupos.
  'tests/wa-group-por-grupo.test.js',
  // Os DOIS chips do rodapé do card ("Combinar jogo" + grupo de whats) são irmãos
  // com GATE COMUM: quebrar o gate derruba os dois DE UMA VEZ e EM SILÊNCIO (todo
  // call site é guardado por `typeof === 'function'`). Nasceu de um relato de
  // regressão na 1.7.76 que a medição não confirmou — o que faltava era o teste.
  'tests/chips-do-card-do-jogo.test.js',
  'tests/elim-seed.test.js',
  'tests/elim-reirainha-opening.test.js',
  'tests/chave-label-default.test.js',
  'tests/letzplay-verdict-color.test.js',
  'tests/letzplay-level-bar.test.js',
  'tests/org-gender-label.test.js',
  'tests/letzplay-game-cards.test.js',
  'tests/letzplay-open-profile.test.js',
  'tests/person-gender-not-misto.test.js',
  'tests/rr-gender-balance.test.js',
  'tests/auto-draw-balance-choice.test.js',
  // O "equilibrado" só equilibra se o app SOUBER o gênero: 105 inscritos, gênero
  // conhecido de 4 (o resto estava no PERFIL). Reproduz a falha do Confra e trava
  // a hidratação perfil→inscrito — inclusive com o cache vazio, que é o servidor.
  'tests/draw-gender-hydration.test.js',
  'tests/lz-label-equals-bar.test.js',
  'tests/ext-version-single-source.test.js',
  'tests/lz-list-date.test.js',
  'tests/lz-incremental-history.test.js',
  'tests/lz-id-survives-rounds.test.js',
  'tests/lz-batched-requests.test.js',
  'tests/dialog-fits-screen.test.js',
  'tests/lz-round-chaining.test.js',
  'tests/lz-nunca-regride.test.js',
  'tests/lz-agent-path.test.js',
  'tests/lz-api-index.test.js',
  'tests/lz-contagem-unica.test.js',
  // O caso REAL da Kelly: leitura COMPLETA (160 de 160 ids) que ficava violeta. Duas causas:
  // o veredito lia `li.tournaments` (campo que o normalize nunca devolve — a evidência mora
  // no footprint) e a completude exigia contagem de PÁGINAS mesmo com o índice provando
  // cobertura id por id. Falha se alguém voltar a ler competição fora do footprint.
  'tests/kelly-verde.test.js',
  // PLACAR AO VIVO EM RETRATO: uma paleta só (medida — 4,10:1 no gelo E no escuro), a
  // placa dimensionada A PARTIR do número (o número não muda de tamanho quando ela
  // encolhe) e a folga abaixo dela pra o conjunto subir. Falha se alguém reintroduzir
  // cor de número solta ou fizer o retrato limitar o número pela altura.
  'tests/live-score-retrato.test.js',
  'tests/meu-card-no-topo.test.js',
  // o espelho do roster (a rede contra perda de inscrito) não cobria a lista de espera,
  // não escrevia na 1ª gravação da sessão e nem era chamado pelo caminho de inscrição.
  'tests/espelho-do-roster-cobre-a-espera.test.js',
  // O CICLO INTEIRO da espera de ponta a ponta (inscrever → desativar → reativar → W.O.
  // → reverter → formar), pelo código real. Cada transição já tinha dono; ninguém rodava
  // a cadeia — e é ENTRE uma e a seguinte que some gente.
  'tests/ciclo-espera-desativado-wo.test.js',
  // o card do topo NUNCA pode contradizer o torneio: quem está na lista de espera,
  // desativado ou com W.O. lia "você não está inscrito" (dado REAL do Confra).
  'tests/meu-card-nunca-contradiz.test.js',
  // a espera formava ZERO grupo com 3 homens + 3 mulheres e a proporção 25/75 travada,
  // porque a fila se partia pela categoria da INSCRIÇÃO e não pela da rodada.
  'tests/espera-forma-grupo-por-ordem.test.js',
  // a busca da Análise existia no código e nunca chegava à tela (função órfã).
  'tests/analise-barra-de-busca.test.js',
  'tests/jogo-so-com-placar.test.js',
  'tests/apagar-torneio-nao-deixa-orfao.test.js',
  'tests/torneio-abandonado.test.js',
  // Tag "Misto" no card do torneio: obrigatório sempre; senão, só com 1:1 EXATA de
  // gênero entre os inscritos. Trava o caso real do "Confra BT Alta da Clínica 2026"
  // (8 inscritas, zero homens, e o card dizia "Misto").
  'tests/misto-tag-so-com-1-1.test.js',
  'tests/convite-data-multifase.test.js',
  'tests/data-sem-ambiguidade.test.js',
  'tests/rules-letzplayscans-whitelist.test.js',
  'tests/lz-parcial-nao-e-oficial.test.js',
  'tests/letzplay-pace.test.js',
  'tests/letzplay-model.test.js',
  'tests/letzplay-eta.test.js',
  'tests/letzplay-scan-order.test.js',
  // Leitura de perfil GRANDE do letzplay, ponta a ponta com o content.js REAL da extensão
  // num Chromium contra um letzplay sintético. Trava o que quebrava no perfil da Camila
  // (472 jogos): rodada time-boxed em 240s pra um trabalho de ~9 min, etapa dos jogos
  // nunca alcançada, parciais regravando o histórico inteiro (24.656 escritas) e doc
  // estourando 1MiB. Roda 5 cenários, inclusive "letzplay pediu pausa no meio".
  'tests/letzplay-big-profile.test.js',
  'tests/phase0-elim.test.js',
  // Item 10: TODO slot do sorteio carrega uid EXPLÍCITO (team*Uids/p*Uid) — R1 inclusive.
  // Antes a R1 saía só com team1Obj (undefined uid). Roda o motor REAL (draw-core → storePhase).
  'tests/slot-uid-on-draw.test.js',
  'tests/phase0-monarch.test.js',
  'tests/phase0-monarch-duplas.test.js',
  'tests/phase-complete-tagged.test.js',
  'tests/games-plan-multiphase.test.js',
  'tests/liga-phase0-rounds-cap.test.js',
  'tests/phase0-groups-canonical.test.js',
  'tests/phase-identity.test.js',
  'tests/no-format-regression.test.js',
  'tests/area-scaling-canon.test.js',
  'tests/duplas-teams-enrollmode.test.js',
  'tests/apply-result.test.js',
  'tests/apply-round-close.test.js',
  'tests/apply-wo.test.js',
  'tests/wo-individual.test.js',
  'tests/wo-availability-canonical.test.js',
  'tests/wo-outcome-wiring.test.js',
  'tests/wo-outcome-negotiation.test.js',
  'tests/late-enroll-inherit.test.js',
  'tests/late-enroll-window-r2-result.test.js',
  'tests/dash-enroll-late-window.test.js',
  'tests/round-display-no-r0.test.js',
  'tests/result-approval-uid.test.js',
  'tests/tiebreak-set-score.test.js',
  // Lista de espera present-first é uid-only: homônimo presente (uR2) vem antes; sort por-nome
  // casaria o 1º homônimo (uR1) e erraria. Trava o cânone "uid only" do painel de check-in.
  'tests/waitlist-present-first-uid.test.js',
  // Write do check-in é uid-only: marcar homônimo presente COM o uid grava a chave certa (uR2);
  // sem uid o nome cai no 1º homônimo (uR1) e marca a pessoa errada. Trava o toggle por uid.
  'tests/checkin-toggle-uid.test.js',
  // Chamada de DUPLAS aparece direto no detalhe: _buildDoublesInscritosSection só mostra os
  // toggles quando recebe o factory _rollCallPresenceCtx (reusado nas 2 telas). Sem ele, sem toggle.
  'tests/detail-doubles-rollcall.test.js',
  // Presença verde (presente) vs azul (confirmado remoto, NÃO presente); verde vence azul.
  'tests/presence-green-blue.test.js',
  // Card de autopresença do participante no detalhe: inscrito comum vê o toggle (→ _applySelfPresence);
  // autoridade não (marca pela chamada). No código velho o participante não tinha entry point pré-sorteio.
  'tests/my-presence-card.test.js',
  // Autopresença via presença de LOCAL: check-in confirmado no local do torneio, na janela
  // [início−2h, fim] → vira PRESENTE (verde) sozinho. Sem GPS silencioso; respeita "ausente" do org.
  'tests/auto-presence-venue.test.js',
  // "Iniciar" pelo RELÓGIO: a escolha do 1º sacador feita no relógio é aplicada e a tela
  // "Quem saca primeiro?" do celular é CONFIRMADA — senão a partida não começa (serveOrder
  // vazio ⇒ sem sacador ⇒ sem a bolinha no nome). Dirige o js/watch-bridge.js REAL.
  'tests/watch-start-serve.test.js',
  // Sandbox (SB) do dev — rede de isolamento: notif mudas, stats/resultados não vazam, invisível
  // pra não-dev. Trava _statsEligibleTournaments + getVisibleTournaments/getMyParticipations +
  // ENTREGA (memberUids do SB = só o dev, senão o Firestore entrega o doc pra todo participante).
  'tests/sandbox-isolation.test.js',
  // Sandbox — criação do clone: _openOrCreateSandbox clona o estado atual (deep-copy), privado +
  // notif mudas + isSandbox, dev-only, sem tocar no original; 2ª chamada abre o mesmo SB.
  'tests/sandbox-create.test.js',
  // Sandbox — espelho one-way no cliente: a MESMA AppStore.mutate roda o MESMO mutator no SB.
  // Guardas: só dev, mão única (nada volta), só enquanto o SB não foi sorteado.
  'tests/sandbox-mirror-mutate.test.js',
  // Sandbox — Resetar re-sincroniza com o original AGORA (dropa adições de teste), preservando
  // a identidade/isolamento do SB. "SB tal qual o original no momento do reset."
  'tests/sandbox-reset-resync.test.js',
  // Convite pro grupo de WhatsApp (org notifica inscritos c/ o link): type wa_group fundamental
  // + CTA _notifCta abre o link do grupo. Sem o caso, cairia no "Ver torneio" genérico.
  'tests/wa-group-notify.test.js',
  'tests/uid-poison.test.js',
  // Mesmo veneno, porta dos INSCRITOS (store.js — o uid-poison só carrega js/views/*).
  // Identificar inscrito por nome/e-mail (era o caso do organizador) fica VERMELHO aqui.
  'tests/uid-poison-inscritos.test.js',
  // Nº de inscrição é da PESSOA: formar/desfazer dupla NÃO mexe; só a saída renumera.
  'tests/enroll-number-canon.test.js',
  // Flexibilizar equilíbrio: forma duplas mesmo-gênero da sobra em vez de deixar gente de fora.
  'tests/flexibilize-balance.test.js',
  // Flexibilizado não mira pow2: o resto vira só o avulso (3→1); pow2 é a próxima tela.
  'tests/flexibilize-remainder.test.js',
  // Flexibilizar como DECISÃO replicada na CF (_applyDrawDecisions forma as duplas do zero).
  'tests/flexibilize-decision-cf.test.js',
  // Nome da dupla tardia vem do uid ao vivo (nunca a string "undefined").
  'tests/late-join-name-uid.test.js',
  'tests/pair-side-no-third-line.test.js',
  // Excluir inscrito num roster SÓ-UID (o ✕ do card individual): solo sem nome gravado e
  // membro de dupla. Os dois eram no-op silencioso — o clique "não fazia nada". v1.4.2.
  'tests/remove-participant-uid.test.js',
  // Selo verde de diagnóstico do sorteio: só pode existir em rota de torneio SANDBOX —
  // estava sobrevivendo à navegação e aparecendo por cima da dashboard. v1.4.5.
  'tests/draw-trace-badge-route.test.js',
  // "Novos Confrontos" ⊥ "Abertas" TAMBÉM na ELIMINATÓRIA (a elim tem flag PRÓPRIA e o gate
  // _allowsNewMatchups lê a FASE, não só o top-level). v1.4.6.
  'tests/new-matchups-elim-independent.test.js',
  // Resumo da config indica ONDE o tie-break entra (5-5 / 6-6), pela MESMA fonte do placar
  // ao vivo (_tbLoserGames) — antes só dizia "tiebreak 7pts". v1.4.7.
  'tests/config-summary-tiebreak-at.test.js',
  'tests/wo-slot-uid-identity.test.js',
  'tests/wo-claim-uid-por-estrutura.test.js',
  'tests/elenco-nunca-encolhe.test.js',
  // Irmão do de cima: aquele trava o que SUMIU de um save atrasado; este trava o que
  // VOLTOU NO TEMPO (mesmos jogos, conteúdo antigo — a substituição desfeita sozinha).
  // Roda as DUAS portas de escrita juntas, que é onde o buraco estava. v1.7.91.
  'tests/save-atrasado-nao-desfaz-troca.test.js',
  // Varredura do doc inteiro: grupo formado e registro de "já avisei" também não somem. v1.8.0.
  'tests/save-atrasado-nao-apaga-grupo.test.js',
  'tests/monarch-wo-uid-identity.test.js',
  'tests/liga-wo-invite.test.js',
  'tests/swiss-to-elim-transition.test.js',
  'tests/phase0-swiss-elim.test.js',
  'tests/swiss-draw-via-cf.test.js',
  'tests/swiss-close-via-cf.test.js',
  'tests/dupla-repechage-full.test.js',
  'tests/late-dupla-tier2.test.js',
  // Gap (dono, 17/jul): dupla FORMADA na lista de espera entra na Eliminatória Simples também.
  'tests/late-dupla-single-elim.test.js',
  // PLAY-THROUGH completo da integração tardia (dono, 20/jul): joga a chave INTEIRA com o motor
  // real (_advanceWinner) e exige que FECHE num campeão — pega BYE travado, repescado não-atribuído,
  // 3º lugar apagado, presença. É o gate que faltava (os testes antigos "jogavam" sem _advanceWinner).
  'tests/minimal-elim-formula.test.js',
  'tests/bye-elim-formula.test.js',
  'tests/late-integration-fullplay.test.js',
  'tests/draw-preserve-waitlist-presence.test.js',
  // v1.3.82: overlay de presença pendente sobrevive a snapshot stale do Firestore (aparece/apaga).
  'tests/pending-presence-overlay.test.js',
  // v1.3.87: 2 duplas pré-formadas ausentes→presentes (uma de cada vez) → a 2ª PREENCHE o "a definir"
  // da 1ª (não abre jogo novo). Reproduz o bug do SB Casais (só _lateJoin entrava).
  'tests/late-dupla-fills-adefinir-separate.test.js',
  // v1.3.88: SWEEP — todo formato × config × N pelo motor canônico (draw-core), joga a chave inteira.
  'tests/draw-sweep-all-formats.test.js',
  // SWEEP de INTEGRAÇÃO TARDIA (formato × config × N): dupla formada de solos, dupla pré-formada
  // ausente que chega, solo tardio → tem que entrar na chave (não ficar órfão) e jogar até campeão.
  // Pegou o gap: Dupla Elim pow2 sem repescagem não integrava tardio (fix: re-sorteio Tier-1). v1.3.x.
  'tests/late-integration-sweep.test.js',
  // SWEEP FASE CLASSIFICATÓRIA → ELIM (fmt2): todo N × grupos × classificados joga a classificatória,
  // avança (materializeNextPhase) e fecha a elim num campeão; + integração tardia na classificatória.
  // Individual e duplas, Grupos e Suíço. Pegou o gap: tardio não integrava em grupos/Suíço (fix redraw). v1.3.x.
  'tests/classificatory-phase-sweep.test.js',
  // BUG DO DONO: "formei dupla e nada dela entrar na chave". Dupla formada pós-sorteio funde em
  // participants (fora da espera) → ficava órfã. Fix: integrateLateEntries detecta órfão de roster
  // e re-sorteia (todo formato, incl. Elim Simples) + _triggerLateIntegration(force) + form dispara.
  'tests/form-pair-integration.test.js',
  // E2E "TUDO NA CF": dirige as funções de CLIENTE REAIS (_formDuplaByUids/_splitDupla) pelo
  // dispatch real → CF formPair/splitPair (pair-core) → CF integrateLateEntries (draw-core).
  // Prova que forma/desfaz dupla entra/sai da chave SEM o cliente gravar (saveTournament=0).
  'tests/e2e-form-pair.test.js',
  // TIE-BREAK configurável por torneio (5-5 vs 6-6) — gatilho por regra/esporte. v1.3.x.
  'tests/tiebreak-trigger.test.js',
  'tests/tiebreak-display-persist.test.js',
  'tests/progress-third-place-nodouble.test.js',
  // Melhor derrotado pega a vaga com MENOS jogos (repescagem 1 linha) — regra do dono. v1.3.x.
  'tests/repechage-best-loser-advancement.test.js',
  // v1.3.89: SWEEP W.O. + integração tardia (motor _applyWO real + CF integrateLateEntries), joga até fechar.
  'tests/draw-sweep-wo-late.test.js',
  'tests/present-only-no-lost-entries.test.js',
  // Gap (dono, 17/jul, screenshot): dupla ímpar no repGame ("VS A definir") recebe a dupla tardia.
  'tests/late-dupla-repgame-fill.test.js',
  // Gap (dono, 17/jul, torneio REAL): dupla formada entra no lugar do repescado (chave playin).
  'tests/late-dupla-repfill-playin.test.js',
  // Bug (dono, jul/2026): Dupla Elim playin, repescado JÁ definido (frozen) + dupla formada à mão
  // (órfão de roster) → entra CIRURGICAMENTE, sem redraw, preservando o congelado.
  'tests/late-dupla-orphan-frozen-rep.test.js',
  // Bug (dono, torneio AO VIVO 25/jul/2026 — SB Casais): dupla tardia PRESENTE com a R1 sup já com
  // placar não ganhava jogo (ficava presa na espera) e o "a definir" do tardio virava BYE em vez de
  // puxar o MELHOR DERROTADO da R1. Regras 1 e 2 do dono, ponta a ponta.
  'tests/late-pair-repechage.test.js',
  // Bug (dono, jul/2026): "Presentes chega em 24, cai e dá pulinhos" — doc stale da CF trocava o
  // torneio inteiro e engolia a presença otimista recém-marcada.
  'tests/cf-doc-clobbers-presence.test.js',
  // CÂNONE de cores de presença (dono, jul/2026): presente=VERDE, ausente=AZUL; dupla=tom escuro,
  // individual=tom claro. Trava pra não regredir em nenhum renderer.
  'tests/presence-color-canon.test.js',
  // Bug (dono, jul/2026): no meio do sorteio a tela voltava pro detalhe (cards) por baixo do
  // "Sorteando…" — a tela de processamento global faltava na safe-list do _softRefreshView.
  'tests/loading-blocks-softrefresh.test.js',
  // Bug (dono, jul/2026, print "JOGO 7"): dupla tardia entrou na chave contra SI MESMA (dos 2
  // lados). Trava: dedup por identidade nos 2 stores + guard anti-auto-confronto no "a definir".
  'tests/late-dupla-no-self-match.test.js',
  // Bug (dono, jul/2026): "continua diminuindo os presentes depois de 24 presenças" — doc da CF
  // lido ANTES das últimas marcações sobrescrevia checkedIn. Eco de CF nunca regride presença.
  'tests/cf-doc-no-presence-regress.test.js',
  // Desastre (dono, jul/2026, SB Casais): integração tardia RE-SORTEAVA a chave publicada
  // ("mudou tudo, dupla virou individual, criou jogo 8"). Entrada tardia é SEMPRE aditiva.
  'tests/late-entry-never-redraws.test.js',
  // Idempotência da integração tardia (dono: "criou 2 jogos em vez de 1"): registro POR ENTRADA
  // (t.lateIntegrated), NUNCA "nome na chave" — senão inviabilizaria a REPESCAGEM (ressalva do dono).
  'tests/late-entry-idempotent.test.js',
  // Instabilidade da chamada (dono: "presença pulando e regredindo depois de 24"): a integração era
  // disparada 1× por toggle → enxurrada de docs+re-render. Rajada agora coalesce numa chamada.
  'tests/late-integration-debounce.test.js',
  // Torneio AO VIVO (dono, 25/jul/2026): marcou presença pós-sorteio e NÃO gerou jogo. Duas causas —
  // disparo ENGOLIDO quando havia chamada em voo (sem fila, sem retry) e coletor CEGO pra quem ficou
  // em `participants` fora da chave (só espera + dupla 'formada' entravam).
  'tests/late-integration-never-dropped.test.js',
  // Dados REAIS do SB (dono): mesmo par de uids em 2 jogos com NOMES diferentes ("Jogador sem
  // perfil (aL7U)…" vs "Marcello/Karla") — guards por NOME não casavam. Membership é por UID.
  'tests/late-entry-uid-identity.test.js',
  // Seletor de tie-break 5-5/6-6 sumia na config (dono): _reSyncTbAt tinha lógica própria de
  // "usa sets"; tem de usar a FONTE CANÔNICA _scoringUsesSets (a mesma do placar).
  'tests/tiebreak-at-visibility.test.js',
  // CAUSA-RAIZ do "presença pulando e desmarcando depois de ~16" (dono): o mutator era um TOGGLE e
  // roda MAIS DE UMA VEZ (local+fresco, retry da txn) → nº par de aplicações desmarcava. Idempotente.
  'tests/presence-mutator-idempotent.test.js',
  'tests/presence-field-write.test.js',
  'tests/draw-scope-all-ignores-presence.test.js',
  'tests/dupla-elim-minimal-tree.test.js',
  'tests/late-entry-door-closes.test.js',
  'tests/late-entry-upper-grows-lower.test.js',
  // Chave SEM bye (pow2 4/8/16) + 2 duplas formadas → PAREAM num jogo novo e ENTRAM (cresce a
  // chave, sem slot morto). Trava o "formei dupla e não entrou" reportado pelo dono em pow2.
  'tests/late-dupla-pow2-grow.test.js',
  'tests/match-identity-dedup.test.js',
  'tests/late-entry-recompute-n.test.js',
  // _syncLowerBracket (dona única da 1ª inferior): cenário do dono (1ª sup jogada ANTES do
  // tardio — repescado na hora, inferior não cresce, 2º tardio toma a vaga) + varredura
  // N=3..20 × 0/1/2 tardios do mesmo fluxo. O 1.3.163 falha esta suíte.
  'tests/sync-lower-bracket.test.js',
  // Dupla Elim (dono): dupla PRÉ-FORMADA na espera, ao receber presença, ia pro LIMBO — o placer
  // exigia _lateJoin (flag que só dupla formada TARDE tem). Entra na R1 da chave SUPERIOR.
  'tests/late-dupla-elim-r1-entry.test.js',
  // TRAVA ESTRUTURAL (dono: "faça de forma robusta"): TODO mutator que roda em AppStore.mutate/
  // commitTournamentTx é IDEMPOTENTE (N× ≡ 1×). Mutator novo nascendo como toggle fica VERMELHO.
  'tests/mutators-idempotent-canon.test.js',
  // VARREDURA Dupla Elim × TODOS os N (2..24) com integração tardia + playout até o campeão.
  // A Simples entra como CASO DERIVADO (= a Dupla sem a linha inferior).
  'tests/dupla-elim-late-sweep.test.js',
  // Bug (dono, 17/jul): contagem INSCRITOS/EQUIPES pulava dupla só-uid (nome stripado) — 8/4 vs 26/13.
  'tests/count-competitors.test.js',
  'tests/monarch-late-roster.test.js',
  'tests/phase-repechage-lines.test.js',
  'tests/reset-tournament.test.js',
  'tests/dupla-elim-render.test.js',
  'tests/monarch-render.test.js',
  'tests/game-numbering.test.js',
  'tests/cancel-x-canon.test.js',
  'tests/groups-render.test.js',
  'tests/liga-render.test.js',
  'tests/liga-countdown.test.js',
  'tests/sched-config-coherent.test.js',
  'tests/swiss-render.test.js',
  'tests/match-roster-uid.test.js',
  'tests/fairness-uid-identity.test.js',
  'tests/delete-account-dupla-orphan.test.js',
  'tests/merge-federated-wins.test.js',
  // A decisão do AUTO-MERGE consulta o AUTH (incidente 02/ago/2026: perfil de junho sem
  // createdAt no doc PERDIA pra perfil de julho com createdAt — o Auth sempre soube a idade).
  // Reproduz o caso real e trava o await nos dois call sites do index.js.
  'functions/test-merge-winner.js',
  // NADA SE PERDE: o merge passou a absorver o PERFIL do drop (antes copiava ZERO campos —
  // a Silvia perderia 44 campos pra uma conta de 17). Varredura genérica com lista de
  // exclusão: campo novo no perfil é preservado sem ninguém lembrar de atualizar lista.
  'functions/test-profile-merge-core.js',
  // A ANÁLISE NUNCA grava na pessoa errada. O `parts[order-1]` fazia a edição pousar em
  // OUTRA pessoa (medido: Vivi Hirata e Vivian gravadas no mesmo segundo com valores
  // trocados). Resolução SÓ por uid; sem casar, PULA.
  'tests/analise-nunca-grava-na-pessoa-errada.test.js',
  // O NOME EXIBIDO sai do PERFIL (uid), nunca do rótulo gravado no sorteio. Print do dono:
  // a mesma pessoa como "Fabi2401@" na classificação e "Dani Bataglia" nos jogos.
  'tests/nome-vem-do-perfil-nao-do-sorteio.test.js',
  'functions/test-merge-collections-core.js',
  // O espelho do roster saiu do cliente (onde nunca funcionou — sem regra, sempre negado)
  // e virou responsabilidade do gatilho `syncMatchRosters`. v1.7.99.
  'functions/test-roster-mirror-core.js',
  // "Esta pessoa já não está inscrita com OUTRA conta?" — os sinais que o dono aprovou
  // (celular INTEIRO, nome idêntico, letzplay só corroborando) e, metade das asserções,
  // os que ele PROIBIU: subconjunto de nome (30% de acerto) e nascimento+1º nome.
  // Trava também o "não sou eu" lembrado — o caso das duas contas "Nelson Barth".
  'functions/test-duplicate-person-core.js',
  // NOME ÚNICO no SERVIDOR: a regra existia em 4 pontos, 3 deles no cliente e fail-open —
  // login federado não passava por checagem server-side, e homônimos continuaram nascendo
  // (11/jul, 14/jul, 17/jul, 30/jul) depois de a lei existir (24/jun).
  'functions/test-name-variant-core.js',
  // Trocou o displayName → o rótulo gravado nos torneios vira mentira. Este core
  // decide o que reescrever SÓ por uid; metade do teste existe pra travar o que
  // NÃO pode ser tocado (homônimo de outro uid, parceiro de dupla, fictício).
  'functions/test-rename-propagate-core.js',
  // Arrays pareados nome[i] ↔ uid[i]. A exclusão de conta filtrava SÓ o lado dos
  // uids e deixava o nome (caso Denise Mamesso, 08/ago/2026) — na 1ª posição isso
  // faria cada nome apontar pro uid do vizinho.
  'functions/test-uid-sweep-pares.js',
  // Jogo pendente BLOQUEIA apagar a conta (caso Denise Mamesso). Metade do teste
  // trava o que NÃO pode bloquear — folga, BYE, sem sorteio, torneio encerrado.
  'functions/test-delete-account-guard.js',
  // HOMÔNIMO AVISA, POSSE AUTORIZA: o botão de unir contas não funde nada — pede uma prova
  // (link no e-mail da OUTRA conta). Trava que o cliente não recebe uid/contato cheio, que o
  // alvo é resolvido no servidor (senão vira porta de spam) e que há rate limit.
  'tests/name-conflict-merge-proof.test.js',
  'tests/login-redirect.test.js',
  // Item 9: a FUSÃO agora POPULA loginRedirects (antes só a resolveLoginRedirect lia → redirect
  // nunca disparava). Chave = e-mail minúsculo / telefone E.164, igual ao que o reader lê.
  'tests/login-redirect-write.test.js',
  'tests/uid-sweep.test.js',
  // "Não deveria gravar nada além do uid em torneios." O cliente já stripava no save,
  // mas a CF não passa por lá e três construtores copiavam o perfil na mão — 2 entradas
  // sujas medidas em produção, de uid com perfil VIVO. Cópia de perfil é um segundo
  // lugar onde o dado da pessoa vive, fora do alcance do "apagar do perfil".
  'tests/uid-entry-no-profile-copy.test.js',
  'tests/reset-phone-reachable.test.js',
  // Apagar campo do perfil TEM que valer (relato da Ana Paula: a data de
  // nascimento voltava). O payload "só com campos não-vazios" da v0.16.9
  // protegia contra race mas tornava impossível apagar qualquer coisa — o
  // baseline do formulário dá a diferença: apagado pela pessoa × não hidratado.
  'tests/profile-erase-field.test.js',
  // Ocultar e-mail/telefone é privacidade perante os OUTROS — mas quem oculta
  // tem que ter nome de exibição, senão vira "Usuário" pra todo mundo (o guard
  // v2.4.4 só pegava o nome que ERA o contato). Trava junto a fiação do
  // "Vincular Google/Apple no mesmo uid", que é o que evita a conta duplicada
  // do e-mail oculto da Apple (caso Fernando Cerri, 03/ago/2026).
  'tests/omit-exige-display-name.test.js',
  'tests/delete-account-canon.test.js',
  'tests/dupla-detection-uid.test.js',
  'tests/draw-name-by-uid.test.js',
  'tests/name-to-uid-live-resolution.test.js',
  'tests/strip-rehydrate-identity.test.js',
  'tests/letzplay-rating.test.js',
  'tests/letzplay-import.test.js',
  'tests/letzplay-extract.test.js',
  // FONTE ÚNICA: as libs do letzplay têm UMA cópia (extension/lib) e os testes executam ELA.
  // Havia uma 2ª cópia morta em js/views/ que o index.html nunca carregou; ela drifou e a
  // distância CRESCEU (no import, 10 linhas na 1.6.5 → 16 na 1.7.12: ficou sem lzId e sem
  // dateISO), enquanto os 3 testes acima executavam a cópia morta e seguiam verdes.
  'tests/letzplay-single-source.test.js',
  'js/views/phases-engine.test.js',
  'js/views/phase-generators.test.js',
  'js/views/team-formation.test.js',
  'js/views/phase-brick4.test.js',
  'functions-autodraw/test-draw.js',
  'functions-autodraw/test-rebase.js',
  'functions-autodraw/test-groupsby.js',
  // SORTEIO AUTOMÁTICO MANDA E-MAIL (bug ao vivo 02/ago: sorteio do Confra criou as
  // notificações in-app e ZERO e-mail — a CF só escrevia um dos dois canais que o
  // cliente escreve). Trava a fila canônica, os opt-outs e a fiação dos 2 pontos.
  'functions-autodraw/test-draw-email.js',
  // CF aplica o pacote de decisões do organizador ao elenco (sem-dupla, resto). v1.2.29.
  'functions-autodraw/test-draw-decisions.js',
  // PORTÃO da migração sorteio client→CF (item #2): pacote ≡ core puro para odd/incomplete/
  // scope/absentees/p2 + regressão do loop infinito de _applyRemainderRemoval. v1.3.x.
  'functions-autodraw/test-draw-decisions-parity.js',
  // Migração client→CF: generateDrawFunction RESTAURA o roster original no doc antes de
  // despachar → a CF sorteia de (original + pacote), neutralizando mutação do cliente. v1.3.x.
  'tests/draw-client-restore-original.test.js',
  // Integração de tardios no servidor (draw-core.integrateLateEntries) — v1.2.57.
  'functions-autodraw/test-integrate-late.js',
  // Cenário do dono (SB Casais): dupla ausente na espera → marca presente → CF forma o
  // confronto (o bug era o CLIENTE nunca disparar a CF; o toggle in-place suprimia o gatilho).
  'functions-autodraw/test-late-present-fills-adefinir.js',
  // v1.7: QUEM pode lançar placar passa a ser decidido no SERVIDOR (resultEntry por fase,
  // lado do jogador por uid, fase da negociação). Antes existia só no navegador, com as
  // rules liberando `matches` pro participante — regra sem autoridade nenhuma.
  'functions-autodraw/test-result-core.js',
  // Joga o torneio INTEIRO lançando só pelo servidor: 8 jogos (escada + 3º lugar), campeão,
  // zero slot TBD. É o "jogar até o campeão" antes de mexer no caminho mais quente do app.
  'functions-autodraw/test-result-playthrough.js',
  // Gate do DETALHE (#tournaments/:id) não pula ao marcar presença: _tournamentDetailSig é
  // determinística (sem updatedAt) → o eco do próprio write vê "igual". v1.3.96.
  'tests/tournament-detail-sig.test.js',
  // Inscritos (individual E duplas) usam GRID responsivo — várias colunas em tela larga, nunca
  // coluna única. Trava contra regressão (dono: "não pode regredir"). v1.3.101.
  'tests/inscritos-grid-canon.test.js',
  // v1.7.2: a Análise enxerga a LISTA DE ESPERA (desde a 1.6.86 quem entra pós-sorteio sai
  // de participants) e grava no storage dela por UID — o fallback posicional gravaria a
  // categoria em outra pessoa, em silêncio.
  'tests/analise-inclui-lista-de-espera.test.js',
  // v1.7.3: grupo NOVO formado da lista de espera não fecha com mais de 1 HOMEM (regra do
  // dono: evitar que atrasados formem um grupo mais forte). Vale no cliente E na CF — o
  // _generateNextRound do servidor chama a mesma _tryFormMonarchWaitlistGroups.
  'tests/grupo-espera-max-1-homem.test.js',
  'tests/proporcao-genero.test.js',
  // Tema mostrava "🌙🌙 Noturno" / "☀️☀️ Claro": o botão prefixava o emoji e a string de
  // i18n já trazia o dela. A i18n é a DONA do emoji; o botão não repete. v1.7.7.
  'tests/tema-um-emoji.test.js',
  // Botões CANCELAR do fluxo de sorteio são VERMELHOS (#dc2626), nunca transparentes. v1.3.103.
  'tests/draw-cancel-red-canon.test.js',
  // FANTASMA DE ARRASTE (bug ao vivo 26/jul): card de inscrito flutuando preso sobre a
  // lista, só sumia fechando o app — o clone morava no <body> e os listeners que o
  // matavam morriam com o container no re-render. Trava a rede única de aborto
  // (data-drag-ghost + _activeDragReset + vigia). Comportamento: tests/e2e/drag-ghost.spec.js.
  'tests/drag-ghost-canon.test.js',
  'functions/test-match-roster.js',
  // Formar/desfazer dupla manual → CF (roster→CF): lógica pura de pair-core (espelha
  // _formDuplaByUids/_splitDupla). A replicação sandbox roda no emulador (test-pair-replicate.js). v1.3.x.
  'functions/test-pair-core.js',
  // Inscrição/desinscrição no servidor (CF) — espelha a transação do cliente.
  'functions/test-enroll-core.js',
  // Item 7: janelas do lembrete de torneio (7d/2d/0d) ESPELHAM o cliente; data-only BRT.
  // Se o servidor contar em UTC ou disparar em dia errado, sai fora. (Entrega = emulador.)
  'functions/test-reminder-core.js',
  'functions/test-abandon-core.js',
  // Convite de co-organização/transferência → CF. TRAVA a regressão real (Sentry
  // SCOREPLACE-WEB-6R): o aceite MUDA adminUids, o que estourava a regra antiga e dava
  // permission-denied em TODO convidado com conta. Também trava a identidade SÓ-UID e a
  // escalada da transferência (terceiro assumindo organização alheia).
  'functions/test-cohost-core.js',
  // Nome de exibição ÚNICO entre uids checado no SERVIDOR (registerPhonePassword).
  // Trava o incidente de 02/ago/2026: segunda "Gabriela Ferreira" criada por
  // celular+senha porque a regra só existia no cliente. Conflito = already-exists
  // com e-mail mascarado — NUNCA auto-sufixo silencioso.
  'functions/test-name-unique-core.js',
  'functions/test-roster-watch.js',
  // A DICA NUNCA aparece com o placar em quadra aberto. A trava vivia só no
  // hints.js; quem ESCURECE a tela é o coachmarks.js, que nasceu depois e não
  // sabia que o placar existe (e ainda é ele quem religa o hints.js). Roda o
  // coachmarks REAL com relógio controlado; contra o código anterior a dica
  // nasce em cima de quem está marcando ponto.
  'tests/dica-nunca-no-placar.test.js',

  // O GATE DE TERMOS não pode carimbar quem acabou de nascer. Relato do dono: "o modal
  // de termos nunca aparece pra ninguem" — MEDIDO: 188 de 202 aceites eram grandfather
  // automático, 187 deles a menos de 10s do nascimento da conta (a Paula levou 318 ms).
  // A lista de "evidência de uso" contava campos que o PRÓPRIO cadastro escreve
  // (createdAt, notifyLevel, acceptFriendRequests). Roda a expressão REAL do auth.js
  // contra o perfil REAL da Paula recém-criada.
  'tests/gate-de-termos-nao-carimba-conta-nova.test.js',

  // QUEM ACABOU DE CRIAR CONTA consegue entrar e se inscrever. Dois defeitos medidos no
  // Confra: (1) a busca do torneio só olhava listas em MEMÓRIA — conta nova não é membro
  // de nada e o discovery é assíncrono, então a inscrição era recusada no cliente sem a CF
  // ser chamada nem uma vez; (2) o auto-reload não reconhecia 'Database deleted by request
  // of the user' (IndexedDB apagado), que mata a sessão e impede gravar o perfil no login.
  'tests/conta-nova-consegue-entrar-e-inscrever.test.js',

  // A SAFE AREA É MEDIDA, NUNCA ESTIMADA. Dois defeitos que só existem NO APARELHO
  // (no navegador env() é 0 e eles somem): faixa morta no cabeçalho — 37px no iPhone,
  // porque o padding usava `inset - 12px`, um desconto no olho — e a placa do ponto
  // por cima do Desfazer, porque a reserva de altura era o número fixo `56 * escala`
  // enquanto o botão cresce com `env(safe-area-inset-bottom)`. A invasão é do tamanho
  // do inset: 49px no Android com 3 botões, o pior caso. Vale pros dois sistemas —
  // o projeto está em targetSdk 36 e o edge-to-edge lá é obrigatório.
  // Junto: o picker do sacador que cabia numa barra só, em duas colunas.
  'tests/safe-area-medida-nao-estimada.test.js',

  // O RELÓGIO ACOMPANHA O SACADOR E O ENCERRAR DELE ENCERRA. Dois relatos do dono,
  // ambos valendo pros DOIS sistemas (mesmo contrato, mesmo snapshot, mesmo botão):
  // a escolha do 1º sacador no celular não viajava (o campo saía de `serveOrder`,
  // que na tela do 1º sacador está vazia), e o "Fechar" do relógio só mexia em
  // estado LOCAL — a ponte não tinha intenção de encerrar, então a ordem não tinha
  // por onde chegar ao celular e o relógio ficava preso na tela de resultado.
  'tests/relogio-sacador-e-encerrar.test.js',
  // AMISTOSO É PARTIDA. O índice do letzplay enumera partidas avulsas
  // (`matchable_type: "User"`, card sem link de competição) e o extrator as descartava —
  // o acervo ficava devendo um id PARA SEMPRE, a barra parava em 98% e o verde virava
  // violeta. Junto: "concluí" virou verificação contra o índice, não impressão de página.
  'tests/lz-amistoso-fecha-a-conta.test.js',
  // O Salvar da Análise fica cinza + "Salvando…" até o trabalho terminar, nos DOIS botões
  // (o da matriz não recebia nada), e repintar no meio do save não apaga o feedback.
  'tests/analise-botao-salvando.test.js',
  // "Juliana Dal+Sasso" — o `+` do form-encoding da Apple chegava GRAVADO no banco
  // (e no displayName_lower, quebrando a busca); e a faixa do slider morava em 4
  // lugares e 2 unidades, fazendo o mesmo teto ser lido ora como 130%, ora 169%.
  'tests/nome-e-escala-sem-lixo.test.js',
];

let failed = [];
for (const rel of SUITES) {
  console.log('\n──────────── ' + rel + ' ────────────');
  const r = spawnSync(process.execPath, [path.join(ROOT, rel)], { stdio: 'inherit', cwd: ROOT });
  if (r.status !== 0) failed.push(rel);
}

console.log('\n════════════════════════════════════════');
if (failed.length === 0) {
  console.log('✅ TODAS as ' + SUITES.length + ' suítes unitárias passaram');
} else {
  console.log('❌ ' + failed.length + '/' + SUITES.length + ' suíte(s) FALHARAM:');
  failed.forEach((f) => console.log('   - ' + f));
}
console.log('════════════════════════════════════════');
process.exit(failed.length ? 1 : 0);
