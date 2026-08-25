/* Runner dos testes unitários headless — node tests/run-unit.js (ou npm test).
 * Roda cada suíte em processo próprio, mostra a saída e agrega o resultado.
 * Exit code != 0 se qualquer suíte falhar (serve pra CI / pre-deploy).
 */
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SUITES = [
  'tests/test-utils.js',
  // Cada FASE pode ter o seu formato de partida (1 set na classificatória, melhor de 3 com
  // super tie-break na eliminatória — pedido do dono com a Confra de exemplo). Guarda o
  // caminho INTEIRO, não o desenho: cfg.eliminatoria.scoring → compileToPhases →
  // phases[elim].scoring → window._effectiveScoring, que é quem o jogo consulta. O código
  // antigo carimbava `scoring: null` em toda fase e nada escrevia por cima.
  'tests/formato-da-partida-por-fase.test.js',
  // A fase 2 do Rei/Rainha forma Ouro/Prata DENTRO do grupo (1º+2º e 3º+4º), e isso tem de
  // sair dos SELETORES. O escopo por-grupo era `cfg.grupos > 1`, mas no R/R esse slider é
  // da Fase de GRUPOS e não fala do R/R — ele monta grupos de 4 sozinho. A Confra tem
  // `grupos:1` e 34 grupos na quadra, então o motor pareava o ranking GERAL plano (1º+2º
  // do TORNEIO) em vez de 1º+2º de cada grupo. Cobre as duas metades — o que os seletores
  // viram config, e o que o motor faz com ela — mais a semeadura por cabeça de chave.
  'tests/ouro-prata-sai-dos-seletores.test.js',
  // Entrar no torneio cai no TOPO DO SEU GRUPO — não no topo da página. O alvo da rolagem
  // era o JOGO da pessoa; sem jogo pendente não havia alvo nenhum, e no render Rei/Rainha o
  // grupo dela nem se anunciava. Cobre as duas metades: o render MARCA (data-my-group) e o
  // alvo (window._bracketEntryTarget) PREFERE esse grupo, com a ordem de prioridade do dono.
  'tests/entrar-no-torneio-cai-no-meu-grupo.test.js',
  // Bloco CSS sem `}` engole o RESTO do arquivo, sem erro nenhum. Aconteceu em
  // layout.css e matou 11 regras — entre elas a safe-area do PWA (cabeçalho invadindo
  // relógio/ilha) e o @media mobile inteiro. Mesma classe do <script> sem fechamento.
  'tests/css-nao-perde-regra.test.js',
  // Mesma classe, no HTML: uma <div> sem fechar não dá erro de sintaxe — ANINHA o resto
  // dentro dela. Na 2.0.10 o </div> do #gender-ratio-box foi apagado, #tiebreaker-section
  // foi parar dentro do #fase1-box, e o reorder do setup passou a tentar enfiar o pai
  // dentro do filho: HierarchyRequestError derrubou setupCreateTournamentModal NO MEIO.
  // Tudo que ela define depois sumiu (openEditTournamentModal, openCreateTournament,
  // _ctSetRatio…) e CRIAR e EDITAR torneio pararam — em silêncio, sem erro no console.
  'tests/form-nao-perde-div.test.js',
  // O app foi escrito olhando o tema ESCURO: caixa se destaca CLAREANDO o fundo, recua
  // ESCURECENDO, e texto de destaque é pastel. Os três hábitos INVERTEM no tema claro —
  // por isso o dono via "fonte preta em box escuro" e placar da mesma cor do card.
  // Guarda o INVARIANTE (todo hábito tem tradução declarada no claro, e nenhuma toca o
  // escuro), não os mecanismos: forma nova de quebrar contraste entra NAQUELE arquivo.
  'tests/contraste-nos-dois-temas.test.js',
  // Texto do usuário não pode ser CORTADO, e o encolhedor de nome (.sp-name-fit, feito
  // na v1.2.30) não pode virar enfeite — ficou em 2 usos porque nada cobrava. Trava as
  // duas causas reais: `overflow-wrap:break-word` (permite quebrar mas NÃO reduz a
  // largura mínima → vaza em flex) e restauração de cor presa a TAG em superfície
  // invertida (foi o `span[style*=…]` que deixou metade da previsão ilegível).
  'tests/texto-nunca-corta.test.js',
  // "Todos / Inscrições abertas / Encerrados" varrem a PLATAFORMA (outros organizadores
  // e ocultos incluídos); os ocultos aparecem na seção colapsável, em qualquer estado.
  // Cobre LISTA e CONTADOR juntos: na 1.8.89 consertei só a lista e o pill seguiu
  // dizendo "Todos 3" com 16 torneios na base — meia correção faz a tela se contradizer.
  'tests/filtros-varrem-a-plataforma.test.js',
  // Duas regras, a mesma armadilha: decidir por TIPO/RÓTULO quando o que importa é o
  // ESTADO. (a) o aviso marca como lido sozinho quando não há mais NADA A DECIDIR nele —
  // era barrado pelo tipo `match-pending-approval` mesmo já aprovado, e ficava não lido
  // pra sempre; (b) o botão de baixar só existe quando LEVA a algum lugar — nunca no
  // nativo, e só onde a ficha da loja está publicada de verdade (Play em 404 = sem botão).
  'tests/notificacao-lida-e-botao-da-loja.test.js',
  // A caixa de notificações não pode pesar megabytes, e CONTAR não pode ser BAIXAR.
  // Medido em 17/ago/2026: 476 avisos = 1,2 MB, com 95 KB de foto base64 em CADA aviso de
  // placar — e o badge do sino baixava toda não lida só pra escrever um número, na
  // abertura. Guarda os dois invariantes (nenhum caminho grava foto; contagem é agregação
  // no servidor, com fallback pra WebView de SDK velho).
  'tests/notificacao-nao-carrega-foto.test.js',
  // "Co-organizador(a)" pra quem TEM gênero declarado — a regressão que já voltou 2x. A
  // causa nunca foi a regra de português: o rótulo era texto CONGELADO no render, lido de
  // um cache de perfil que só esquenta depois, e o re-render que corrigiria morre no gate
  // de assinatura do detalhe. Guarda o invariante: rótulo que depende de perfil declara o
  // uid e as duas formas, e se cura sozinho na hidratação — como o NOME sempre fez.
  'tests/rotulo-de-papel-se-cura.test.js',
  // A bolinha da régua seguia os PONTOS do letzplay enquanto o rótulo ao lado saía do motor
  // de categoria — duas respostas pra mesma pergunta, e quem lê acredita no desenho: a
  // Bruna aparecia "D+" com a bolinha em B-. Guarda que a posição sai do RÓTULO, na mesma
  // escala em que as letras da régua são desenhadas.
  'tests/bolinha-no-ponto-do-rotulo.test.js',
  // O cabeçalho não invade relógio/ilha em NENHUM dos 4 contextos (navegador, PWA
  // instalado, nativo iOS, nativo Android). Complementa o teste de chaves: aquele garante
  // que a regra é ALCANÇÁVEL, este que ela EXISTE pra cada contexto.
  'tests/safe-area-cobre-todo-contexto.test.js',
  // Carregando é UMA tela só. Havia CINCO — e a que o dono via "no meio da experiência"
  // era o default do _renderBallLoader (bolinha + texto, sem barra). A do router (Entrar
  // → dashboard) tinha barra INDETERMINADA, e por isso nunca mostrava %.
  'tests/carregando-e-uma-tela-so.test.js',
  // a colocação do letzplay CHEGA na tela (o motor existia e estava mudo)
  'tests/lz-colocacao-na-tela.test.js',
  // nenhuma frase da leitura culpa o letzplay (regra do dono, 2 reincidências)
  'tests/lz-nao-culpa-o-letzplay.test.js',
  // nome de torneio repetido pela fonte é colapsado
  'tests/lz-nome-de-torneio-nao-repete.test.js',
  // no celular o toque explica que a leitura é no computador
  'tests/lz-celular-avisa-que-e-so-no-desktop.test.js',
  // loja atrás do mínimo → o app oferece o zip JUNTO da loja
  'tests/ext-loja-atras-manda-pro-zip.test.js',
  // reativar não é desfeito pelo guard do elenco
  'tests/reativar-nao-desativa-sozinho.test.js',
  // W.O. sempre desativa; a fila é ato da própria pessoa
  'tests/wo-sempre-desativa.test.js',
  // o suplente do W.O. respeita a proporção de gênero (o homem fura a fila de um grupo
  // 0/100 em 25/75 — ordem do dono, W.O. da Glauce no R1 Grupo R)
  'tests/wo-substituto-respeita-proporcao.test.js',
  // ⛔ PLACAR LANÇADO NUNCA É REESCRITO. Apliquei W.O. num grupo com os 3 jogos JÁ
  // lançados: o _rewriteSlot trocou o nome de quem jogou pelo do suplente DENTRO dos
  // jogos e o clearResults zerou placar e vencedor. Só o resultAt sobreviveu — foi ele
  // que provou que ali havia resultado. Regra do dono: quem sai mantém o que fez, quem
  // entra herda a POSIÇÃO. Passado é de quem jogou; futuro é de quem entra.
  'tests/placar-lancado-nunca-e-reescrito.test.js',
  // ⭐ W.O. PÓS-JOGOS (2.0.50, caso Adele): o botão de Aplicar W.O. continua pro
  // ORGANIZADOR mesmo com o grupo terminado; placar e nome de quem jogou ficam; a
  // suplente herda a vaga no elenco E a posição no retrato congelado (classifCongelada) —
  // sistemática da Juliana Reis. E a rota canônica Rei/Rainha ganha a MESMA fronteira
  // (jogo com placar não se renomeia).
  'tests/wo-pos-jogos-herda-posicao.test.js',
  // ⭐ Jogador X ocupa a VAGA na tabela do grupo, ZERADO (2.0.52, G2 do Confra) — a
  // linha aparece mas o ghost segue sem pontuar (jogo e PA), mesmo quando joga.
  'tests/jogador-x-ocupa-a-vaga-zerado.test.js',
  // ⭐ TODOS os W.O.s do grupo indicados (2.0.53) — o estado é slot único; a lista
  // completa (traces + cadeia + estado) sai de _ligaGroupWoList.
  'tests/todos-os-wos-do-grupo-indicados.test.js',
  // ⛔ A máscara do celular do perfil mora no MARKUP (2.0.54, caso Vanessa) —
  // addEventListener se perde em re-render e deixava campo cru + Verificar apagado.
  'tests/mascara-do-celular-mora-no-markup.test.js',
  // ⛔ O SLOT SE DECIDE POR UID (2.0.56): render posicional preserva o buraco do uid
  // null (Jogador X não rouba o nome do parceiro) e _rewriteSlot troca por uid mesmo
  // com rótulo envelhecido (jogos não jogados SEMPRE recebem o substituto).
  'tests/slot-se-decide-por-uid.test.js',
  // ⭐ Jogador X é escolha de PRIMEIRA CLASSE no ato do W.O. (2.0.61, caso Fábio/E2).
  'tests/jogador-x-e-escolha-de-primeira-classe.test.js',
  // ⛔ OS CRITÉRIOS DE DESEMPATE E A ORDEM DO ORGANIZADOR MANDAM — SEMPRE, EM TODO CAMINHO.
  // O ranking de derrotados que decide a REPESCAGEM era a QUARTA cópia da lista de critérios
  // e a classificação dos não-classificados a QUINTA. Na quarta: um critério FANTASMA
  // (lastScoreDiff) decidia antes da lista, `pontos_avancados` nem existia no switch, e
  // `buchholz`/`sonneborn_berger` eram case VAZIOS — de 8 critérios configurados, 4 não
  // faziam nada. Reordenar ou excluir na tela não mudava nada. O teste prova o contrário:
  // trocar a ordem TEM de trocar o resultado, e nenhuma régua paralela pode existir.
  'tests/criterios-do-organizador-mandam.test.js',
  // ⛔ CLASSIFICAÇÃO JÁ PUBLICADA NÃO MUDA, nem quando a régua melhora. A chave grava as
  // duplas dentro do jogo, então é imutável — mas a classificação do grupo NÃO era gravada
  // e era recalculada a cada render. Melhorar o desempate (como na 2.0.18) reordenava a
  // tela e ela passava a discordar da dupla que a pessoa já tinha visto. O avanço passa a
  // congelar a ordem no grupo; a tela lê o retrato. Congela a ORDEM, não as estatísticas.
  'tests/classificacao-publicada-nao-muda.test.js',
  // Buscar quem levou W.O. tem de achar o GRUPO dele. Quem leva W.O. sai dos jogos (o
  // substituto ocupa o slot), então o nome some do data-players dos cards e o filtro
  // escondia o box inteiro — sobrava só o chip solto na caixa "W.O.", que não diz de qual
  // grupo era nem quem entrou. A pílula "🔁 Fulana W.O. → Beltrana" e a linha da
  // classificação passam a se declarar; a linha cobre o torneio já encerrado, em que a
  // pílula não é renderizada.
  'tests/busca-acha-o-grupo-de-quem-tomou-wo.test.js',
  'tests/classificacao-do-grupo-sobrevive-a-busca.test.js',
  'tests/avanco-de-fase-nao-enfileira.test.js',
  'tests/identidade-por-uid-no-avanco-e-no-wo.test.js',
  'tests/ver-menos-de-novidades-acompanha-a-rolagem.test.js',
  'tests/selos-das-lojas-do-mesmo-tamanho.test.js',
  'tests/trava-de-cache-buster-nao-fica-vazia.test.js',
  'tests/regressiva-e-da-rodada-nao-da-fase.test.js',
  // o cronômetro da Liga mira o fim da rodada
  'tests/liga-countdown-round-end.test.js',
  // o relógio do meio (RODADA e TORNEIO COMPLETO) vira REGRESSIVA quando há fim programado
  'tests/progresso-regressiva-fim-programado.test.js',
  'tests/barras-de-progresso-mostram-o-percentual.test.js',
  'tests/relogio-cor-do-ritmo-e-centrado.test.js',
  'tests/foto-do-card-aparece-nos-dois-temas.test.js',
  'tests/consenso-na-dashboard.test.js',
  'tests/aprovar-no-feed-a-tela-muda.test.js',
  // nome não é cortado na tela
  'tests/nome-nunca-e-cortado.test.js',
  // repescagem: melhor derrotado pelos critérios do organizador
  'tests/repechage-best-loser.test.js',
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
  // um "Reverter" para CADA W.O. do grupo (o botão era um só e desfazia sempre o do
  // estado), a lista sem a pílula duplicada, e o chip do grupo de WhatsApp na mão do
  // ORGANIZADOR — que quase nunca joga o grupo que precisa montar.
  'tests/um-reverter-por-wo-e-whats-do-organizador.test.js',
  // o HISTÓRICO de W.O. é gravado (t.woLog), não deduzido do estado. Trava o contrato que
  // custou 4 consertos em 4 dias: aplicar grava, reverter marca (não apaga), a tela lê, e
  // mexer no estado — marcador, rastro, slot do grupo, ir pra espera — não muda o passado.
  'tests/wo-log-o-historico-e-gravado.test.js',
  // Os DOIS chips do rodapé do card ("Combinar jogo" + grupo de whats) são irmãos
  // com GATE COMUM: quebrar o gate derruba os dois DE UMA VEZ e EM SILÊNCIO (todo
  // call site é guardado por `typeof === 'function'`). Nasceu de um relato de
  // regressão na 1.7.76 que a medição não confirmou — o que faltava era o teste.
  'tests/chips-do-card-do-jogo.test.js',
  'tests/elim-seed.test.js',
  'tests/elim-reirainha-opening.test.js',
  'tests/chave-label-default.test.js',
  'tests/letzplay-verdict-color.test.js',
  'tests/classificacao-nome-por-linha.test.js',
  'tests/tiebreak-nao-entra-no-placar.test.js',
  'tests/motor-velho-nao-e-leitura-completa.test.js',
  'tests/leitura-longa-conclui.test.js',
  'tests/regua-intercalada-unica.test.js',
  'tests/sinal-e-semantico.test.js',
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
  // quem reativou e foi pra fila não pode seguir na lista "⚠️ W.O." (caso Carol Moresco,
  // 24/ago/2026): com a vaga preenchida o marcador de folga 'wo' sai no mesmo ato; com a
  // vaga aberta ele fica (é dele que saem os 0 pts e a punição). A história do grupo
  // (g.woAbsent/g.subName) não se toca em cenário nenhum.
  'tests/wo-na-fila-nao-esta-na-lista-de-wo.test.js',
  // o card do topo NUNCA pode contradizer o torneio: quem está na lista de espera,
  // desativado ou com W.O. lia "você não está inscrito" (dado REAL do Confra).
  'tests/meu-card-nunca-contradiz.test.js',
  // a espera formava ZERO grupo com 3 homens + 3 mulheres e a proporção 25/75 travada,
  // porque a fila se partia pela categoria da INSCRIÇÃO e não pela da rodada.
  'tests/espera-forma-grupo-por-ordem.test.js',
  // Depois de COLOCADA no sorteio, sair não é remover — é desativar. A Juliana Reis saiu de
  // `participants` e continuou no R1 Grupo M com 3 jogos pontuados: 136 vagas pra 135
  // inscritos, contagem ímpar, e a fase 2 (dupla dentro do grupo) sem como fechar o grupo.
  // Trava também a PARIDADE cliente × CF por matriz: se as duas pontas divergirem, o cliente
  // remove, o onSnapshot traz de volta e a pessoa pisca saindo e voltando na tela.
  'tests/nao-se-desinscreve-do-sorteio.test.js',
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
  'tests/wo-auto-do-proprio-jogador.test.js',
  'tests/wo-outcome-negotiation.test.js',
  'tests/late-enroll-inherit.test.js',
  'tests/late-enroll-window-r2-result.test.js',
  'tests/dash-enroll-late-window.test.js',
  // 📣 Novidades no seu torneio: a MESMA grade de "Seus últimos resultados", sandbox fora
  // dos feeds (o clone duplicava tudo e roubava vaga na lista que corta em 3) e lançamento
  // PENDENTE entrando com o carimbo do proposedAt — sem ele o topo mostrava "há 18h" com o
  // torneio andando hoje. O feed é somente leitura (o organizador via "Editar" fora da chave).
  'tests/novidades-grade-ordem-e-sem-repeticao.test.js',
  'tests/espera-legivel-sobre-foto.test.js',
  'tests/notificacao-lida-por-permanencia.test.js',
  'tests/notificacao-lida-nao-desce-para-antigas.test.js',
  'tests/celular-registrado-pelo-organizador.test.js',
  'tests/previsao-tempo-agora-hoje-proximos.test.js',
  'tests/x-da-busca-alvo-de-toque.test.js',
  'tests/azul-e-slots-fixos.test.js',
  // 🏅 Seus últimos resultados: FECHADA NÃO É VAZIA. O corpo inteiro sumia (`display:none`)
  // e a seção fechada não mostrava nada — "discreto demais". Agora o card mais recente fica
  // à vista e os anteriores somem por CSS, igual às Novidades; havendo pendência, quem
  // aparece é ela (é a que pede ação).
  'tests/ultimos-resultados-mostra-o-ultimo.test.js',
  // 📐 As duas seções FECHADAS preenchem a LINHA: a grade abre 2, 3 ou 4 colunas em tela
  // larga e a prévia mostrava 1 card só, deixando o buraco do print do dono. A prévia agora
  // vai até o nº de colunas MEDIDO (nada de breakpoint chutado) e o convite conta o que
  // REALMENTE sobrou — botão que promete contagem errada é pior que o buraco.
  'tests/previa-fechada-preenche-a-linha.test.js',
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
  // Incidente de 13/ago/2026 (torneio ao vivo): relógio preso no fim de set (o guard de
  // seq descartava a carga nova da WebView — agora há ÉPOCA de sessão no snapshot) e o
  // Desfazer que não retomava o jogo terminado (a tela de fim não oferecia o botão e o
  // resultado auto-gravado nunca seria regravado — agora o undo rearma o save com id
  // estável de histórico). + ♥ FC máxima do perfil sobrepondo 220−idade nas faixas.
  'tests/watch-epoca-e-desfazer-pos-fim.test.js',
  // Caminho B (Leva 1): os vetores de paridade gravados em tests/watch-engine/vectors/
  // são a referência dos motores nativos do relógio. Este teste re-dirige o motor GSM
  // REAL (bracket-ui.js no harness, Chromium) e exige que ele reproduza os vetores —
  // mudança de comportamento fica vermelha até regravar (--write) E re-validar o nativo.
  'tests/watch-engine-vectors.test.js',
  // Caminho B (fiação): o celular RECEBE o diário de eventos do relógio e o reproduz no
  // motor JS canônico (de onde saem placar oficial/Firestore/histórico). Trava ordem por
  // `n`, idempotência do reenvio (dedup deviceId#n), época nova zerando o dedup e o
  // receptor não reimplementando nada de placar.
  'tests/watch-diario-de-eventos.test.js',
  // A notificação de placar segue o JOGO, não o retrato de quando foi criada: aprovado o
  // resultado, somem Confirmar/Contestar e sobra só Editar. Roda o renderNotifications
  // REAL com Firestore falso; a régua é a MESMA do card da chave (pendingResult && !winner).
  'tests/notificacao-de-placar-segue-o-jogo.test.js',
  // O botão de dar W.O. fica na MESMA PONTA da linha com e sem W.O. aplicado, e diz o
  // que faz ("Aplicar W.O.") — "W.O." pelado lê como selo de estado, que é o que a
  // tabela do grupo usa. A posição já regrediu 2x (1.7.90 e 1.7.93, ambas verificadas
  // só no navegador): esta é a trava.
  'tests/wo-botao-aplicar-na-ponta.test.js',
  // CRASE dentro de template literal derruba a tela e o `node --check` NÃO pega (tela
  // preta da 1.8.72, em produção). Varre js/ atrás de comentário HTML com crase E
  // AVALIA o template do hero da dashboard de verdade.
  'tests/template-literal-nao-quebra.test.js',
  'tests/usuario-sempre-time-azul.test.js',
  'tests/relogio-tres-chaves.test.js',
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
  // A lista de inscritos chega em FATIAS (1ª pintura 34,5ms → 11,1ms no Confra). Guarda o
  // invariante: pode chegar em pedaços, mas nunca falta card, nunca há branco onde a
  // pessoa olha e a tela não pula. Sobe um Chromium com o app real + o Confra de 111.
  'tests/inscritos-em-fatias.test.js',
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
  // CAUSA-RAIZ do inscrito invisível: o push otimista da inscrição não pode ser persistido
  // por um save de outra coisa quando a resposta do servidor nunca chega. v1.8.1.
  'tests/inscricao-otimista-nao-persiste.test.js',
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
  // O gatilho do TB não pode depender da GRAFIA do esporte: "🎾 Beach Tennis"
  // (quick-create) tem que abrir o campo no 6-5 igual a "Beach Tennis". v1.8.41.
  'tests/tiebreak-sport-com-emoji.test.js',
  // REGRA DO DONO: o gatilho segue a CONFIGURAÇÃO do torneio (5-5 → 6-5, 6-6 → 7-6),
  // vence o padrão do esporte nos dois sentidos, escala com gamesPerSet e nunca é
  // cravado. Inclui a ESCRITA: o que a tela destaca é o que fica gravado. v1.8.42.
  'tests/tiebreak-segue-a-config.test.js',
  // O campo do TB tem que existir em TODOS os caminhos de lançamento (organizador E
  // participante). O relato foi no card com PROPOSTA PENDENTE — o único ramo que nunca
  // renderizou tb1/tb2, então _highlightWinner virava no-op silencioso. v1.8.43.
  'tests/tiebreak-em-todos-os-caminhos.test.js',
  // UMA forma de gravar o tie-break ({pointsP1,pointsP2}) + o subplacar sobrevive do
  // lançamento até a tela (o `sets` no pendingResult é o que faltava). v1.8.44.
  'tests/tiebreak-uma-forma-de-gravar.test.js',
  // GOLDEN MASTER DO MOTOR: congela a saída (classificação + rodada gerada) contra os
  // docs REAIS de produção, anonimizados. Existe pra a ordem do dono — "consertar o motor
  // sem mudar o que já temos" — ser PROVÁVEL e não uma promessa: qualquer diferença na
  // saída reprova, mesmo que pareça melhoria. Regravar exige --gravar e explicação no
  // commit. Cobre 118 jogos gerados (inclui Rei/Rainha do Confra) e 291 linhas de
  // classificação. v1.8.50.
  'tests/motor-golden-master.js',
  // GOLDEN MASTER DA ELIMINATÓRIA: a metade que o de cima NÃO alcança. O motor-golden
  // congela a fase CLASSIFICATÓRIA e a leitura viva, mas nunca roda o AVANÇO DE FASE —
  // e é exatamente a eliminatória do Confra que ainda não aconteceu e que o dono liberou
  // pra mexer. Roda `_advanceMultiPhase` sobre o SANDBOX do Confra (137 inscritos, 33
  // grupos, 104 jogos) com a R1 completada de forma determinística, e congela os 98
  // confrontos gerados + a classificação por grupo que os alimentou. A cobertura dos
  // degraus de desempate está MEDIDA no cabeçalho do arquivo (4 dos 9, e por quê).
  'tests/eliminatoria-golden-master.js',
  // O SLOT DA ELIMINATÓRIA NASCE COM UID. Medido no sandbox do Confra: os 98 jogos saíam
  // com team1Uids vazio — a chave que decide o campeão nasceria presa ao rótulo do dia do
  // sorteio. Causa: a chave da linha de classificação resolvia o uid por 3 fontes e o campo
  // `uid` da MESMA linha por 2. Trava identidade + propagação de nome, e a exceção legítima
  // (fictício sem conta continua pelo nome). v1.8.55.
  'tests/eliminatoria-nasce-com-uid.test.js',
  // GOLDEN MASTER DO CONSTRUTOR: congela em que FASES cada configuração de torneio compila.
  // Cobre as formas que o dono definiu como modelo (só eliminatória · eliminatória que abre
  // com Rei/Rainha · classificatória + eliminatória · só classificatória por rodadas ou por
  // datas · dupla eliminatória · linhas Ouro/Prata · classificatória + rodada de formação).
  // É a trava que permite MOVER configuração de lugar sem mudar o torneio que ela produz —
  // e ela pegou, na hora, um erro de escopo no primeiro refactor. v1.8.56.
  'tests/construtor-golden-master.js',
  // "ONDE ESTÃO OS JOGOS DESTA FASE" é UMA pergunta só. phaseComplete (segura o avanço) e
  // pendingMatches (lista o que falta) varriam os 3 storages CADA UMA — o comentário do
  // código chamava a segunda de "espelho" da primeira. Agora as duas leem por phaseGames.
  // Trava o invariante que elas deviam cumprir juntas: fase completa ⟺ zero pendentes,
  // nos três storages, com BYE/folga não segurando e grupo vazio segurando. v1.8.57.
  'tests/fase-uma-leitura-so.test.js',
  // A TABELA E A CHAVE USAM A MESMA ORDEM. Havia duas respostas pra "quem está na frente":
  // a cadeia longa da tabela (bracket-logic) e uma cadeia CURTA própria da transição de fase
  // (phases-engine._globalStandings), que parava em saldo de pontos e, empatando, mantinha a
  // ordem de varredura dos grupos. MEDIDO no sandbox do Confra: 132 classificados e 80
  // posições em que as duas discordavam. Agora as duas chamam _standingsCompare. v1.8.59.
  'tests/classificacao-uma-regra-so.test.js',
  // OS CRITÉRIOS DE DESEMPATE SÃO OS QUE O ORGANIZADOR CONFIGUROU — em qualquer fase.
  // Duas das quatro funções de classificação ignoravam `t.tiebreakers` (a tabela do
  // Rei/Rainha e a ordem de quem sobe de fase). E `antiguidade`/`juventude` NUNCA
  // funcionaram em lugar nenhum: o parser de nascimento só lia dd/mm/aaaa e o perfil grava
  // ISO. Trava tirar/trocar/reordenar critério, confronto direto por uid, e o princípio de
  // que critério sem dado é NEUTRO (nunca chute). v1.8.60.
  'tests/desempate-do-organizador-vale.test.js',
  // OS DOIS STORAGES DA FASE CLASSIFICATÓRIA DESENHAM IGUAL — e torneio NOVO nasce no
  // canônico (`t.matches` taggeado), enquanto o legado (o Confra, único no storage antigo)
  // fica onde está. O que bloqueava isso era o RENDER: um Rei/Rainha em t.matches caía no
  // builder de CHAVE e saía com 4.815 bytes sem os jogadores, contra 33.401. Trava leitura,
  // render, o ciclo completo de um torneio novo e o legado não mudar de lugar. v1.8.63.
  'tests/dois-storages-desenham-igual.test.js',
  // O CICLO DE RESULTADO PELO PARTICIPANTE (propor → adversário aprova → contestar →
  // organizador resolve), com e sem tie-break. Nasceu do R1 Grupo S do Confra, onde uma
  // participante tentou lançar o mesmo jogo 5 vezes em 2 minutos. v1.8.51.
  'tests/participante-lanca-e-aprova.test.js',
  'tests/tiebreak-display-persist.test.js',
  'tests/criterio-nao-perde-o-flex-ao-reaparecer.test.js',
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
  // FUNDIR EXIGE CREDENCIAL AUTENTICADA — E NOS DOIS CAMINHOS. A regra existia desde
  // 11/ago mas só dentro do trigger; a varredura diária (a outra porta) seguia fundindo
  // pelo `phone` DIGITADO no perfil e, em 19/ago às 04:45, fundiu duas pessoas diferentes
  // (Confra) porque um dos perfis carregava, digitado, o celular da outra.
  // A decisão da varredura virou módulo puro (merge-sweep-core) só pra este teste poder
  // exercitá-la de verdade — antes só dava pra checar o texto do index.js, que é teatro.
  'functions/test-merge-proof.js',
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
  // Apagar o torneio apaga as CÓPIAS dele nas pessoas (`users/{uid}/matchHistory`) — que
  // o delete do cliente nunca tocou, deixando o torneio vivo na ficha da própria pessoa e
  // morto na de todos os outros. Trava também o `t_<tid>_<matchId>` contra bracket-ui.js
  // e o fato de `participants` ser CF-only (sem regra → cliente negado). CF-only, 12/ago/2026.
  'functions/test-tournament-purge-core.js',
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
  // CONTA NO AUTH SEM PERFIL NO FIRESTORE. Medido em 22/ago/2026: 236 contas no Auth ×
  // 248 docs em users/ → 2 órfãs, ambas Apple com e-mail oculto, ambas com
  // lastSignIn == creation. Sem doc a pessoa não existe pro app (busca, lista de espera,
  // inscrição) e o organizador vê "Jogador sem perfil". O teste do cliente dirige o
  // simulateLoginSuccess REAL e injeta as 4 falhas de rede que produziam a órfã em
  // silêncio; o do servidor trava a regra da varredura — em especial NÃO criar perfil de
  // quem tem loginRedirects (isso prenderia a pessoa numa conta vazia).
  'tests/apple-nao-deixa-conta-orfa.test.js',
  'tests/celular-botao-verificar-acende.test.js',
  'functions/test-orphan-profile-core.js',
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
  'tests/lz-posicao-de-grupo-nao-e-podio.test.js',
  'tests/lz-colocacao-final.test.js',
  'tests/duplas-mistas-consistencia.test.js',
  'tests/lz-contador-nunca-abaixo-do-acervo.test.js',
  'tests/volta-da-ficha-pro-torneio.test.js',
  // O Salvar da Análise fica cinza + "Salvando…" até o trabalho terminar, nos DOIS botões
  // (o da matriz não recebia nada), e repintar no meio do save não apaga o feedback.
  'tests/analise-botao-salvando.test.js',
  // "Juliana Dal+Sasso" — o `+` do form-encoding da Apple chegava GRAVADO no banco
  // (e no displayName_lower, quebrando a busca); e a faixa do slider morava em 4
  // lugares e 2 unidades, fazendo o mesmo teto ser lido ora como 130%, ora 169%.
  // O splash só sai quando os dados carregaram — o teto por tempo revelava tela vazia
  // e o app travava ao primeiro toque. v1.8.12.
  'tests/boot-libera-quando-carregou.test.js',
  // O PWA abre sem tela branca: o topo do sw.js não pode depender da rede (era
  // importScripts do Firebase por outra origem, bloqueando TODO fetch) e o shell
  // sai do cache sem esperar round-trip. Roda o sw.js de verdade. v1.8.35.
  'tests/sw-abre-sem-tela-branca.test.js',
  // Entrar na lista de espera passa pelo SERVIDOR (enrollParticipant), nunca por
  // saveTournament do doc inteiro — incidente da Mariana no Confra, 12/ago. v1.8.36.
  'tests/inscricao-na-fila-passa-pelo-servidor.test.js',
  // v1.8.40 — a leva do login/inscrição (13/ago/2026):
  // "inscrições abertas" é UMA regra (paridade cliente×servidor por matriz; era o
  // bloqueio indevido de Liga aberta pré-sorteio com prazo vencido)
  'tests/inscricao-aberta-uma-regra.test.js',
  // o resultado da inscrição tem UM leitor — waitlisted/closed/dupSuspect nunca mais mudos
  'tests/inscricao-outcomes-um-leitor.test.js',
  // modal com Google/Apple no topo + "último usado" + linking sem API morta +
  // corrida do resgate fechada + hint precoce + pedido de celular
  'tests/login-um-caminho-so.test.js',
  // e-mail de consolidação da conta (assinatura anti-spam, conteúdo, gatilho, backfill)
  'functions/test-account-email-core.js',
  // O "Entrar" da landing responde ao PRIMEIRO toque mesmo com o JS ainda na rede —
  // era isso que ficava mudo logo depois de uma atualização (cache zerado). v1.8.37.
  'tests/entrar-nunca-fica-mudo.test.js',
  // Nome de 1 token: sugere sobrenome no perfil e vira sinal de duplicata quando o
  // token é RARO e não é sobrenome. Trava a paridade cliente×servidor. v1.8.38.
  'tests/sobrenome-e-raridade.test.js',
  // Script que chega TRUNCADO (medido no Sentry: EOF no meio de um arquivo íntegro no
  // servidor) limpa cache, tira o SW e recarrega uma vez. v1.8.39.
  'tests/js-truncado-se-conserta.test.js',
  'tests/nome-e-escala-sem-lixo.test.js',
  // Exclusão de conta manda comprovante (titular + dono, CC barthlabs) por gatilho —
  // qualquer origem, inclusive script de admin e console. Trava o caso que dói:
  // FUSÃO não é exclusão (o cleanupAbandonedAuth apaga o doc do merge-ghost 7 dias
  // depois, e quem uniu contas não pode receber "sua conta foi excluída").
  'functions/test-account-deletion-email-core.js',
  // O ✅ Confirmar tem que CHEGAR na tela de quem pode homologar. Incidente do "jogo 74"
  // (Confra, 17/ago): no Rei/Rainha as duplas rodam, então quando as duas pessoas ativas
  // do grupo caem no MESMO time não sobra ninguém do lado adversário pra aprovar — e o
  // organizador não tinha botão, só "Editar". Junto disso, o gate de re-render lia
  // `score1/score2` (campo inexistente) e ignorava `pendingResult`, então a proposta
  // chegava pela rede sem acordar a tela de quem já estava olhando. v1.9.21.
  'tests/confirmar-placar-chega-na-tela.test.js',
  // A fusão NÃO apaga a conta absorvida — deixa uma LÁPIDE (mergedInto) com o MESMO
  // telefone/e-mail/nome do sobrevivente. Das 36 buscas amplas em users/, 30 pegavam
  // `snap.docs[0]` sem olhar isso: transferir organização, convidar co-organizador, avisar e
  // casar conta no login podiam AGIR SOBRE O UID MORTO. Guarda os dois lados: o resolvedor
  // único (corrente, ciclo, órfã, colapso lápide+vivo) e o INVARIANTE de que nenhuma busca
  // nova escapa da porta. v1.9.33.
  'tests/lapide-nunca-vence-a-conta-viva.test.js',
  // A MESMA regra, do lado do SERVIDOR — que a do cliente não alcança. Quem manda o
  // comunicado do organizador, quem resolve o login por e-mail/telefone vinculado e quem
  // escolhe o alvo da prova de fusão são Cloud Functions. 4 buscas agiam sobre o uid morto,
  // e 2 caminhadores de corrente escritos à mão SAÍAM COM A LÁPIDE além do 5º salto (o
  // resolveMergedLogin chegava a emitir custom token com ela). A varredura aqui é mais
  // ampla que a do cliente de propósito: pega campo DINÂMICO (`where(t.f, ...)`), que no
  // servidor é a forma comum e a regex de literais não veria.
  'tests/user-vivo-no-servidor.test.js',
  // "Jogador sem perfil (XXXX)" ocupando o lugar de gente que TEM perfil: o rótulo neutro é
  // truthy e vencia fonte boa (folga com nome gravado) no cache frio, e ainda ia CONGELADO
  // pro HTML — sem [data-uid-name] o hidratador não tinha o que curar e o repaint morre no
  // gate de assinatura do detalhe. Medido no doc real do Confra: 7 chips na tela + 142 de
  // 142 linhas da classificação geral.
  'tests/rotulo-orfao-nao-vence-o-nome.test.js',
  // a dashboard piscando PRETO depois de carregada: o gate por assinatura estava sempre
  // aberto porque o lado que CARIMBA e o lado que COMPARA usavam formatos diferentes —
  // re-render a cada snapshot, sem nem passar pelo debounce.
  'tests/dashboard-nao-repinta-sozinha.test.js',
  // de onde sai a LETRA (medalha, nome da competição como reserva) e o "+" de quem está
  // no pódio do ranking da própria categoria — a regra por fração era inerte sem o
  // tamanho do campo, que o footprint não traz.
  'tests/categoria-letra-fontes.test.js',
  // 🔴 "Ao vivo agora": quando a vitrine existe, em que ordem, quem é convidado a
  // assistir — e a trava estrutural de que quem assiste NÃO escreve no placar alheio.
  'tests/ao-vivo-agora.test.js',
  // a chave pinta em DUAS tacadas (topo agora, corpo no quadro seguinte). O risco da
  // técnica é entregar meia tela — este teste guarda a rede dupla de agendamento (rAF
  // NÃO dispara em aba de fundo), a ordem dos blocos e que o filtro só roda no fim.
  // as dicas voltaram a aparecer (1.9.41) e trouxeram junto dois defeitos que estavam
  // escondidos: medir layout a cada evento de scroll (trava a rolagem) e o balão
  // engolindo o toque mirado no card (o "triplo clique").
  'tests/dica-nao-atrapalha.test.js',
  // a resposta ao toque no card de torneio nasceu na 1.9.46 DENTRO do handler da
  // dashboard — e a LISTA de torneios, que tinha cópia própria da navegação, ficou sem
  // feedback nenhum. Guarda a PORTA ÚNICA (todo card abre por `_openTournamentCard`) e
  // o realce `:active`, que é o único que responde sem depender de JS rodar.
  'tests/card-de-torneio-responde-ao-toque.test.js',
  // MEDIDO nos docs de produção: logo+capa em base64 são 62% do peso dos torneios (num
  // doc, 305 KB de 311). Como o save mandava o objeto inteiro, um placar de ~50 bytes
  // reenviava ~147 KB de imagem e devolvia isso a cada listener. Trava que imagem só
  // viaja quando é ELA que mudou — e que `merge:true` continua, pois é ele que faz
  // omitir ≠ apagar.
  'tests/imagem-nao-viaja-com-placar.test.js',
  // a mesma base64 que pesava na ESCRITA pesava no RENDER: o card a concatenava dentro
  // do HTML (até ~100 KB por card), e o parser mastigava isso na thread principal.
  // Trava que a imagem é pintada DEPOIS do card, do dado já em memória.
  'tests/imagem-do-torneio-fora-do-html.test.js',
  // a Sônia confirmou placar pela notificação, o app disse confirmado e no torneio o jogo
  // seguia PENDENTE: o toast de sucesso saía ANTES da gravação, e a persistência era uma
  // promessa sem `.catch` — a rejeição virava unhandled e sumia. Trava que o aviso é
  // CONSEQUÊNCIA da gravação, nos dois caminhos (commitTournamentTx e _closeRound).
  'tests/aprovar-placar-nao-mente.test.js',
  // print do dono: 'Toninho' BRANCO (= sem time) ocupando a coluna do time 2. Eram TRES
  // definicoes de 'duplas formadas' discordando, e o `else` da divisao adotava quem nao
  // tinha time. Jogador com team undefined e filtrado pra fora dos DOIS times e some do
  // p1Name/p2Name — vira placar creditado errado. Agora: 2x2 ou nao formou.
  'tests/dupla-casual-nao-perde-jogador.test.js',
  'tests/formacao-de-duplas-casual.test.js',
  // a MESMA bola de 'Carregando' era pedida em 5 tamanhos (4.5/4/3/2.4/2.2rem) e pulava
  // de tamanho a cada troca de tela. O tamanho passa a ser imposto NA FONTE; o que varia
  // por tela e a CAIXA (minHeight). A versao inline e excecao (e uma linha, nao uma tela).
  'tests/carregando-tem-um-tamanho-so.test.js',
  // replay 'passava atras da tela'. NAO era z-index (100060 e o maior do app): quem esta
  // em tela cheia faz o navegador desenhar SO a subarvore dele — o replay, pendurado no
  // body, ficava FORA do escopo desenhado. Desde a 1.9.60 o arquivo guarda o INVARIANTE
  // (nao pode existir uma segunda tela de replay pendurada as cegas) e nao o mecanismo,
  // porque a causa sumiu: o replay virou o proprio placar ao vivo.
  'tests/replay-aparece-em-tela-cheia.test.js',
  // O REPLAY E O PLACAR AO VIVO — mesma tela, mesmo motor, pontos vindos do diario
  // gravado em vez do dedo. Ate a 1.9.59 era uma tela PARALELA que redesenhava o placar
  // e tinha que ADIVINHAR quando um game virava; foi essa duplicacao que produziu o bug
  // daquela versao. Sobe o bracket-ui.js REAL num Chromium, JOGA uma partida, deixa o app
  // gravar o registro e REPRODUZ: o placar tem que sair identico e nada pode ser gravado
  // (`_saveResult` sai na 1a linha — e o que protege `_resultSaved`/`_liveRecId` do
  // auto-save de fim de partida).
  'tests/replay-e-o-placar-ao-vivo.test.js',
  // o convite IMPRESSO desenhava as lojas como TEXTO com glifo ('▶ Google Play'), imitando
  // a marca — o dono viu impresso e chamou de ridiculo. Trava o selo OFICIAL (imagem, com
  // fallback pro texto) e que a Play so entra quando a ficha dela sair do 404.
  'tests/convite-usa-selo-oficial-da-loja.test.js',
  // Cobrança DIÁRIA de celular no perfil (Confra): quem tem celular NUNCA recebe, lápide
  // resolve pra conta viva, a LEVA fica gravada (sem isso "quantos atenderam" é
  // incalculável — foi o buraco do envio manual de 18/ago) e a rotina NASCE em ensaio.
  'functions/test-phone-nudge-core.js',
  // O bundle EMBARCADO nunca sai de uma leva anterior. `npx cap sync` puro só COPIA o
  // www/ que já existir — quem MONTA é o build-www.js, dentro do `npm run cap:sync`. Os
  // DOIS scripts de release chamavam o errado, com fallback que engolia a falha. Medido
  // em 19/ago/2026: o www/ nem existia e o embarcado estava sem o toggle .pf-switch da
  // 1.9.69 — o "ovo" voltaria pro TestFlight pela 2a vez, e `git status` limpo não
  // denuncia (os embarcados são gerados). Roda a trava contra árvores de mentira e cobra
  // que os dois scripts chamem a MESMA — a duplicação foi a causa, então é ela o alvo.
  'tests/embarcado-nao-sai-velho.test.js',
  // O splash do index.html ainda divergia do corpo único em 3 medidas (logo 208×156 vs
  // 152×114, wordmark 1.8 vs 1.2rem, texto 1.17rem/800 ABAIXO da barra vs 0.88rem/600
  // entre a bola e a barra) — e a escala da raiz (--ui-scale 1.3) só entrava DEPOIS do
  // splash nascer, então tudo que é rem pulava ~30% na abertura. Era o "mesmos elementos
  // em tamanhos diferentes que se alternam". O teste LÊ as medidas do corpo único e da
  // escala no store.js e cobra as MESMAS no index.html: mexeu num lado sem o outro, quebra.
  'tests/carregando-geometria-canonica.test.js',
  // "Você está aqui?" perguntava TODA abertura no local preferido: o único guard era
  // sessionStorage, que morre quando o app nativo fecha. Agora "Agora não" grava um
  // silêncio de 4h em localStorage (por uid+local). Roda o presence-geo.js real num
  // sandbox e reproduz o ciclo abrir→não→fechar→reabrir.
  'tests/geo-pergunta-silencia-4h.test.js',
  // Travadas de ~1,2s repetidas medidas no APARELHO (78): o listener de torneios
  // pagava doc.data() de TODOS os docs + JSON.stringify do cache a CADA eco.
  // Trava o reuso incremental (docChanges), o cache com debounce+flush e o nome
  // do trecho na telemetria.
  'tests/eco-de-snapshot-nao-trava-a-thread.test.js',
  // O "trem" das builds 78-81 (scroll morto, chave cortada, toque sem feedback):
  // era LAYOUT THRASHING no ajuste de nome — escrever fontSize e ler scrollWidth
  // por elemento, num laço de até 200 passos, a cada render e durante o scroll.
  // Trava o lote em fases + busca binária (mesmo resultado visual, 75% menos).
  'tests/ajuste-de-nome-nao-trava-a-thread.test.js',
  // Sentry WEB-83: card de Folga em renderMatchCard usava `t` ANTES do `const t`
  // (TDZ desde a 4.0.84, 30/jun) e derrubava a tela da fase de grupos. Roda o
  // bracket.js REAL no harness de render e trava também o padrão (nenhuma função
  // pode usar `t` antes do próprio `const t =`).
  'tests/card-de-folga-nao-derruba-a-tela.test.js',
  // 1.9.89 — o convite de rolagem (seta amarela) sobe COLADO no dedo e esmaece
  // no topo. A versão anterior trocava de âncora no meio do caminho e pulava;
  // o conserto não é transição, é a posição ser função contínua da rolagem.
  // Trava também a geometria da seta (haste = 62,5% da base — a 81% ela vira
  // CASINHA quando aponta pra cima) e as duas etapas do convite de perfil.
  'tests/convite-de-rolagem-sobe-sem-pular.test.js',
  // 1.9.90 — do relatório do APARELHO do dono (Sentry, release 1.9.89): a chave
  // parou de ser pintada em fatias (era o "entra e scrollando corta", 3ª volta do
  // mesmo sintoma), o brilho que ensina virou finito (o gravador pegou o
  // btnCtaShine vivo numa travada de 533ms) e o perfilador passou a NOMEAR o
  // observer que segurou a thread (o relatório vinha "Mu:?=852ms").
  'tests/tela-nunca-entregue-pela-metade.test.js',
  // 1.9.103 — a tela branca ao desbloquear (guarda de update que faltava no
  // pageshow/focus) e o realce do toque que sobrevive a thread presa
  // (-webkit-tap-highlight-color, desenhado pelo SISTEMA). Mais a borda no
  // quadro que a seta aponta.
  'tests/resume-nao-recarrega-e-toque-tem-realce.test.js',
  // 1.9.112 — a cor do placar na chave, ditada pelo dono: tarja responde "ja esta
  // confirmado?" (verde/ambar/cinza) e o NUMERO responde "quem ganhou?"
  // (verde/vermelho). Antes as duas perguntas dividiam a mesma cor.
  'tests/cor-do-placar-na-chave.test.js',
  // A 1.9.112 travou a REGRA de cor (tarja=estado, número=quem ganhou) e mesmo assim a
  // dashboard mostrou 1 × 6 com os DOIS números vermelhos: faltava travar o degrau de
  // baixo — DESCOBRIR quem venceu quando o `winner` gravado (string de nomes) não bate
  // mais com o slot. Varre os torneios REAIS: 3 jogos da Confra estão assim.
  'tests/quem-venceu-e-uma-regra-so.test.js',
  // O motor ao vivo IGNORAVA a escolha 5-5/6-6 (gatilho `g-1` cravado) e "prorrogar" nem
  // existia no formato do torneio — o motor lia `scoring.tieRule` e ninguém escrevia.
  'tests/empate-do-set-e-do-organizador.test.js',
  // 2.1: o gatilho do empate vive na seção de FORMATO, por fase, e em lugar nenhum mais.
  'tests/empate-do-set-vive-no-formato.test.js',
  // 2.1: o contato registrado pelo organizador aceita qualquer país (DDI + máscara).
  'tests/contato-do-organizador-tem-ddi.test.js',
  // 2.1: o aviso de conta duplicada nomeia o canal e o "Sim" JÁ dispara a prova.
  'tests/duplicata-nomeia-o-canal.test.js',
  // O dono apareceu nos DOIS times da mesma partida casual. A sala guarda quem está nela em
  // TRÊS listas que dessincronizam, e o guarda de "já entrei?" olhava só uma.
  'tests/casual-mesma-pessoa-um-slot-so.test.js',
  // 1.9.113 — o icone do jogador saia como circulo mudo e igual pra todos: ele
  // nasce do NOME, e quem tem uid com perfil nao resolvido nasce sem nome (1.7.79).
  // A hidratacao trocava o texto e deixava o icone pra tras.
  'tests/icone-do-jogador-hidrata-com-o-nome.test.js',
  // O MESMO defeito, terceira encarnação: os cards de ORGANIZAÇÃO desenhavam nome e foto
  // congelados no render. Com o perfil ainda não resolvido o nome nasce vazio, o avatar
  // semeado por nome vazio vira o MESMO círculo mudo pra todo mundo, e nada cura depois.
  // A cura já existia (_hydrateUidNames); faltava cada tela LEMBRAR de emitir o marcador.
  // Agora há um PONTO ÚNICO (_personAvatarHtml/_personNameHtml) e este teste cobra que os
  // cards de pessoa passem por ele — pra não existir um quarto lugar.
  'tests/pessoa-na-tela-hidrata.test.js',
  // E o INVENTÁRIO fechado: todo ponto que semeia avatar pelo NOME está declarado, com o
  // que é. Ponto novo fora da lista reprova — quem acrescentar decide na hora se aquilo é
  // gente com uid (ponto único) ou não é (declara o motivo). É o que impede o quarto lugar.
  // A dívida PENDENTE sai impressa a cada rodada, em vez de viver na cabeça de alguém.
  'tests/avatar-por-nome-e-inventario-fechado.test.js',
  // Botões da MESMA LINHA: mesma altura (a do mais alto), mesmo topo, mesma base. O
  // "Aplicar W.O." saía deslocado no cabeçalho do card porque um `class=` DUPLICADO
  // derrubava a classe que trazia o `display:flex` — o parser fica com o primeiro
  // `class` e joga o segundo fora, calado. Em bloco os .btn se alinham pela BASE do
  // texto e o de 2 linhas sobe. Mede com o CSS real num Chromium.
  'tests/botoes-da-linha-tem-a-mesma-altura.test.js',
  // Botão vertical sticky (Fase anterior / Mostrar ocultas) não pode grudar em px cravado:
  // o que fica colado no topo é topbar+dropdown+back-header+barra de busca, e com 112px
  // fixo metade do botão ficava POR BAIXO da barra — o dono lia só "Fase a". A fonte única
  // é --scroll-anchor (store.js/_reflowChrome), a mesma que os cards já usam.
  'tests/botao-vertical-nao-some-atras-da-barra.test.js',
  // Melhor de 3 / melhor de 5 no card: uma COLUNA por set, com o rótulo (Set 1 · Set 2 ·
  // Super Tie-Break (10)) em cima do box. O Confirmar fecha O SET enquanto ninguém chega a
  // setsToWin — e set parcial NÃO grava vencedor, senão a classificação passa a contar um
  // jogo em andamento. Mede a régua, a decisão, o que o parcial grava e a TELA.
  'tests/placar-por-sets-no-card.test.js',
  // O placar lançado na chave NÃO move a chave de lugar (a rolagem horizontal sobrevive ao
  // re-render, nos DOIS desenhos de chave), o Simular fase (dev) joga o formato da FASE
  // (melhor de 3/5 e super tie-break, não um set solto), a aprovação roda igual à de 1 set —
  // com os rótulos das colunas no placar pendente — e o tie-break/STB avisa "dif 2 pts"
  // ANTES, cobrando a margem que anunciou.
  'tests/placar-na-chave-nao-pula.test.js',
  // O card de jogo é canônico em TODO lugar (chave, Novidades, Seus Últimos Resultados):
  // os dois desenhos legítimos leem a MESMA régua de números (_cardNomeGeo) e a mesma caixa
  // invisível do nome. Trava a violação mais grave que existia: a dashboard CORTAVA o nome
  // com reticências, com foto e fonte cravadas no próprio arquivo.
  'tests/card-de-jogo-e-canonico-em-todo-lugar.test.js',


  // Presença é sinal POSITIVO e PERECÍVEL: caduca em 24h, em todo o programa. A validade
  // mora na LEITURA (_idMapGet + _presencaViva), nunca numa varredura que apaga — varredura
  // que não rodou mente. `absent` NÃO caduca: é W.O., não presença.
  'tests/presenca-caduca-em-24h.test.js',
  // O uid não some do slot. O nome VELHO vive no elenco do grupo ao lado do uid certo, e
  // _buildNameToUid lia só os inscritos (que o save stripa) — daí linha 'name:', uid null no
  // slot e nome congelado no card pra sempre. Cura nos dois lados, na leitura.
  'tests/uid-do-slot-nao-some.test.js',
  // O DEGRAU DE BAIXO do mesmo problema: e quando não há uid nenhum a recuperar? Medido
  // nos 28 torneios reais — 267 slots de gente, 39 (14,6%) sem uid completo. A leitura
  // intuitiva ("doc legado, de antes de o sorteio gravar uid") está ERRADA: os 86 nomes
  // desses slots são gente SEM CONTA (inscrição com `uid: ""` gravado), 0 recuperáveis —
  // backfill nome→uid escreveria zero, e casar por nome é o que o cânone proíbe. Então o
  // que se guarda NÃO é a contagem (sobe legitimamente com todo torneio de jogador
  // fictício) e sim o invariante: slot sem uid ⇒ todo nome nele é de alguém sem conta.
  // Alguém COM conta ali = nome congelado que nunca mais atualiza.
  'tests/slot-sem-uid-e-gente-sem-conta.test.js',
  // A MESMA armadilha do `class=` duplicado, um card acima: o span do NOME no card da
  // chave nascia `class="sp-name-fit" … class="sp-mc-nm"` e o parser jogava o segundo
  // fora — `.sp-mc-nm` (peso 600, nowrap, inline-flex) NUNCA valeu ali. Juntar as duas
  // classes mexe no MESMO span que o auto-fit mede, então a cura é MEDIDA: Chromium com
  // o CSS real e o `_fitNames` real do store.js, claro e escuro, 390/768/1280 — e a
  // fronteira do corte não pode se mover.
  'tests/nome-do-card-da-chave-nao-perde-a-classe.test.js',
  // O `functions-autodraw/vendor/` é cópia de js/views/* que só o PREDEPLOY re-sincroniza —
  // e 52 suítes carregam o servidor por draw-core.js, que dá require() na CÓPIA. Vendor
  // velho = suíte verde sobre código que o servidor não tem: mexi em identity-core/
  // bracket-logic/bracket-ui, `npm test` deu 435/435, e o deploy (que sincroniza o vendor)
  // quebrou 12 suítes NA HORA. Medido no histórico: 57% dos commits tinham vendor velho.
  // Quem barra é `scripts/check-vendor-fresh.js`, ANTES desta lista (package.json). Este
  // teste guarda as duas metades: a trava está ligada e o vendor daqui está em dia, e ela
  // detecta de verdade (sandbox com o script REAL, não réplica).
  'tests/vendor-do-autodraw-nao-fica-velho.test.js',
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
