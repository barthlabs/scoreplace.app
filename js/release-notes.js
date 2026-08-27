// scoreplace.app — Release notes (lazy-loaded)
// Loaded on demand when the user opens "Notas de versões" in help modal.
//
// Convenção de versão (a partir de 30 Abr 2026): MAJOR.MINOR.PATCH-channel.
//
// ⚠️ NOTAS RESUMIDAS POR VERSÃO NATIVA (a partir de jul/2026, pedido do dono):
// as notas mostradas ao usuário são CONSOLIDADAS no nível da versão nativa/loja
// (MINOR — 1.0, 1.1, 1.2, 1.3…) — UMA nota-resumo por minor, com os destaques
// agrupados por tema. NÃO ter mais nota detalhada por patch (1.x.y). Cada patch
// bumpado no dia continua no changelog técnico (git/commits); aqui o usuário vê o
// resumo da versão que foi/vai pra loja. Ao promover um novo minor, dobrar os
// destaques dos patches daquele ciclo num único bloco.
//
// Histórico completo da fase alpha → beta exportado pra
// docs/scoreplace_relatorio_alpha_to_beta.docx (registro local do dono).
// Histórico completo da fase beta → 1.0 (385 notas, 29 Abr → 13 Jul 2026)
// exportado pra docs/scoreplace_relatorio_beta_to_1.0.docx — a partir da v1.0
// o app mostra só as notas de 1.0 em diante.

window._RELEASE_NOTES_HTML = (function () {
  var html =
    // ⚠️ 2.0.32 NÃO ganhou item, e é DECISÃO. Ela é 100% ferramenta: uma trava de teste
    // (scripts/check-vendor-fresh.js) que barra o `npm test` quando o
    // `functions-autodraw/vendor/` — a cópia de js/views/* que o autoDraw roda no servidor
    // — está velho, mais o pre-commit que sincroniza essa cópia sozinho. Motivo: 52 suítes
    // carregam o servidor pela CÓPIA, então vendor velho deixava o gate verde sobre código
    // que o servidor nem tinha (medido: 57% dos commits estavam assim). Zero mudança de
    // tela, zero comportamento novo pra quem joga — o diff não toca css/, nem view alguma.
    // A trava (check-release-notes) pega OMISSÃO e não sabe julgar isso; a justificativa
    // fica aqui, pro próximo leitor não achar que faltou.
    // ⚠️ 1.9.66 NÃO ganhou item, e é DECISÃO. Ela é 100% servidor: a rotina diária que
    // cobra o celular no perfil de quem está inscrito na Confra (CF nudgeMissingPhones,
    // nasce em ensaio). Zero mudança de tela — nada a anunciar pra quem joga. A trava
    // (check-release-notes) pega OMISSÃO e não sabe julgar isso; a justificativa fica aqui.
    // ⚠️ 1.8.27 NÃO ganhou item nesta nota, e isso é DECISÃO, não esquecimento. Conferido
    // no diff: em js/, css/ e index.html ela mexeu SÓ em cache-buster, no
    // `SCOREPLACE_VERSION` e no snapshot do prerender — zero comportamento novo (o commit
    // foi varredura da safe-area + leitura do Sentry, ou seja verificação). O que era
    // visível daquele ciclo já está descrito nos itens do cabeçalho e da tela de carregando,
    // escritos em 1.8.25/1.8.26. A trava (check-release-notes) pega OMISSÃO e não sabe
    // julgar isso — então a justificativa fica aqui, pro próximo leitor não achar que
    // faltou.
    // ⚠️ 1.8.53 e 1.8.54 NÃO ganharam item, e também é DECISÃO. A 1.8.53 acrescentou uma
    // bifurcação ao criar Sandbox (cópia do estado atual × zerada) e a 1.8.54 a REMOVEU
    // inteira, no mesmo dia, a pedido do dono — "vc apontou bem e eu errei… a bifurcação é
    // desnecessária por redundância inútil". Saldo líquido pro usuário: ZERO (conferido no
    // diff: tournaments-organizer.js voltou ao estado anterior). Descrever as duas seria
    // anunciar uma escolha que não existe na tela. A trava (check-release-notes) pega
    // OMISSÃO e não sabe julgar isso — a justificativa fica aqui.
    // ⚠️ 1.8.57 NÃO ganhou item, e é DECISÃO. Ela unificou a LEITURA de "onde estão os
    // jogos desta fase" — phaseComplete e pendingMatches varriam os 3 storages cada uma
    // (o comentário do código chamava a segunda de "espelho" da primeira) e passaram a ler
    // por phaseGames. Saldo pro usuário: ZERO, e provado — os três goldens (motor da R1,
    // eliminatória gerada e construtor) saem IDÊNTICOS, que é o gate do deploy. Anunciar
    // "unificamos uma varredura interna" seria ruído numa nota que o usuário lê pra saber
    // o que mudou pra ele. A trava pega OMISSÃO e não sabe julgar isso — o motivo fica aqui.
    // ── v1.9 ─────────────────────────────────────────────────────────────────
    // ✓ CONFERIDA ATE A 1.9.111 (21/ago/2026), antes de cortar a build 111 pra
    //   loja. Itens de 106→111 checados um a um contra os commits: formato de
    //   partida POR FASE, abrir o torneio caindo no proprio grupo, confirmar o
    //   placar na tela inicial, a foto do local no tema claro e a cor do relogio.
    //   O unico commit depois da ultima escrita da nota era `17ba2c42 — snapshot
    //   do prerender`, que e mecanico (index.html + version.txt regerados pelo
    //   deploy) e nao carrega funcionalidade. A trava pegou ESSE commit, nao uma
    //   omissao — e a conferencia fica registrada aqui em vez de virar um "toque"
    //   vazio no arquivo so pra passar.
    // ⚠️ 2.0.130 NÃO ganha item, e é DECISÃO. Ela zera as 48 janelas de tempo fixas dos
    // testes (fixtures), ou seja mexe SÓ em tests/ — zero mudança de tela, zero
    // comportamento novo para quem joga. A trava (check-release-notes) pega OMISSÃO e não
    // sabe julgar isso; a justificativa fica aqui, para o próximo leitor não achar que faltou.
    // ── v2.1 ─────────────────────────────────────────────────────────────────
    // Promove o ciclo 2.0.5 → 2.0.130 (125 patches) ao minor unificado que vai às lojas.
    // O motivo desta ida NÃO é polimento: entre a 2.0.4 (publicada na App Store em 21/ago)
    // e hoje, os dados do torneio SAÍRAM do documento único (inscritos, jogos, histórico e
    // classificação viraram registros próprios). O app da loja não conhece esse desenho —
    // quem está com a 2.0.4 no iPhone lê um torneio que o banco não guarda mais desse jeito.
    // Mesma lição da 1.7.35: quando o formato do dado muda, a ida à loja É o conserto.
    // Os itens abaixo são consolidados por tema, como manda a convenção do arquivo.
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.08);">' +
      '<div style="font-weight:800; color:var(--sp-c-fde68a,#fde68a); font-size:1rem; margin-bottom:8px;">🎾 v2.1 — O aplicativo volta a andar junto com o site, e o celular ficou muito mais rápido <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(Agosto, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>📲 O aplicativo estava para trás — e agora alcançou o site:</b> os torneios passaram a guardar inscritos, jogos e histórico separadamente, e a versão anterior do aplicativo ainda esperava tudo junto. Resultado: torneio que abria vazio ou pela metade no iPhone. Esta versão entende o desenho novo. <b>Se você usa o aplicativo, atualize.</b></li>' +
        '<li><b>⚡ A lentidão do celular tinha causa, e ela foi medida:</b> a tela inicial fazia 8.959 buscas de nome para desenhar uma vez; agora faz 491. O recálculo de cor caiu de 1.391ms para 20ms. Telas que não estão abertas deixaram de ser construídas. Rolar a lista, abrir a chave e voltar ficaram visivelmente mais leves.</li>' +
        '<li><b>📂 Torneio grande parou de travar:</b> a tela inicial passou a ler um resumo do torneio em vez do torneio inteiro, e a chave nasce com o seu grupo primeiro. Torneios com dezenas de grupos abrem sem a espera que existia antes.</li>' +
        '<li><b>🔄 O aplicativo podia ficar preso numa versão antiga:</b> havia um defeito que segurava o conteúdo guardado no aparelho e impedia a atualização de chegar. Corrigido — e com uma trava para não acontecer de novo.</li>' +
        '<li><b>🎾 Lançar placar sem sinal não perde mais o resultado:</b> o placar entra numa fila e é aplicado sozinho assim que a conexão volta.</li>' +
        '<li><b>⚖️ Classificação mais firme:</b> grupo que terminou tem a classificação congelada e para de ir e voltar; quem saiu por W.O. passa a mostrar onde joga agora; e o 3º lugar voltou ao pódio.</li>' +
        '<li><b>📅 Combinar o dia e a hora do jogo ficou possível de verdade:</b> o botão <b>Propor datas</b> agora aparece no seu grupo (para quem joga) e em <b>todos os grupos</b> para quem organiza — que pode marcar a data direto pelos participantes, inclusive antes de a rodada abrir. E a data já marcada aparece para <b>qualquer pessoa</b>, mesmo quem não joga aquele grupo: dá para saber a que horas é o jogo e ir assistir.</li>' +
        '<li><b>🙂 Os cards de jogo ficaram alinhados:</b> o rótulo "(você)" saiu — a cor do seu nome já diz quem é você, e o rótulo fazia o seu nome encolher pra caber na caixa, desalinhando os cards.</li>' +
        '<li><b>🔎 O Explorar virou uma tela de verdade:</b> agora ele abre a lista de <b>todos os torneios da plataforma</b> — não só os que já apareciam pra você — com nome, modalidade, local, data, formato e nº de inscritos, mais a barra de ordenar, filtrar e buscar. A lista já vem na ordem certa: primeiro os que estão <b>com inscrições abertas</b>, do que fecha mais cedo pro mais tarde; depois os de inscrições encerradas; por último os torneios já finalizados. Torneios privados não são listados; a tela só indica quantos ficaram de fora.</li>' +
        '<li><b>🧹 Menos repetição na tela do torneio:</b> o quadro "Fim da rodada / Rodada em andamento" saiu da tela inicial e do detalhe — as barras de progresso logo abaixo da previsão do tempo já contam rodada, jogos, % e os horários. Sobra espaço, e a informação fica num lugar só.</li>' +
        '<li><b>🕐 Os grupos aparecem na ordem em que vão jogar:</b> primeiro os próximos jogos, do mais cedo pro mais tarde; depois os grupos que já terminaram; por último os que ainda não têm horário. O <b>seu grupo</b> continua no topo. Num torneio de 35 grupos, dá pra ver a grade do dia sem procurar.</li>' +
        '<li><b>🔒 Privacidade:</b> os e-mails dos participantes saíram do documento de leitura pública do torneio.</li>' +
      '</ul>' +
    '</div>' +
    // ── v2.0 ─────────────────────────────────────────────────────────────────
    // ⚠️ Os commits `iOS 2.0 (build 200)` e `iOS 2.0.1 (build 201)` NÃO ganham item, e é
    // DECISÃO — a mesma dos dois. Eles são só o número:
    // MARKETING_VERSION 1.9.114→2.0 e CURRENT_PROJECT_VERSION 114→200 no pbxproj, mais o
    // www/ regerado com o MESMO código que já está no ar na web. Zero mudança de tela — o
    // que essa build entrega ao usuário é exatamente o que o bloco abaixo já descreve. A
    // trava (check-release-notes) pega OMISSÃO e não sabe julgar isso; a justificativa
    // fica aqui, e o toque na nota é este comentário.
    // ⚠️ Histórico das builds desta leva, porque duas delas NÃO servem pra aprovar:
    //   200 (2.0)   — subiu ANTES do vencedor por uid, do texto do tie-break e do ✕ na linha.
    //   201 (2.0.1) — tem os três acima, mas NÃO tem prorrogar × tie-break nem o 7-7.
    //   202 (2.0.2) — abortada antes de subir: faltava a classificação por uid.
    //   203 (2.0.3) — placar + classificação por uid; versão 2.0.3 criada e anexada na Apple.
    //   204 (2.0.4) — + a casual que parou de prender e a cor dos times. É esta que vale.
    // Ordem do dono (21/ago/2026): "vamos alinhar web/apple versao 2.0". O bloco é CURTO de
    // propósito: o ciclo 2.0 começa agora, e repetir aqui os destaques da v1.9 (logo abaixo,
    // e que o usuário do site já leu) seria anunciar duas vezes a mesma entrega.
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.08);">' +
      '<div style="font-weight:800; color:var(--sp-c-fde68a,#fde68a); font-size:1rem; margin-bottom:8px;">\uD83C\uDFBE v2.0 \u2014 Cada fase joga no seu formato, e o aplicativo passa a andar junto com o site <span style=\"color:var(--text-muted); font-weight:400; font-size:0.78rem;\">(Agosto, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        // ── ciclo 2.0.129 ────────────────────────
        // ⛔ ABRIR O TORNEIO ACEITAVA OBJETO INCOMPLETO. `_ensureTournamentLoaded` já tratava
        // DUAS formas de estar incompleto — resumo e cache — e ignorava a terceira: o objeto
        // que veio do ouvinte do DOCUMENTO, que num torneio dividido chega com elenco e jogos
        // VAZIOS. Não é resumo nem é do cache, então passava como "já carregado" e a tela do
        // DETALHE renderizava em cima dele. Foi assim que o dono, ORGANIZADOR do Confra, leu
        // "você não está inscrito" no celular. `loadTournamentById` já busca as subcoleções —
        // bastava deixar de atalhar até ele.
        // ⚠️ E eu tinha consertado só UMA das duas portas: a segunda (a corrida de duas
        // buscas) fazia a mesma pergunta e ficou de fora. Quem pegou foi a suíte.
        // ⭐ E ENTROU UM JEITO DE MEDIR NO APARELHO: `?diag=1` imprime, na tela, o que o app
        // tem em memória (partes que moram fora, quantos inscritos, o que falta, falhas de
        // busca). No PWA do iOS não há console — sem isso, a alternativa é publicar palpite
        // atrás de palpite, que foi exatamente o que aconteceu por três versões.
        // Não cobra pedágio: só roda quando a URL pede, e não mede nada — só imprime.
        // ── ciclo 2.0.128 ────────────────────────
        // ⭐⭐ A CAUSA DE VERDADE do "0 INSCRITOS" no celular do dono — e eu tinha publicado
        // DUAS versões atrás da causa errada antes de achar esta.
        // ⛔ NÃO era o dado (resumo com 148, documento coerente) e NÃO era a versão (o
        // problema continuou na 2.0.127, recém-publicada).
        // A conta de "o que falta buscar" só perguntava por `matches` — e depois `grupos`.
        // `participants` NUNCA entrava. No celular o cache local JÁ TINHA os jogos: o enxerto
        // os encontrava, a conta concluía "não falta nada", `_faltamPesados` era APAGADO e a
        // busca do elenco NUNCA disparava. Elenco vazio pra sempre, e o organizador lendo
        // "você não está inscrito". No desktop o cache estava frio, a busca rodou uma vez e
        // encheu. Era cache quente satisfazendo METADE da pergunta.
        // ⭐ Agora a conta percorre `_semPesados` — parte nova entra sem ninguém lembrar
        // dali. E ela diz O QUE falta (`_faltaOQue`), pra o próximo defeito não ser
        // adivinhação. Os escritores gravam `_nPartes` (quantos de CADA parte moram fora), e
        // `memberUids` serve de testemunha pra curar os documentos que já existem.
        // ⚠️ E os testes me pegaram no meio: eu tinha feito "sem prova, não acusa" pra TODAS
        // as partes, o que seria regressão nas estruturais — documento dividido antes de
        // existir `_nJogos` nunca mais buscaria os jogos e o torneio abriria SEM CHAVE.
        // Ninguém divide um torneio vazio: pra `matches`/`grupos`, estar no marcador e não
        // ter em memória JÁ é prova.
        // ── ciclo 2.0.127 ────────────────────────
        // 🔒 A TRAVA, no lugar que dói: o DEPLOY. Ordem do dono: _"faz uma trava pra essa
        // merda nunca mais acontecer"_. A suíte já conferia o CACHE_NAME, mas suíte não
        // impede PUBLICAR. Agora `deploy-hosting.sh` aborta antes de subir um byte, no mesmo
        // ponto em que o cache-buster já era barrado, e diz o que fazer.
        // PROVADO em isolamento: com o cache divergente sai 1 e explica; batendo, sai 0.
        // ── ciclo 2.0.126 ────────────────────────
        // 🩹 O CELULAR ESTAVA PRESO 33 VERSÕES ATRÁS. Relato do dono, com print: no PWA do
        // Safari o Confra mostrava "0 INSCRITOS" e "você não está inscrito" — sendo ele o
        // ORGANIZADOR — enquanto no desktop estava tudo normal.
        // ⛔ NÃO ERA O DADO: o resumo tinha 148 inscritos e o documento estava coerente.
        // A CAUSA: `CACHE_NAME` do service worker estava em 'scoreplace-v2.0.92' com o app
        // na 2.0.125. `git log -S` devolvia UM commit — o que criou o arquivo. Nunca foi
        // bumpado, não havia script que bumpasse e não havia trava que conferisse, apesar de
        // o próprio sw.js comentar, como PREMISSA, que ele "muda a cada versão".
        // ⭐ E por que só no celular: todos os scripts têm `?v=` e trocam com a versão —
        // `/index.html` é o ÚNICO sem query. Ele casa EXATO no cache e vem do velho,
        // trazendo junto os `?v=` antigos de TODOS os outros. O desktop, numa aba comum,
        // revalida o index com o servidor e pega o novo. O PWA não.
        // ⇒ O aparelho rodava código antigo sobre o dado de HOJE: o elenco mudou de lugar
        // (subcoleção), e o código velho não sabia buscá-lo. Daí o zero.
        // Agora o nome do cache sai da VERSÃO, no mesmo passo que gera o version.txt — o que
        // roda em todo bump/deploy — e uma trava reprova a divergência.
        // ── ciclo 2.0.125 ────────────────────────
        // 🕸️ A REDE DO ENXERTO PASSA A DERIVAR DA LISTA. O ouvinte do DOCUMENTO entrega o
        // torneio com as partes divididas VAZIAS — é assim que elas ficam lá. Aceitar isso
        // por cima do objeto vivo apaga da tela o que já foi buscado.
        // ⛔ ISTO JÁ QUEBROU PRODUÇÃO na 2.0.109, com torneio AO VIVO. E a rede citava
        // `participants` e `matches` pelo NOME — pôr os GRUPOS pra fora quebraria de novo,
        // agora apagando a CHAVE inteira, porque não havia ramo pra eles.
        // ⭐ Agora deriva de `_semPesados`: parte nova nasce coberta. O teste prova isso com
        // `checkedIn`, que ainda nem saiu do documento.
        // ⛔ E FALTA É FALTA DE QUALQUER UMA: chave sem grupo é tão quebrada quanto sem jogo.
        // Os contadores `_nJogos`/`_nGrupos` são o que separa "não sorteou ainda" de "não
        // carregou" — os dois pintam vazio, e só um é honesto.
        // ── ciclo 2.0.124 ────────────────────────
        // 🗂️ O GRUPO VIRA DOCUMENTO. Arquitetura na palavra do dono: "cada torneio é um doc,
        // cada jogo é um doc pendurado no torneio e cada inscrito é outro doc". O grupo é da
        // mesma família — container de jogo — e era o MAIOR termo que ainda crescia com
        // gente: MEDIDO no Confra, 35 grupos = 22,2 KB, 153 B por inscrito (retrato
        // congelado 5,9 KB, uids 4,2, ids de jogo 3,6, nomes 2,3).
        // ⛔ E não dá pra derivar dos jogos: `classifCongelada` é a ordem PUBLICADA (que não
        // se reescreve), e `playersUids`/`woAbsent`/`rosterAt` não estão em jogo nenhum.
        // ⛔ A chave é RODADA + NOME, nunca a posição: grupo some do meio e todos os índices
        // depois dele andam — gravaria o retrato de A por cima do de B. O LUGAR viaja
        // separado, em `_loc`, porque o Firestore entrega por id e id aqui é hash.
        //
        // ⛔⛔ E O ERRO QUE EU IA REPETIR, pego antes de gravar qualquer coisa: `dividir`
        // extraía TUDO e quem grava tinha que lembrar de devolver o que o marcador não
        // pediu. O Confra está dividido só em matches/participants/opponentHistory — a
        // próxima gravação teria mandado `monarchGroups: []` pro documento e APAGADO os 35
        // grupos, sem erro e sem log. Essa devolução já esqueceu uma parte quatro vezes
        // aqui. ⭐ Agora `dividir` extrai SÓ O QUE SE PEDE: o que não foi pedido nunca sai,
        // então não há o que devolver — logo não há o que esquecer.
        // VERIFICADO contra os 39 torneios REAIS: ida e volta idêntica em 39/39, 35 grupos
        // todos com identidade de verdade (nenhum caiu na posição) e zero colisão de chave.
        // ── ciclo 2.0.123 ────────────────────────
        // 👂 O OUVINTE DAS PARTES QUE MORAM FORA. O `onSnapshot` do app é no DOCUMENTO —
        // campo que saiu pra subcoleção não chega por ele. O ouvinte existia só pros jogos,
        // com o nome 'matches' escrito à mão; agora deriva de `_semPesados`.
        // ⛔ MAS NÃO OUVE TUDO, e a razão é custo: abrir o torneio JÁ busca todas as partes,
        // e um ouvinte por parte pagaria essa leitura DE NOVO na primeira entrega (o
        // Firestore manda tudo como 'added'). No Confra seria reler 148 inscritos e o
        // histórico a cada abertura, sem que nada disso mude com a tela aberta. Ouve o que
        // muda ao vivo: os jogos (placar sendo lançado) e a presença (chamada na quadra).
        // ⛔ E parte VAZIA agora esvazia de verdade: `remontar` nunca apaga o que não recebeu
        // — proteção certa pra uma LEITURA, errada pra um OUVINTE. Sem isso, apagar a última
        // presença deixaria a marca na tela pra sempre.
        // ⚠️ E soltar TODAS as assinaturas ao sair: são várias agora (uma por parte), e
        // soltar só a primeira é o mesmo vazamento com cara de conserto.
        // Regras do banco: `checkedIn`, `woClaims` e `woLog` ganharam LEITURA. Escrita do
        // cliente segue negada — quem escreve é a porta da 2.0.122, que confere permissão.
        // ── ciclo 2.0.122 ────────────────────────
        // 🚪 A PORTA ÚNICA DE ESCRITA FINA NO TORNEIO. Ordem do dono: _"tudo em CF apenas
        // disparado pelo cliente"_. `exports.aplicarNoTorneio` + a tabela de permissão em
        // `functions/partes-permissao.js` (allowlist: campo fora da lista é NEGADO).
        // ⛔ POR QUE PRECISA EXISTIR: o teto de 1 MB só cai movendo dado pra fora do
        // documento, e o cliente NÃO tem permissão de escrever subcoleção — nunca teve, por
        // decisão da 1.7.98. Enquanto um campo for escrito pelo cliente ele não pode sair.
        // ⛔ E POR QUE ELA NÃO ABRE TRANSAÇÃO: marcar UMA presença já reescreveu o torneio
        // inteiro dentro de uma transação, e sob contenção elas se atropelam — medido na
        // 1.7.x: update por CAMPO 25/25, transação do doc inteiro com falhas; a marca
        // aparecia na tela e o snapshot seguinte a removia. A porta mantém a escrita fina:
        // campo ainda no doc vai por FieldPath; campo já fora vira UM documento.
        // ⭐ A PORTA ENTRA ANTES DO CAMPO SAIR — o inverso do que quebrou produção na
        // 2.0.109, quando construí a rede de re-render e esqueci a busca.
        // ⚠️ Um defeito meu que o próprio teste pegou: a tabela exigia FORMATO de uid na
        // chave, e isso reprovava quem NÃO TEM CONTA — que é chaveado pelo nome digitado
        // pelo organizador, com espaço e acento. Virou checagem de id de documento.
        // Autoriza TODAS as operações antes de abrir o lote: autorizar dentro do laço
        // deixaria metade aplicada quando a outra metade é negada.
        // ── ciclo 2.0.121 ────────────────────────
        // 🧱 BASE, sem efeito visível: a lista do que PODE morar fora do documento passou a
        // incluir `checkedIn`, `woClaims`, `woLog` e `categoryNotifications` — os campos que
        // ainda crescem com o número de pessoas (medido no Confra: 4,1 + 5,6 + 4,3 + 2,9 KB).
        // ⚠️ Estar na lista NÃO tira nada de lugar nenhum: quem decide é o marcador de cada
        // torneio, e nenhum torneio pediu esses quatro. A suíte `lista-de-pesados-nao-vaza`
        // existe só pra provar isso — o passo entre "extraiu" e "devolveu ao documento" é
        // exatamente onde dado some sem erro e sem log.
        // ⭐ E a chave de cada parte virou REGRA (`chaveDaParte`), não uma cadeia de `if`.
        // Cadeia de `if` não falha quando um campo novo entra: cai no `else` e o registro sai
        // chaveado por POSIÇÃO — o mesmo estrago que quase apagou 188 dos 218 eventos do
        // Confra. Agora todo campo tem resposta explícita.
        // Provado contra os 39 torneios REAIS: `remontar(dividir(t)) === t` em 39 de 39.
        //
        // ⛔ POR QUE OS QUATRO AINDA NÃO SAÍRAM: todos são escritos PELO CLIENTE, e o cliente
        // não tem permissão de escrever subcoleção — nunca teve, por decisão. Tirar um campo
        // do documento antes de existir porta no servidor repetiria, quatro vezes, o buraco
        // que a 2.0.120 acabou de fechar na inscrição. A ordem do dono para o próximo passo é
        // clara: "tudo em CF apenas disparado pelo cliente".
        // ── ciclo 2.0.120 ────────────────────────
        // ⭐ NADA MAIS SOBRE A CLASSIFICAÇÃO DO TORNEIO FICA GUARDADO — ela é DERIVADA.
        // MEDIDO: `standings` estava gravado em 2 dos 39 torneios, 120 linhas ao todo,
        // TODAS zeradas e NENHUMA com uid. No Confra eram 110 linhas, 12,5 KB, 16% do
        // documento, dizendo "0 jogo disputado" num torneio com 115 jogos. O cálculo sobre
        // exatamente o mesmo dado dá 103 linhas, 95 com jogo e 103 com uid.
        // COMO NASCE: `_computeStandings` lê os jogos de `t.rounds[].matches`; num torneio
        // dividido eles moram numa subcoleção e enquanto não chegam o array está vazio —
        // calcular ali devolve uma tabela zerada COM CARA DE RESPOSTA. Sete sítios faziam
        // `t.standings = _computeStandings(t)`; bastava um rodar cedo demais.
        // Agora há UMA porta (`_standingsDoTorneio`) que devolve `null` — "ainda não sei" —
        // em vez de zero, e o campo não viaja mais pro banco. Doc do Confra: 78,9 → 66,4 KB.
        //
        // ⛔⛔ E O BURACO SÉRIO QUE ISSO DESTAPOU, este sim capaz de perder gente:
        // `functions/index.js` não tinha UMA menção à divisão (`grep -c` = 0). O
        // `enrollParticipant` mora lá e fazia `computeEnroll(snap.data(), …)`. Num torneio
        // dividido `participants` no documento é `[]` — o elenco está na subcoleção. Então
        // ① lotação e duplicata eram conferidas contra lista VAZIA (deixaria entrar quem já
        // estava dentro e ignoraria o limite de vagas) e ② o novo inscrito era gravado num
        // campo que a LEITURA sobrescreve com a subcoleção: entrava e sumia, sem erro.
        // Valia para SEIS portas: inscrever, desinscrever, formar dupla, desfazer dupla,
        // responder convite de co-organizador e propagar mudança de nome. A sexta eu tinha
        // esquecido — quem achou foi a varredura que o próprio teste faz no arquivo, e ela
        // fica lá cobrando a próxima.
        // ⭐ NINGUÉM FOI PERDIDO, e é medição que autoriza a frase: 148 uids no doc, 148
        // docs em `inscritos`, `participants: []` — ninguém se inscreveu entre a divisão e
        // o conserto.
        // ⛔ E o gravador do servidor só escrevia a subcoleção `matches`: qualquer outra
        // parte dividida era esvaziada do documento e nunca escrita. Agora deriva da lista.
        // ── ciclo 2.0.119 ────────────────────────
        // ⭐ A CLASSIFICAÇÃO DE UM GRUPO FECHADO PAROU DE IR E VOLTAR.
        // Relato do dono: "quando jogamos eu estava em 3º e a Livia em 4º. depois de
        // arrumarmos algumas coisas essas posições se inverteram. agora voltou a ser como
        // foi logo quando jogamos". E a consequência, na palavra dele: "não muda quem
        // avança. muda duplas e quem segue na competição por qual caminho".
        // Eram DUAS falhas, e nenhuma delas no critério de desempate:
        // ① A ENTRADA não era canônica. `Object.values(stats)` devolve na ordem em que as
        //   chaves entraram no objeto, e `stats` é remontado de fontes diferentes conforme a
        //   tela. `Array.prototype.sort` é ESTÁVEL — então num empate que atravessa todos os
        //   critérios quem decide é a ordem de chegada. Agora a entrada é ordenada por uid
        //   antes de comparar. MEDIDO: as 24 permutações da entrada dão UMA saída só.
        //   ⛔ A tentação era desempatar dentro do comparador — e teria sido errado: o
        //   `Math.random` já saiu dali um dia e o arquivo carrega desde então a invariante
        //   "sem o mapa de ordem o critério é neutro, nunca volta a sortear na hora".
        // ② O CONGELAMENTO estava CEGO. Grupo que fecha tem a ordem gravada em
        //   `classifCongelada`, mas o congelador procurava os jogos em `g.matches` /
        //   `g.rounds[].matches` — e no Confra os 115 jogos moram em `t.rounds[0].matches`,
        //   apontando o grupo pelo campo `monarchGroup`. Achava zero e desistia no `return`,
        //   sem erro e sem log. MEDIDO no torneio real: 35 grupos, 24 fechados, 18 com
        //   retrato (todos gravados pelo OUTRO caminho, o avanço de fase) e 6 fechados SEM
        //   retrato, recalculados a cada tela. Depois do conserto: 18 → 24.
        //   ⭐ A correção não foi somar mais um lugar na lista à mão — essa lista já esqueceu
        //   uma parte quatro vezes neste projeto. A regra do índice do grupo estava copiada
        //   em 4 arquivos; virou UMA função (`_jogosDoGrupo`), e o congelador passou a
        //   enxergar o que a tela enxerga.
        // ✅ PROVA de que a régua já estava certa: nos 18 grupos que tinham retrato, a
        // ordem calculada hoje bate com a publicada em 18 de 18. A catraca não segura mais
        // diferença nenhuma — virou seguro, como o dono previu: "depois de corrigidos,
        // jogos jogados depois não devem mais precisar do congelamento".
        '<li><b>\uD83D\uDD12 A classifica\u00e7\u00e3o de um grupo que j\u00e1 fechou n\u00e3o muda mais:</b> em grupos onde duas pessoas empatavam em tudo, a ordem entre elas podia trocar de uma tela para outra \u2014 e voltar. Nada de errado com os crit\u00e9rios de desempate: o que variava era a ordem em que os jogadores chegavam para serem comparados. Agora essa ordem \u00e9 sempre a mesma, e a classifica\u00e7\u00e3o de todo grupo encerrado fica registrada no momento em que fecha. O que j\u00e1 foi publicado n\u00e3o se reescreve.</li>' +
        // ── ciclo 2.0.118 ──────────────────────────────────────────
        // ⭐ O % DA BARRA DE CARREGANDO PAROU DE SAIR CORTADO EM DOIS.
        // Relato do dono: "aparece 2 números % um em cima do outro cortado dentro da barra".
        // ⛔ A causa é ARITMÉTICA, não estética: a coluna do odômetro tem 20 células de
        // 20px = 400px, e a janela tem 20px. `align-items:center` põe o topo da coluna em
        // −(400−20)/2 = −190px — e 190 NÃO é múltiplo de 20. A janela cai bem no meio de
        // duas células. MEDIDO no navegador, na página publicada: metade do "47%" em cima e
        // metade do "52%" embaixo. Com `flex-start` o topo encosta em 0 e cada passo de
        // 20px cai exatamente numa célula (medido: "4% @0", uma só).
        // ⚠️ E o defeito era CONSTANTE, não intermitente — passava despercebido porque a
        // barra vive poucos segundos e texto cortado parece "animação".
        // ── ciclo 2.0.117 ──────────────────────────────────────────
        // ⭐ QUEM SAIU POR W.O. AGORA DIZ ONDE JOGA. Pedido do dono, com a Carol Moresco de
        // exemplo: ela entrou no Grupo A por um W.O. da Denise, tomou W.O., se reativou,
        // foi pra espera e caiu num grupo novo. "Numa busca você encontra o nome dela, mas
        // vê que ela foi para outro grupo."
        // ⭐ A linha dela CONTINUA no Grupo A — é o registro do que aconteceu ali, e sumir
        // com ela seria apagar história. O que muda é que a linha passa a dizer PRA ONDE.
        // ⚠️ Na cor dos 1º–4º, não na vermelha do nome: o vermelho conta o que aconteceu
        // AQUI, a indicação conta ONDE ela está — duas informações diferentes não saem na
        // mesma cor. E por uid, com o nome valendo só pra inscrito digitado pelo org.
        // Conferido no Confra real: Carol → R1 Grupo I2, e mais dois que formaram o mesmo
        // grupo novo; os 7 que não reapareceram ficam sem indicação.
        //
        // ⭐ E `opponentHistory` saiu do documento (94 B por inscrito, o maior do que
        // sobrava). ⚠️ Ele NÃO podia ser apagado e recalculado: medido no Confra, dos 215
        // pares guardados, 74 não aparecem mais nos jogos (substituição, W.O., quem saiu) e
        // o recálculo inventaria 66 que não existem. Ele carrega história que os jogos já
        // não contam — apagar quebraria o anti-repetição do sorteio.
        // ── ciclo 2.0.116 ──────────────────────────────────────────
        // ⭐ O "VER MENOS" AGORA FICA MESMO NA TELA A ROLAGEM INTEIRA.
        // Queixa do dono: "tem que rolar junto com a sessão durante toda a rolagem pra
        // ficar sempre visível senão não serve pra nada". Estava certo — e a causa NÃO era
        // o trilho: era o CARD em volta.
        // ⛔ MEDIDO no navegador, na página real: `.card` computa `overflow-x: hidden`, e
        // pela especificação um eixo diferente de `visible` transforma o elemento em
        // CONTAINER DE ROLAGEM no outro eixo. O sticky passava a se ancorar no CARD (altura
        // do próprio conteúdo) em vez da página — sem distância pra viajar, sumia junto.
        //   SEM overflow:visible → topo da pílula: 140 · −260 · −760 · −1260 · −1760  ✗
        //   COM overflow:visible → topo da pílula: 122 · 122 · 122 · 122 · 122        ✓
        // ⭐ Nas Novidades o trilho não mora num `.card` — por isso lá sempre funcionou, e
        // por isso copiar o CSS do trilho não bastava: o que decidia estava no ANCESTRAL.
        // ── ciclo 2.0.115 ──────────────────────────────────────────
        // ⛔ O "VER MAIS/VER MENOS" NUNCA TEVE CHANCE DE APARECER — e eu tinha dito duas
        // vezes que estava pronto. As funções dele estavam escritas DENTRO de outra função
        // (`_applyMyMatchesFilter`), que não roda no caminho normal. Medido no navegador,
        // na versão JÁ PUBLICADA: `_demaisJogosTrilho: undefined`.
        // ⚠️ É o MESMO erro que eu tinha acabado de consertar no dashboard uma hora antes
        // (a pílula presa dentro de `renderDashboard`) e repeti no arquivo do lado.
        // ⚠️ E as duas vezes o guard `typeof … === 'function'` — que existe pros harnesses —
        // ENGOLIU o defeito: a marcação chamava, recebia string vazia, e o botão sumia
        // CALADO. Guard que engole também engole o que você precisava ver.
        // ⇒ Função que a marcação chama tem que existir no CARREGAMENTO. E o teste novo
        // carrega os arquivos num sandbox e EXIGE que as cinco existam — provado que ele
        // pega: devolvendo as definições pra dentro da outra função, ele falha.
        // ⭐ Também: UM CAMINHO ÚNICO pra montar torneio do banco. Eram SEIS cópias da
        // mesma operação (leitor do app, leitor da CF, resumo, salto, volta, ensaio) — e
        // cópia não é caminho, é lugar pra esquecer: a mesma lista à mão esqueceu os
        // inscritos TRÊS vezes num dia. E os inscritos ganharam coleção PRÓPRIA, porque
        // `participants` já tinha outro dono.
        // ── ciclo 2.0.114 ──────────────────────────────────────────
        // ⭐ O "VER MAIS" APARECE COM A SEÇÃO FECHADA — eu tinha feito só metade.
        // O dono pediu "o mesmo ver mais/ver menos das Novidades" e eu entreguei só o
        // "ver menos" flutuante: FECHADA, a seção continuava com o `▸ Demais jogos da
        // rodada (N)` cru. E era o estado FECHADO que ele estava olhando.
        // ⭐ Agora os dois se revezam pelo `[open]` do próprio <details> — sem listener,
        // sem re-render, e sem um segundo lugar guardando "está aberto?" pra discordar do
        // primeiro. Cada estado tem UM controle visível, com texto fixo.
        // ⛔ A pílula do cabeçalho NÃO tem clique próprio: ela mora dentro do <summary>,
        // que já alterna — clique nos dois faria o toque disparar o dela E subir, dois
        // toggles, e o botão parecendo morto (a bronca que as Novidades levaram na 2.0.44).
        //
        // ⛔ E A COBRANÇA DE CELULAR DA CONFRA FOI PARADA (ordem do dono), campanha E
        // relatório. ⚠️ Desligar só o `enabled` NÃO bastava: ele apenas liga o modo ensaio
        // — a rotina seguiria rodando e o consolidado sairia igual, porque ele é enviado
        // fora dessa condição. Ou seja, pararia metade, e a metade que continuaria
        // chegando na caixa dele é justo a que ele nomeou. A chave nova sai ANTES de tudo.
        // ── ciclo 2.0.113 ──────────────────────────────────────────
        // ⭐ O 3º LUGAR VOLTOU AO PÓDIO — e quase voltou ERRADO.
        // Relato do dono no BT Corpus Christi: "no pódio não aparece o 3º lugar e deveria".
        // ⛔ O jogo de 3º mora num QUARTO lugar que eu não conhecia: `t.thirdPlaceMatch`,
        // campo de topo — as três casas de jogo que eu conhecia (rounds[].matches, matches,
        // groups[].matches) não o contêm, e ele não carrega `isThirdPlace` nem
        // `bracket:'thirdplace'`, então todo filtro passava batido.
        // ⛔⛔ E O MEU PRIMEIRO CONSERTO ESTAVA ERRADO: tirei o 3º da CLASSIFICAÇÃO, que —
        // cega pro mesmo jogo — punha em 3º a dupla que PERDEU POR W.O. Quem pegou foi o
        // dono: "errado. Ciça Mange perdeu por wo. Fabiana e Eduardo 3º".
        // ⇒ REGRA: resultado em quadra manda sobre critério calculado. SEMPRE. O jogo de 3º
        // entra também na classificação, pra tabela e pódio não se contradizerem na mesma
        // tela. Agora: 🥇 Max/Kelly · 🥈 Mari/Flavia · 🥉 Fabiana/Eduardo, e a Ciça em 4º.
        //
        // ⭐ E a pílula "ver mais/ver menos" foi IÇADA pra fora de `renderDashboard`: presa
        // lá dentro, ela só existia depois de a dashboard ter renderizado — quem abria um
        // TORNEIO direto ficava sem botão nenhum ("cadê o ver mais/ver menos?"). E o guard
        // que eu tinha posto pros testes ESCONDEU isso: sumia calado, sem erro.
        // ── ciclo 2.0.112 ──────────────────────────────────────────
        // ⭐ "VER MENOS" QUE ACOMPANHA A ROLAGEM em "Demais jogos da rodada" — o mesmo das
        // Novidades, reusando a pílula E as armadilhas já pagas lá (sticky de altura zero,
        // `--scroll-anchor` em vez de px, margem POSITIVA pra pílula não passar da base).
        // No print do dono são 102 jogos: pra fechar era preciso rolar tudo de volta.
        // E fechar VOLTA pro cabeçalho — senão resolver o "não precisa voltar lá de cima"
        // criaria um "e agora onde eu estou".
        //
        // ⭐ E o ENSAIO DA DIVISÃO (scripts/ensaio-divisao.js): o ciclo inteiro num torneio
        // de mentira, no banco de verdade — dividir, montar pelo caminho do app, acordar o
        // gatilho, voltar atrás. É o que NÃO existia hoje de manhã, e por isso o defeito só
        // apareceu com o dono abrindo o app no meio do Confra ao vivo.
        // ⛔ E ele pegou TRÊS defeitos que teste unitário nenhum pegaria:
        //   ① a subcoleção guardava documentos de chave ANTIGA junto com os novos —
        //      2 escritos, 4 lidos: o dobro do elenco chegaria na tela;
        //   ② o gatilho de espelho APAGAVA os inscritos (eu tinha travado só os jogos —
        //      mesmo estrago, campo diferente, no campo que eu acabara de mover);
        //   ③ a VOLTA restaurava só os jogos e devolvia o torneio sem o elenco — e ela é o
        //      caminho de EMERGÊNCIA, o pior lugar possível pra ter um esquecimento.
        // ⇒ As três travas passaram a ser derivadas do MARCADOR, nunca de lista escrita à
        // mão: lista à mão foi exatamente o que esqueceu `participants` das três vezes.
        // ── ciclo 2.0.111 ──────────────────────────────────────────
        // ⭐ ABRIR "DEMAIS JOGOS DA RODADA" PÁRA NO PRIMEIRO, não no último.
        // Relato do dono: "ao expandir os demais jogos da rodada está indo para o último.
        // o certo seria ficar no primeiro."
        // ⛔ E não havia script NENHUM ali — o pulo é a ANCORAGEM DE ROLAGEM do navegador:
        // ao abrir o <details> ele escolhe um elemento ABAIXO da expansão e o mantém parado
        // na tela, empurrando a vista pro FIM do conteúdo que acabou de entrar. Quanto mais
        // jogos, mais longe o pulo. "Não fizemos nada" não é defesa: o navegador faz sozinho.
        // ⭐ Ancora no CABEÇALHO da seção, não no primeiro card — senão a pessoa não sabe
        // em que seção pousou. Com a margem de `--scroll-anchor` e re-medindo o chrome
        // antes, senão o alvo pousa atrás da barra sticky.
        // ⚠️ Dois quadros de espera: no Rei/Rainha o conteúdo é MONTADO na hora da abertura
        // (lote adiado), e rolar antes de ele existir ancora na altura velha.
        // ⛔ Fechar não mexe na rolagem — a pessoa está olhando o que está acima.
        // + Uma função para os DOIS expansores (Liga e Rei/Rainha); o handler copiado no
        //   atributo viraria duas versões que divergem.
        // ── ciclo 2.0.110 ──────────────────────────────────────────
        // ⭐ A BUSCA QUE FALTAVA — a peça cuja ausência quebrou produção hoje de manhã.
        // O ouvinte ao vivo é síncrono e roda a cada eco de QUALQUER torneio; buscar lá
        // dentro seriam ~115 leituras por torneio por eco. Então ele MARCA e a busca
        // acontece fora do laço, UMA por torneio, repintando quando chega.
        // ⛔ Sem ela, no PRIMEIRO carregamento o torneio dividido entrava sem jogos e
        // ninguém ia buscar — a tela dizia que o torneio não tem jogo.
        // ⚠️ Uma de cada vez por torneio: torneio ao vivo ecoa o tempo todo e, sem trava,
        // cada eco durante a busca dispararia outra — dezenas de buscas do mesmo dado,
        // que é exatamente o custo que tirar os jogos do doc existia pra economizar.
        // ⭐ Escreve NO LUGAR (mesma referência) porque meia dúzia de telas guardam o
        // objeto; trocar a referência as deixaria com o de antes.
        // ⛔ E falha com BARULHO: falhar calado aqui é a tela mentindo de novo.
        //
        // ⚠️ A DIVISÃO SEGUE DESLIGADA. Isto é o pré-requisito (2) de (3). Faltam o
        // ouvinte da subcoleção do torneio ABERTO e a prova num torneio de verdade.
        // ⭐ E o teste novo percorre o CAMINHO (snapshot → ouvinte → store → busca), não a
        // função isolada — foi testar a função isolada que deixou o defeito passar. Provado
        // que ele pega: removendo a linha da busca, ele falha; recolocando, passa.
        // ── ciclo 2.0.108 ──────────────────────────────────────────
        // ⛔ "CABE 7,5× MAIS" AINDA É LIMITE. O dono cortou a conversa: _"não tem que ter
        // limite. o que cabe 7,5x mais? não deveria ter limite para a quantidade de
        // participantes"_ — e depois desenhou: _"se cada torneio é um doc, cada jogo é um
        // doc pendurado no torneio e cada inscrito é outro doc, não tem limite"_.
        // Ele está certo e eu tinha parado no meio: tirar os JOGOS empurrou o teto de 4,2×
        // pra 7,5×, mas o documento continuava crescendo com GENTE. Medido: 556 B por
        // inscrito ⇒ o Firestore RECUSA o torneio a partir de ~1.780 pessoas. Teto é teto.
        // ⇒ Os INSCRITOS saem do documento (256 B dos 556 — o maior custo por pessoa).
        //
        // ⚠️ MESMA ARMADILHA DO HISTÓRICO, e eu quase repeti: o espelho chaveava inscrito
        // por POSIÇÃO (`'p' + _idx`). Quando alguém sai do MEIO da lista, todos os índices
        // depois dele andam — e o diff reescreve o registro de A por cima do de B.
        // ⭐ A chave nova segue o cânone do dono: uid → uids da dupla → NOME, e o nome só
        // pra quem não tem uid — que são 75 das 240 entradas, as duplas digitadas pelo
        // organizador, que existem só pelo nome. A exceção dele é o que salva essas.
        // ⛔ E aqui o espelho PODE apagar: inscrito que sai da lista saiu de verdade —
        // ao contrário do histórico, sumir daqui é informação, não poda.
        // + A rede do ouvinte passou a enxertar INSCRITOS também: sem isso o elenco sumia
        //   de todas as telas, não só a chave.
        // + O salto aprendeu a ESTENDER torneio já dividido — montando do banco antes, ou
        //   a prova de remontagem passaria contra o pedaço que sobrou no documento.
        // ── ciclo 2.0.107 ──────────────────────────────────────────
        // ⛔ IDENTIDADE É UID — E-MAIL E NOME SAÍRAM DE TODA DECISÃO.
        // Cânone do dono: "nada por nome ou email, sempre por uid a menos que seja digitado
        // por organizador e nao tenha uid. organizador sempre por uid."
        // Isto é segurança, não estilo: e-mail é uma STRING que a pessoa apresenta. Quem
        // tivesse `organizerEmail` igual ganhava as ferramentas do ORGANIZADOR — e e-mail
        // muda, se repete, e quem perde o acesso a ele não perde a conta.
        // ⭐ MEDIDO ANTES DE TIRAR: 39 e-mails de admin na base, 39 cobertos por uid, 0
        // torneios sem `creatorUid`. Os caminhos por e-mail não salvavam ninguém.
        // ⚠️ As `firestore.rules` já eram uid puro desde jul/2026 — as CFs e o cliente é que
        // ficaram para trás. E nas CFs é PIOR: elas rodam com admin SDK e não passam por
        // regra nenhuma. Eu tinha até afirmado que a regra lia `adminEmails`; estava errado.
        // + `_isTournamentAdmin` nem RECEBE e-mail: a assinatura impede reintroduzir.
        // + 7 blocos soltos de "isOrg" nas CFs principais apontam pra UMA porta.
        // + Duas estatísticas contavam por nome/e-mail: `t.organizerUid` (que NÃO existe em
        //   torneio nenhum — 0 de 39) e vencedor por nome. Trocados por creatorUid/winnerUid.
        // ⭐ A EXCEÇÃO DO DONO FICA: inscrito digitado pelo organizador não tem uid, e é só
        // pelo nome que ele existe.
        // ── ciclo 2.0.106 ──────────────────────────────────────────
        // ⭐ TORNEIO NOVO NASCE NO FORMATO NOVO, e os antigos vão junto.
        // Depois do Confra, o caminho novo era exercitado por 1 torneio contra 38.
        // ⛔ Caminho que é EXCEÇÃO apodrece: a suíte e o uso real martelam o comum, e o
        // raro quebra em silêncio — e a exceção ser justo o torneio ao vivo com 148
        // pessoas é o pior arranjo possível. Consistência aqui não é estética: é o que faz
        // o defeito aparecer num torneio pequeno em vez de no grande.
        // ⭐ E nascer dividido é o caso MAIS seguro: torneio novo não tem jogo nenhum, não
        // há o que mover nem o que perder. Dos 38 antigos, 30 também não têm.
        //
        // ⚠️ E FECHEI UMA AMBIGUIDADE que viraria armadilha: "documento sem jogo" pode ser
        // "ainda não sorteou" (zero jogos MESMO) ou "dividido e a tela não buscou". Os dois
        // pintam vazio e só um é honesto. Agora o documento diz `_nJogos` — quantos moram
        // fora —, e sem esse número todo torneio recém-criado seria acusado de incompleto.
        // Documento dividido antes desta versão cai no comportamento antigo, que é o seguro.
        // ── ciclo 2.0.105 ──────────────────────────────────────────
        // ⭐ AS TRÊS PORTAS QUE DEVOLVERIAM OS JOGOS PRO DOCUMENTO, FECHADAS.
        // Depois que os jogos saem do doc, o objeto em MEMÓRIA continua tendo eles (a rede
        // do ouvinte enxerta, pra tela não pintar chave vazia). Isso cria um risco novo e
        // silencioso: qualquer caminho que grave "o torneio inteiro" devolve os jogos.
        // ① `saveTournament` grava só a CONFIG quando o marcador está posto — e se
        //    `dividir` falhar, NÃO grava: gravar o objeto inteiro desfaria a divisão calado.
        // ② As CFs passaram a ler por `_leTorneio` (monta das subcoleções) e gravar por
        //    `_gravaTorneio` (só os jogos que MUDARAM — um ponto toca ~1 KB em vez de
        //    reescrever 214 KB). São 6 portas de escrita; uma sozinha fora desfaz tudo.
        // ③ ⛔ O gatilho de espelho era o mais perigoso: ele deriva do DOCUMENTO, veria
        //    "nenhum jogo" e APAGARIA a subcoleção — que passou a ser a cópia VIVA. Agora
        //    ele reconhece o marcador e não encosta nos jogos.
        // ⚠️ Custo assumido: aplicar placar passa a custar ~115 leituras (o motor precisa
        // do torneio TODO pra avançar chave). O ganho é maior e do outro lado: a escrita e
        // o ECO pra cada tela aberta caem de 214 KB pra ~1 KB.
        // ⛔ E a VOLTA foi escrita ANTES do salto (scripts/desfazer-divisao.js). Volta que
        // se escreve no susto é volta que não funciona.
        // ── ciclo 2.0.104 ──────────────────────────────────────────
        // 🕸️ A REDE, ANTES DO SALTO. Nada muda hoje — é o que impede um desastre amanhã.
        // O ouvinte ao vivo (`_aplicaSnapTorneios`) é síncrono, roda a CADA eco de
        // QUALQUER torneio e empurra `doc.data()` direto pro store; a tela pinta em
        // seguida. Com os jogos fora do documento ele passaria a receber `rounds` com
        // `matches` vazio ⇒ CHAVE VAZIA pra todo mundo com o app aberto. Não é lentidão:
        // é a tela mentindo que o torneio não tem jogo.
        // ⛔ E buscar a subcoleção ali não é opção: ~115 leituras POR TORNEIO POR ECO —
        // trocaria peso por custo, o mesmo erro que a 1ª versão do gatilho cometeu.
        // ⇒ O que já está montado em MEMÓRIA é enxertado na config nova: o documento manda
        // no que é config (nome, fase, horário), a memória segura os jogos.
        // ⛔ O gatilho é o MARCADOR (`_semPesados`), NUNCA a ausência — torneio recém-criado
        // também não tem jogo, e confundir "não tem" com "mudou de lugar" apaga a tela.
        // ⚠️ Sem nada em memória, marca `_faltamPesados` em vez de passar por vazio:
        // "ainda não carregou" ≠ "não tem jogo".
        // ── ciclo 2.0.103 ──────────────────────────────────────────
        // ⭐ O ÚLTIMO LUGAR ONDE O CLIENTE CALCULAVA PLACAR FECHOU.
        // `commitResultTx` tentava a CF e, em QUALQUER falha, caía no MOTOR LOCAL — que
        // aplica o placar e DERIVA O AVANÇO DA CHAVE no aparelho. É exatamente o que o
        // dono proibiu no fecho de rodada, e a justificativa escrita no código ("pro app
        // de loja antigo lançar placar na quadra") estava VENCIDA: conferido no git, todo
        // build nativo desde o 2.0.3 já chama a CF.
        // ⚠️ Mas tirar a queda sem mais nada teria um custo que o argumento não cobria: o
        // caminho local escreve no Firestore, que tem FILA OFFLINE ("saves sobrevivem a
        // fechar o app"); CF chamável não tem — sem sinal, falha na hora. Numa quadra com
        // sinal ruim é a diferença entre o placar entrar e não entrar.
        // ⇒ A queda virou FILA: o app grava a INTENÇÃO (escrita comum, que o SDK entrega
        // sozinho quando a rede volta) e o gatilho `applyQueuedResult` APLICA no servidor
        // — com a MESMA função da porta chamável, num miolo só. Duas aplicações divergem,
        // que é justamente o problema que isto resolve.
        // ⚠️ O preço, dito na tela e não escondido: sem sinal o placar fica GUARDADO mas a
        // CHAVE NÃO AVANÇA até a conexão voltar. Prometer "pronto" seria mentira.
        // ⛔ A intenção é IMUTÁVEL e só se cria em nome próprio (`actorUid ==
        // request.auth.uid`); a autorização de verdade é refeita no servidor sobre o doc
        // fresco. O item nunca é apagado: é o recibo do que a pessoa mandou.
        // ⭐ Idempotente: o id sai do conteúdo da intenção, então reenviar cai no mesmo
        // documento e o gatilho roda uma vez — a CF pode ter aplicado e a resposta ter se
        // perdido na volta, e lançar placar duas vezes é o pior erro possível aqui.
        //
        // ⭐ E ISSO DESTRAVA A ARQUITETURA: era a escrita do cliente no documento do
        // torneio que obrigava as rules a deixarem o participante escrever nele. Com o
        // placar fora do cliente, os jogos (97 KB, 45% do doc) podem sair do documento.
        // ── ciclo 2.0.102 ──────────────────────────────────────────
        // ⛔ ACHADO OLHANDO PESO, NÃO SEGURANÇA: o documento do torneio é lido SEM LOGIN
        // quando `isPublic == true`, e ele carregava E-MAIL de participante.
        // Conferido contra produção, não deduzido da regra: `GET .../tournaments/{id}`
        // sem cabeçalho de autenticação → HTTP 200, 429 KB, 61 e-mails.
        // Varredura dos 38 torneios públicos: 90 e-mails distintos.
        // ⭐ E NÃO EXISTE CONSERTO PELA REGRA: o Firestore entrega o documento INTEIRO ou
        // nada — não há "esconde só este campo". Quem precisa ficar escondido não mora
        // num doc público. O defeito não é a regra (a vitrine é pública de propósito), é
        // o e-mail estar ali.
        // Esta leva fecha a MAIOR e mais segura fonte: `categoryNotifications[].targetEmail`
        // — 84 ocorrências, 60 e-mails, num registro cujo próprio código diz que o uid é a
        // chave canônica e o e-mail é fallback de doc legado.
        // ⭐ E a migração TROCA em vez de apagar: 82 dos 84 registros eram legados e não
        // tinham uid; medido, 59 dos 60 e-mails resolvem pra um uid da base. Então o
        // e-mail vira uid e nada se perde. O registro continua (o dono desligou a tela em
        // 31/jul mas mandou guardar: "voltaremos a isso depois").
        // ⏳ NÃO FECHA TUDO: `organizerEmail` / `creatorEmail` / `adminEmails` participam
        // de AUTORIZAÇÃO, e `participants[].email` de identidade legada. Mexer nelas sem
        // cuidado tranca gente pra fora do próprio torneio. Leva própria, com decisão do
        // dono — e está NOMEADO no script pra ninguém achar que acabou.
        // ── ciclo 2.0.101 ──────────────────────────────────────────
        // ⭐ O GRUPO DE WHATS DO JOGO VOLTOU A SER 1 LINK PEQUENO.
        // O dono viu a medição e cortou o assunto: "é só um link porra. link do grupo" ·
        // "cada grupo de jogo tem 1 link pequeno para o grupo do whats". Ele tinha razão.
        // Medido nos 48 jogos com grupo (13,0 KB): notifyLog 34% · LINK 21% · byUid 14% ·
        // byName 9% · notifiedAt 9% · at 7% · notifyCount 5%. O link era 21% — os outros
        // 79% eram registro SOBRE o link, e triplicado, porque o objeto inteiro era
        // copiado nos 3 jogos de cada grupo (16 links distintos para 48 jogos).
        // Agora: o PORTADOR guarda o registro (é dele que os diálogos leem — "Fulano já
        // criou um grupo aqui, substituir?"), e os irmãos carregam só `{ link }`, que é o
        // que o botão "Abrir grupo" lê. 13,0 → 4,7 KB.
        //
        // ⚠️ E ISTO QUASE SAIU ERRADO. Minha primeira busca por quem lê `notifyLog` veio
        // TRUNCADA e eu conclui "ninguém lê" — cheguei a escrever o delete geral. Lê sim:
        // `tournaments-org-tools` lê `t.waGroup.notifyLog`, o grupo do TORNEIO, que
        // alimenta o relatório "Convites do grupo" em Comunicados. Só o do JOGO é morto.
        // Apagar os dois teria matado um relatório que funciona pra economizar bytes de
        // outro lugar. ⛔ Busca truncada não é busca — é palpite com aparência de prova.
        // ── ciclo 2.0.100 ──────────────────────────────────────────
        // ⭐ A PODA DO HISTÓRICO — o campo que crescia PRA SEMPRE agora tem freio.
        // Simulado no documento REAL antes de ligar: Confra 218 → 80 eventos, 138 saem,
        // 245 KB → 222 KB, e as 138 CONFERIDAS UMA A UMA no espelho (0 sem cópia).
        // Em KB é modesto; o que muda é que o log deixa de crescer sem limite — daqui pra
        // frente fica preso entre 80 e 120 linhas, dure o torneio o que durar.
        //
        // ⭐ A PODA MORA NO SERVIDOR, e por três motivos:
        // ① só ali dá pra saber que o espelho JÁ TEM o que vai sair — é a linha de cima,
        //    no mesmo disparo; do cliente eu estaria podando na esperança;
        // ② o cliente tem uma proteção que RECONSTRÓI histórico encolhido (um save
        //    atrasado apagando o rastro custou uma tarde) — podar de lá seria brigar com
        //    ela; ③ é a ordem do dono: "tudo na cf".
        // ⛔ E EM TRANSAÇÃO, relendo o documento: entre o gatilho e a escrita alguém lança
        // placar e acrescenta linha, e um update cego engoliria essa linha — seria eu
        // recriando o bug de save atrasado que o item ② descreve.
        // ⭐ Só a ponta MAIS VELHA sai; a cauda fica. O que sai foi espelhado faz tempo.
        //
        // ⛔ QUEM PODA TEM QUE DEVOLVER. A tela de revisão do sorteio é a única que mostra
        // o log INTEIRO (rules.js já cortava em 20): ela agora vai buscar o que foi podado
        // na subcoleção — preguiçosamente, só quando o documento diz que houve poda, e a
        // falha não derruba nada (a cauda já está pintada). Rastro que some em silêncio é
        // o oposto de rastro.
        // + regra nova: a subcoleção de histórico é LEGÍVEL (sem ela o Firestore nega por
        //   omissão e a busca voltaria vazia); escrita segue só da CF.
        // + `historyPodados` é CUMULATIVO, não um "total": total ficaria velho na linha
        //   seguinte e a tela pararia de buscar o resto justo depois de um placar.
        // ── ciclo 2.0.99 ───────────────────────────────────────────
        // ⭐ O HISTÓRICO É UM LOG — E A CHAVE DELE ERA A COISA QUE A PODA MOVE.
        // Medindo o peso dos documentos de hoje (não o número que eu anotei ontem):
        // Confra 245 KB, 4,2× até o teto de 1 MB. `rounds` 105 KB (43%), `history`
        // 37 KB (15%). ⭐ E `history` é o ÚNICO campo que cresce PRA SEMPRE: `rounds`
        // para quando o torneio acaba, o log não. Por isso ele vem primeiro.
        // ⛔ Mas o espelho chaveava cada evento por POSIÇÃO (`'h' + _idx`), e posição é
        // exatamente o que muda quando se poda. Podar o Confra pras últimas 30 faria o
        // diff ver `h0..h29` com conteúdo NOVO e `h30..h217` AUSENTES ⇒ reescreveria 30
        // linhas erradas e APAGARIA 188. O log inteiro, destruído pela economia de 37 KB.
        // Achado LENDO o gatilho antes de mexer, não depois.
        // ⇒ A chave passa a sair do CONTEÚDO (data + mensagem) e o espelho de histórico
        // SÓ CRESCE — log de auditoria não se apaga. `_idx` continua indo junto: chave é
        // QUEM, índice é ONDE; o bug nasceu de usar um como o outro.
        // ⛔ Jogos e inscritos CONTINUAM podendo ser apagados: sumir dali é informação
        // real (jogo removido, inscrito que saiu), e não apagar deixaria fantasma na tela.
        // Nada muda na tela nesta leva — é a chave que passa a aguentar a poda que vem.
        // ── ciclo 2.0.98 ───────────────────────────────────────────
        // ⭐ O FECHO DE RODADA SAIU DO CLIENTE — EM TODO FORMATO.
        // Ordem do dono: _"o certo é tudo rodar em CF só sendo disparado pelo client
        // side"_ e, quando eu pus uma queda pro caminho local: _"errado. nada no client
        // side. imagina diferentes clientes com diferentes versões encerrando as rodadas
        // e gerando a seguinte cada um com um código. de forma alguma. tudo na cf"_.
        // Ele está certo: fallback local SOA prudente e é o oposto — recria a divergência
        // de versão que a CF existe pra eliminar, e só nos momentos de FALHA, que é quando
        // ninguém está olhando. ⛔ NÃO FECHAR é melhor que fechar ERRADO: a rodada fica
        // aberta, a pessoa é AVISADA e tenta de novo. (Silêncio é pior — foi o que custou
        // o jogo 63 hoje.)
        // Até aqui só o Suíço multifase roteava; nos demais o CLIENTE gerava a rodada
        // seguinte e a gravava. A CF já era genérica (mesma mutação canônica), então não
        // houve motor novo — só parar de restringir. E o AVISO do fecho virou fonte única
        // derivada do desfecho, senão rotear faria a tela mudar em silêncio.
        // ⚠️ Efeito colateral aceito: com app VELHO, encerrar rodada para de funcionar em
        // vez de funcionar diferente. É a escolha certa, e é por isso que a trava das
        // rules (09/set/2026) exige conferir o piso das lojas antes.
        //
        // + `playerUids` em cada jogo espelhado (123/123 semeados): é o insumo de
        // AUTORIZAÇÃO da CF de escrita. A derivação MUDOU DE CASA (store.js →
        // bracket-logic, que é vendorizado) em vez de ser reimplementada — hoje três bugs
        // saíram de lógica duplicada que divergiu em silêncio.
        // + A regra de `tournaments/{id}/matches` fecha a escrita do cliente, com o porquê
        // ESCRITO nela (pra ninguém "consertar" abrindo).
        // + O gatilho AVISA se nenhum jogo sair com playerUids, em vez de espelhar vazio.
        // ── ciclo 2.0.97 ───────────────────────────────────────────
        // ⛔ ABRIR O TORNEIO VOLTAVA COM DADO VELHO. Relato do dono, logo depois de
        // aprovar um placar: _"pelo que vejo foi aprovado, mas quando abri de novo não
        // estava. Mas daí reiniciei e estava. inconsistência no load que não deveria
        // acontecer"_.
        // CAUSA: `_ensureTournamentLoaded` decidia buscar assim — "é um resumo? busco;
        // senão, já está carregado". Só que `_loadFromCache` enche a memória com
        // documentos COMPLETOS de até 24h atrás, e um completo velho PASSA nesse teste.
        // Abrir pintava o estado de ANTES da aprovação; reiniciar corrigia porque o cache
        // já tinha sido trocado.
        // ⛔ Eram DUAS perguntas respondidas pelo mesmo teste: "tem os dados?" e "os dados
        // são atuais?". Agora o que vem do cache é marcado, e ABRIR exige o fresco. O
        // cache segue pintando a lista na hora — ele só deixou de decidir o que a pessoa vê.
        //
        // ⛔ E O PADRÃO QUE TRAVOU O JOGO 63 NÃO PODE VOLTAR EM LUGAR NENHUM.
        // Auditei os 14 pontos do app que ligavam clique elemento a elemento. O gerenciador
        // de categorias não estava quebrado — mas só porque alguém lembrava de RELIGAR a
        // cada `innerHTML = …`, em 5 pontos, com os mesmos 3 botões duplicados em dois
        // lugares. Depender de lembrar É o bug. Viraram UMA delegação (e as duas pontas,
        // uma só). Trava geral: tests/clique-nao-se-liga-por-elemento (varre o app inteiro).
        //
        // + removidas 91 linhas mortas de `_setupServeDragDrop`: função sem NENHUM
        // chamador, procurando um atributo (`data-serve-idx`) que o app nunca emite.
        // Apagada em vez de mantida: função sem chamador é decoy, e decoy faz o próximo
        // leitor consertar o lugar errado — foi o que me atrasou no jogo 63.
        // SEM item pro usuário: um conserto de frescor e dois preventivos.
        // ── ciclo 2.0.96 ───────────────────────────────────────────
        // ⛔ O BOTÃO QUE APARECE E NÃO FAZ NADA. Relato do dono: _"não consigo
        // aprovar o jogo 63 … o botão aparece, mas clicando nada acontece.
        // organizador clicando. imagina o participante."_
        // CAUSA — e é minha, da 2.0.86: a seção "Meus Resultados" virou de montagem
        // PREGUIÇOSA (o que passa do 2º bloco só entra no DOM ao abrir a seção). O
        // despachante de cliques rodava UMA vez, no render, ligando addEventListener
        // em cada botão EXISTENTE. Botão inserido depois nascia MORTO: aparece, está
        // habilitado, e o clique não faz nada.
        // ⛔ E SEM SINAL: sem erro, sem aviso, sem nada no Sentry. A investigação não
        // achava a falha porque não havia falha — havia SILÊNCIO. Queimei uma rodada
        // de hipóteses (permissão, resumo da 2.0.95, migração de cor) olhando o que o
        // clique FAZ, quando o problema era o clique NÃO CHEGAR.
        // Agora é DELEGAÇÃO: o ouvinte mora no container e vale pra botão que exista
        // agora ou venha a existir. Some a classe inteira — ela ia voltar em toda
        // seção que virasse preguiçosa. A montagem preguiçosa fica (é o ganho).
        //
        // ⭐ A DASHBOARD É O SEU CÍRCULO. Ordem do dono: _"apenas torneios organizados
        // ou participando, ou em locais favoritos, ou de amigos. um botão explorar
        // mostraria tudo"_ · _"se entrar com convite, mesmo que não tenha nada disso,
        // aparece"_ · _"e continua podendo ocultar os torneios"_.
        // ⛔ MODALIDADE FAVORITA FICOU DE FORA, e foram os NÚMEROS que decidiram: com
        // ela a régua mostrava 35 de 39 e trazia de volta 31 dos 36 torneios que o dono
        // tinha ocultado À MÃO (34 dos 39 são Beach Tennis, a preferida dele).
        // Modalidade diz que ESPORTE interessa, não que o torneio é do mundo da pessoa;
        // ela é filtro DENTRO do Explorar. Com a régua estrita: 4 na dashboard, 39 na
        // plataforma. O botão Explorar fica ao lado do toggle "Lista" e carrega o TOTAL
        // da plataforma — o dono pediu esse número sempre visível.
        //
        // ⛔ A MODALIDADE GRAVADA VOLTOU A SER O VALOR CANÔNICO. Ordem do dono: _"por
        // isso que não deixo as pessoas escreverem livremente as modalidades. usam
        // botões que devem padronizar isso sempre"_ — e o botão padronizava a string
        // ERRADA: `<option>🎾 Beach Tennis</option>` não tinha `value`, então o valor
        // ERA o texto, emoji incluído. MEDIDO: 6 grafias pra 4 modalidades
        // ("Beach Tennis"=27 e "🎾 Beach Tennis"=7 como se fossem coisas diferentes).
        // Corrigido nos dois caminhos de criação; 9 documentos normalizados por
        // scripts/normalizar-modalidade.js. O emoji continua no RÓTULO.
        //
        // FASE 2a (inerte): o leitor aprendeu a montar o torneio das SUBCOLEÇÕES quando
        // o documento disser `_semPesados`. Nada muda enquanto nenhum documento disser —
        // é o que vai permitir tirar os jogos do documento torneio a torneio, sem
        // release, e é isso que remove o TETO de 1 MB. Ver docs/FASE2-JOGOS-EM-SUBCOLECAO.
        // ── ciclo 2.0.95 ───────────────────────────────────────────
        // "MEUS TORNEIOS" LÊ O ÍNDICE, não o torneio inteiro.
        // A tela desenha CARTÕES — e cartão não usa jogos, inscritos nem histórico.
        // Lendo o documento completo, ela arrastava o torneio inteiro por linha da lista.
        // MEDIDO no uid do organizador da Confra (scripts/medir-meus-torneios.js):
        //     documento COMPLETO ... 518 KB   →   RESUMO ... 25 KB
        //     (a Confra sozinha: 433 KB → 17 KB)
        // Abrir o torneio segue trocando o resumo pelo completo.
        // ⚠️ O RISCO TEM NOME, e por isso a troca só saiu com prova: torneio SEM resumo
        // sumiria da lista da pessoa — e sumir é pior que pesar. O conferidor antigo
        // provava que o espelhado DIZ a mesma coisa; faltava provar que não FALTA
        // ninguém. scripts/conferir-indice-completo.js compara o conjunto de ids e o
        // `memberUids` dos dois lados: 39/39, 0 faltando, 0 órfão, 0 divergente.
        // Rede mantida (resumo vazio ⇒ caminho antigo) e sentinela mantida.
        // SEM item pro usuário: a tela é a mesma, só chega mais leve.
        //
        // ── ciclo 2.0.94 ───────────────────────────────────────────
        // ⚠️ ESTA NOTA ENTROU ATRASADA: a 2.0.94 foi publicada sem ela. O pipeline da
        // migração de cor roda `git checkout` pra refazer do zero, e isso levou junto o
        // texto que eu já tinha escrito. Fica registrado — nota some em silêncio.
        //
        // A COR SAIU DO SELETOR E VIROU TABELA.
        // O tema claro remapeava contraste com ~1.943 regras `[style*="cor"]` —
        // casamento de SUBSTRING DE ATRIBUTO, o pior caso do seletor CSS: nenhum índice
        // do navegador (tag, classe, id) filtra antes, então cada regra é testada contra
        // cada elemento e o custo é LINEAR no número delas. Eram 29% de todo o CSS, e
        // nasceram do trabalho de contraste do tema claro (v2.1.84-beta / v2.1.90-beta)
        // — que é quando o dono disse que piorou.
        // MEDIDO no WebKit, mesma tela de 5.117 elementos:
        //     recálculo de estilo  1.454 ms → 21 ms    ·    CSS 343 KB → 205 KB
        //     css/style.css        3.008 linhas → 542
        // O remap virou tabela de variáveis (css/paleta.css + js/paleta-tabela.js),
        // resolvida por HERANÇA: custo zero de casamento.
        // ⛔ A régua era ser INVISÍVEL, e foi provado em duas medidas independentes:
        //   · 3.060 comparações de declaração de cor (2 temas + dentro da tarja);
        //   · 12.488 elementos das telas reais, cor RESOLVIDA elemento a elemento.
        // ⚠️ O que quase passou batido, e só a prova de TELA pegou: metade das cores não
        // está escrita junto da propriedade — chega por argumento e é concatenada
        // (`'color:' + cor`). Regex no texto não vê; o navegador vê.
        // ⚠️ Ficaram DE FORA de propósito (eram imunes ao remap e continuam): hex em
        // MAIÚSCULA (preserva o verde do WhatsApp), `!important` em linha, e grafia que a
        // regra não casava (`background:#hex` nunca foi remapeado, só `background: rgb()`).
        //
        // E OS TEMAS MORTOS SAÍRAM. Ordem do dono, ao me ver escrever "3 temas":
        // _"2 temas, que 3 temas?"_ · _"podemos eliminar esse código morto?"_
        // sunset/ocean saíram da ESCOLHA na v2.6.27 e o código deles ficou: dois blocos
        // de variáveis, regras de balão de dica, e ramos que nunca executaram.
        // Código morto não é só peso — ele MENTE: foi ele que me fez reportar 3 temas.
        // ── ciclo 2.0.93 ───────────────────────────────────────────
        // DOIS relatos do dono no mesmo dia, os dois na chave do Confra.
        // ① _"não sei porque veio o grupo com um wo da denise que não tem nada a ver
        //    com esse grupo"_ (R1 Grupo I2). MEDIDO no doc ao vivo: o rastro
        //    `woSubstituteFor` mora na ENTRADA de quem substituiu, e a entrada viaja
        //    com a pessoa. A Carol substituiu a Denise no Grupo A em 09/ago; em 24/ago
        //    voltou pra fila e caiu num grupo NOVO — que, por ser novo, não tem
        //    registro no `woLog` e cai na reconstrução legada por rastro. O registro
        //    guarda o grupo do dia: quando ele diz que o W.O. é de outro grupo, o
        //    legado se cala. ⛔ Provado grupo a grupo: dos 35 grupos do Confra e dos
        //    34 do backup, MUDOU UM — exatamente o I2, de 1 linha pra 0.
        // ② _"cliquei em criar grupo de whats do grupo I2 e acabou abrindo no whats o
        //    meu grupo de participante"_. O link estava certo (medido: o chip do I2
        //    escreve só nos 3 jogos do I2). O que o clique faz é abrir o WhatsApp SEM
        //    destino — não existe deep link pra "criar grupo", então o app abre na
        //    última conversa. O texto agora avisa isso.
        //    ⛔ Mas havia bug de verdade ao lado: o nome sugerido em modo grupo era
        //    "R{rodada}", e desde a 2.0.57 é o ORGANIZADOR quem cria o grupo de TODOS.
        //    MEDIDO: 1 nome pra 35 grupos. Agora o nome é o da chave ("R1 Grupo I2").
        // SEM item na tela pro usuário: são correções, não novidade.
        // ── ciclo 2.0.92 ───────────────────────────────────────────
        // ⚠️ SEM item pro usuário: é rede de proteção da migração, zero mudança de
        // tela. Desde a 2.0.90 a vitrine entrega o documento LEVE. MEDIDO: 41 lugares
        // leem matches/rounds/participants a partir de AppStore.tournaments —
        // a maioria de um torneio já ABERTO (portanto completo), mas auditar 41
        // sítios por LEITURA é como se erra: basta um caminho raro escapar.
        // Agora o resumo AVISA (com o rastro de quem pediu) em vez de eu adivinhar.
        // ⛔ A sentinela devolve `undefined` — o mesmo que devolveria sem ela. Não
        // preenche, não busca, não bloqueia: é medição.
        // ── ciclo 2.0.91 ───────────────────────────────────────────
        // Ordem do dono: "achava, mas não mostrava — e achar e não mostrar é não
        // achar". Eram DUAS falhas: ① a busca revelava com `style.display=''` e as
        // seções recolhidas escondiam com `display:none !important`, que GANHA do
        // estilo em linha; ② o filtro só olhava os cartões JÁ DESENHADOS, então
        // torneio antigo/de outra cidade era INENCONTRÁVEL — nunca chegou ao
        // aparelho. Agora buscar MONTA e ABRE o que esconde, e consulta o resumo no
        // servidor por `tokens` e `nameLower` (sem acento).
        '<li><b>🔎 A busca acha de verdade — e mostra o que achou:</b> antes ela só procurava entre os torneios que já estavam na tela, e quando encontrava algo dentro de uma seção fechada o resultado continuava escondido. Agora ela procura <b>no servidor</b>, encontra torneios antigos ou de outros locais que nem tinham sido carregados, e abre o que estiver no caminho para você ver o que foi encontrado.</li>' +
        // ── ciclo 2.0.90 ───────────────────────────────────────────
        // ⭐ A VITRINE PARA DE BAIXAR O TORNEIO INTEIRO. MEDIDO na base real:
        // documento do Confra 236 KB → resumo 11 KB; base toda 421 KB → 62 KB (85%).
        // A consulta trazia até 51 documentos COMPLETOS — com jogos, inscritos e
        // histórico — pra desenhar cartões de duas linhas.
        // ⛔ Provado igual: contagens, progresso, 'já sorteou' e o BOTÃO de inscrição
        // batem 28/28 torneios e 191/191 combinações pessoa×torneio
        // (tests/cartao-do-resumo-e-igual-ao-completo.test.js).
        // Abrir um torneio troca o resumo pelo documento completo antes de pintar.
        '<li><b>⚡ A tela inicial deixa de baixar torneios inteiros:</b> para desenhar cada cartão, o aplicativo carregava o torneio completo — todos os jogos, todos os inscritos, todo o histórico. Agora carrega só o resumo de cada um, <b>85% mais leve</b>, e busca o torneio inteiro apenas quando você abre. O que aparece na tela é exatamente o mesmo.</li>' +
        // ── ciclo 2.0.89 ───────────────────────────────────────────
        // ⛔🔴 A CAUSA DAS TRAVADAS PERIÓDICAS, e ela era um RELÓGIO. MEDIDO no
        // aparelho do dono com o carimbo de tempo: 3270ms/pra-cima aos 45s, 1014ms
        // aos 26s, 860ms aos 25,2s — com apenas 739 elementos na tela. Era o
        // `setInterval(…, 25000)` da dashboard chamando `loadPublicDiscovery`, que
        // lê a coleção `tournaments` com os DOCUMENTOS INTEIROS. A cada 25s o
        // aparelho baixava e desserializava dezenas de torneios completos.
        // E era REDUNDANTE: o listener de tempo real já cobre isso.
        // Junto: 'Seus últimos resultados' monta só o bloco à vista, e o relatório
        // de travada passa a mostrar os trechos MAIS CAROS (mostrava os ÚLTIMOS —
        // um trecho de 3s era empurrado da lista por três de 1ms).
        '<li><b>⚡ O aplicativo para de rebuscar tudo a cada 25 segundos:</b> mesmo parado, a tela inicial refazia a busca de torneios em segundo plano — baixando cada torneio por inteiro — e era isso que travava a rolagem de tempos em tempos. As novidades continuam chegando na hora, pelo tempo real. E a caixa de <b>últimos resultados</b> passa a montar só o que está à vista.</li>' +
        // ── ciclo 2.0.88 ───────────────────────────────────────────
        // ⭐ O MAIOR DE TODOS. MEDIDO no aparelho do dono: #inline-bracket-container
        // = 6.157 dos 8.061 elementos da tela de torneio → travada de 1.662ms ao
        // rolar. Reproduzido com o documento REAL: 34 grupos × 158 = 5.482 → **230**.
        // ⛔ TERCEIRA VEZ NO MESMO DIA: janelas (2.0.84), histórico (2.0.86) e agora
        // a chave — todos escondiam (opacity:0 / <details>) e construíam assim mesmo.
        // A divisão 'meu grupo' × 'demais' JÁ existia; faltava não construir.
        // ⚠️ Dois riscos fechados junto: só adia com 6+ grupos (grupo fora do DOM
        // perde a âncora de rolagem) e BUSCAR monta tudo antes de filtrar (senão a
        // busca diria 'nenhum resultado' mentindo).
        '<li><b>⚡ A chave do torneio abre muito mais leve:</b> num torneio grande o aplicativo montava todos os grupos de uma vez — no Confra, mais de cinco mil elementos, quase todos fora da tela. Agora nasce o <b>seu grupo</b> e os demais ficam num bloco “Demais jogos da rodada” que você abre quando quiser; a busca continua encontrando qualquer pessoa, em qualquer grupo.</li>' +
        // ── ciclo 2.0.87 ───────────────────────────────────────────
        // Relato do dono: "a barra sobe legal, mas o número fica em 4% e daí pula
        // pra 100%". ⭐ NÃO era defeito do número — era MEDIDA do defeito: a barra é
        // `transform` (compositor, roda sem a thread) e o número era escrito por um
        // setInterval de 140ms. Com a thread presa o carregamento inteiro, ele nunca
        // rodava. O número congelado era o termômetro.
        // ⛔ TESTADO NO WEBKIT ANTES DE ESCOLHER: `@property` + `counter()` não anima
        // (3 fotos idênticas em 3s, comparadas por pixel). Odômetro em `steps()`
        // anima — por isso é uma coluna de 20 números, não um contador.
        '<li><b>📊 O número acompanha a barra de carregamento:</b> o percentual ficava parado em 4% e saltava para 100% no fim. Agora ele sobe junto com a barra, porque passou a ser desenhado do mesmo jeito que ela — sem depender do aplicativo estar livre para atualizá-lo.</li>' +
        // ── ciclo 2.0.86 ───────────────────────────────────────────
        // MEDIDO no aparelho do dono, agora na tela de DETALHE do torneio:
        //   nos=8061 · onde: #app=7870 #inline-bracket-container=6157
        //                    #activity-log-section=1242  → travada de 1.662ms
        // (a tela INICIAL, depois de 2.0.84, está em 868 nós.) O histórico inteiro
        // era montado e escondido num <details> FECHADO — 1.242 elementos que
        // ninguém pediu, mais o texto de TODOS os eventos antigos remontado a cada
        // render. ⛔ <details> fechado PARECE não carregado, e não é.
        // ⚠️ Falta o maior: #inline-bracket-container, 6.157 elementos.
        '<li><b>⚡ O histórico do torneio só é montado quando você o abre:</b> a lista de atividades era construída inteira toda vez que a página do torneio carregava, mesmo fechada — e num torneio grande ela sozinha era mais de mil elementos escondidos. Agora ela nasce no instante em que você clica pra ver.</li>' +
        // ── ciclo 2.0.85 ───────────────────────────────────────────
        // Fecha o que a 2.0.84 começou: login e criação rápida também saem do
        // arranque. ⚠️ `setupQuickCreateModal` era uma IIFE — construía sem sequer
        // existir no `window`, então não aparecia numa busca por "quem chama".
        // MEDIDO depois da 2.0.84, no aparelho do dono: nos 3645→868, travada ao
        // rolar pra cima 3766ms→~710ms. Ainda corta, e ele precisou: "mas só no
        // começo e depois estabiliza" ⇒ a telemetria passa a levar `aberto=Xs`,
        // que confirma (ou desmente) que os episódios caem nos primeiros segundos.
        // Se cair, a causa é a ABERTURA disputando a thread, não a rolagem.
        '<li><b>⚡ Mais duas janelas saem do carregamento inicial:</b> a de <b>entrar na conta</b> e a de <b>criação rápida</b> também eram montadas junto com o app e ficavam escondidas. Agora nascem no momento em que você as abre — completando a limpeza começada na versão anterior.</li>' +
        // ── ciclo 2.0.84 ───────────────────────────────────────────
        // ⭐ A RESPOSTA DA INVESTIGAÇÃO INTEIRA, e veio do aparelho do dono. Sentry,
        // release 2.0.83, travada de 3.766ms rolando pra cima:
        //   nos=3645 · onde: #modal-help=1609 #modal-create-tournament=835
        //                    #app=567 #modal-profile=327
        // O app VISÍVEL tinha 567 elementos; as 3 janelas FECHADAS somavam 2.771 —
        // 76% do documento era janela que ninguém abriu. Construídas no arranque, com
        // `opacity:0` (que NÃO tira do layout nem da pintura) e `backdrop-filter:
        // blur(4px)` em tela cheia, cada uma. Ordem dele: "nada que não estiver
        // visível deve ser carregado". Agora nascem ao abrir (porta única em ui.js).
        '<li><b>⚡ O aplicativo para de carregar o que você não abriu:</b> as janelas de <b>ajuda</b>, <b>criar torneio</b> e <b>perfil</b> eram montadas assim que o app abria e ficavam escondidas o tempo todo — juntas, elas eram <b>três quartos de tudo</b> que existia na tela, invisíveis, e cada uma mantinha um efeito de desfoque de tela cheia sempre ligado. Agora cada uma só é criada no instante em que você a abre.</li>' +
        // ── ciclo 2.0.83 ───────────────────────────────────────────
        // ⛔ DESFAZ PESO QUE EU MESMO PUS. O perfilador era tudo-ou-nada e ficou
        // DIAS ligado no aparelho do dono — inclusive a parte cara, que embrulha
        // TODO ouvinte de scroll/touchmove com dois performance.now() POR EVENTO,
        // até 60x/s enquanto se rola. Eu pendurei um medidor em cada quadro da
        // rolagem no aparelho que reclamava de rolagem, e ainda somei mais peso
        // (2.0.80) tentando entender a lentidão. Ele: "até aqui só piorou o que
        // estava razoável". Agora: perf=1 é LEVE (sentinela + relato com direção,
        // nós e onde) e perf=2 é FUNDO (embrulhos). O item pro usuário existe
        // porque QUEM TEM diagnóstico ligado sente a diferença na rolagem.
        '<li><b>⚡ Rolagem mais leve para quem tem diagnóstico ligado:</b> as ferramentas que eu uso para investigar lentidão mediam o tempo de <b>cada</b> toque e <b>cada</b> quadro de rolagem — e isso, ligado por dias, atrapalhava justamente o que vinha sendo investigado. Agora o diagnóstico tem dois níveis: o normal continua reportando as travadas, e o pesado só liga quando é para caçar um culpado específico.</li>' +
        // ── ciclo 2.0.82 ───────────────────────────────────────────
        // Ordem do dono: "tem o mostrar mais nos 2. poderia não carregar tudo antes
        // que alguém clicasse no mostrar mais." MEDIDO na forma da tela dele (1
        // torneio): a seção de novidades era 639 dos 921 elementos do documento —
        // 69% da tela inicial, invisível, esperando um clique que quase nunca vem.
        // Agora: documento 921 → 337 elementos; com 6 torneios, 54 KB de HTML
        // deixam de ser construídos a cada desenho.
        // ⚠️ Só NOVIDADES nesta leva. "Seus últimos resultados" é montado ao longo
        // de ~630 linhas com blocos intercalados — mesma ideia, risco diferente,
        // leva própria. Junto: a telemetria de travada passa a dizer ONDE estão os
        // nós (`onde:`), porque contar o total me levou a uma conclusão ERRADA sobre
        // o tamanho da página.
        '<li><b>⚡ A tela inicial nasce mais leve:</b> a caixa de <b>novidades</b> montava todos os avisos de uma vez e escondia quase todos, esperando você clicar em "mostrar mais". Agora ela monta só o que aparece — o resto é criado no momento em que você abre. Na prática o app passa a desenhar cerca de <b>um terço</b> dos elementos que desenhava, e nada muda no que você vê.</li>' +
        // ── ciclo 2.0.81 ───────────────────────────────────────────
        // ⚠️ SEM item pro usuário: instrumentação, zero mudança de tela.
        // ⛔ DOIS defeitos DO INSTRUMENTO, não do app:
        // ① a cota de avisos era 3 por SESSÃO — e no PWA/tela-de-início a sessão
        //    dura DIAS. O dono testou, os 3 saíram às 14:07, e nas horas seguintes
        //    ele voltou a relatar corte com ZERO evento novo. Li isso como "não
        //    reproduziu" e quase troquei de hipótese por causa de cota vencida.
        //    Agora rearma a cada 10 min.
        // ② o aviso não levava os TRECHOS caros. Com o assíncrono já visível desde
        //    a 2.0.80, é isso que substitui o eterno "quem: nenhum" por nome+duração.
        // Registrado junto: a hipótese `resize`→`_reflowChrome` foi MEDIDA e
        // DESCARTADA (0,0ms por resize no DOM real; os 149ms de uma primeira
        // medição eram artefato de forçar valores diferentes — o `_setVar` já
        // compara antes de escrever).
        // ── ciclo 2.0.80 ───────────────────────────────────────────
        // ⚠️ SEM item pro usuário, e é DECISÃO: 100% instrumentação, zero mudança de
        // tela. Conserta um PONTO CEGO do próprio instrumento: `async () => x()`
        // devolve promessa na hora, então o cronômetro do embrulho media ~0ms e o
        // trabalho real (IndexedDB, rede, fila do SDK) ficava fora da medição. Era
        // por isso que TODA travada do dono chegava com `quem: nenhum` enquanto o
        // `ultimo=` apontava `intervalo800:this._poll()` (vigia de abas do Firebase
        // Auth sobre IndexedDB), `handleDelayElapsed()` e `Mu:schedule` (fila do
        // Firestore) — os três são entradas ASSÍNCRONAS de SDK.
        // Agora o rastro marca esses com "~" (ponta a ponta, não CPU). Mesma lição
        // da 1.9.94: instrumento que não cobre o caminho quente manda procurar no
        // lugar errado.
        // ── ciclo 2.0.79 ───────────────────────────────────────────
        // ⚠️ SEM item pro usuário, e é DECISÃO: 100% instrumentação, zero mudança
        // de tela. Restaura o aviso de travada DURANTE A ROLAGEM (com direção), que
        // nasceu na 2.0.70 e foi levado junto na reversão da 2.0.72 — a reversão
        // pegou a leva inteira, inclusive a parte que só MEDIA e estava certa.
        // Desde então, nenhum episódio de rolagem chegou ao Sentry, e a dor nº 2 do
        // dono ("rolar cortado, pior pra cima") ficou sem instrumento.
        // O que ela já provou no iPhone dele (25/ago, releases 2.0.70/71): 4.708ms e
        // 4.461ms PRA CIMA contra 976ms e 1.235ms pra baixo — o "pior pra cima" é
        // real e medido. E `ultimo=handleDelayElapsed()` / `Mu:schedule` apontam a
        // fila assíncrona do SDK do Firestore, ou seja: a travada nasce FORA do
        // código do app, que é por que todo episódio sai com `quem: nenhum`.
        // Junto volta o contador `_discoveryFetches` — sem ele o campo `busca=`
        // reportaria 0 sempre, e número que mente é pior que campo ausente.
        // ── ciclo 2.0.78 ───────────────────────────────────────────
        // MEDIDO no render REAL da tela inicial (28 torneios da base): 8.959
        // resoluções de nome por desenho, 54% de toda a CPU (_memberUidByName 25,6%
        // + _nameForUid 22,9% + _idMapKey 5,8%). Causa: a 2ª passada resolvia o nome
        // VIVO de CADA entrada a CADA chamada — e ela roda SEMPRE em torneio real,
        // porque _stripUidEntryNames apaga o nome gravado de quem tem uid.
        // Depois do índice: 491 resoluções, render 13,4ms → 6,5ms (desktop). É a
        // mesma forma do O(n²) que fazia a CHAVE levar 925ms no iPhone.
        '<li><b>⚡ A tela inicial desenha na metade do tempo:</b> a cada vez que a lista de torneios era redesenhada — abrir o app, ocultar, desocultar, expandir os ocultados — o aplicativo procurava cada pessoa <b>pelo nome</b>, varrendo a lista inteira de inscritos de todos os torneios. Eram quase <b>9 mil</b> buscas por desenho. Agora ele monta o índice uma vez e consulta direto: <b>18 vezes menos trabalho</b>, e o desenho caiu pela metade. Quanto mais gente inscrita, maior a diferença.</li>' +
        // ── ciclo 2.0.77 ───────────────────────────────────────────
        // ⚠️ SEM item pro usuário, e é DECISÃO: a tela não muda NADA. É o passo
        // invisível da arquitetura do resumo — o cartão da tela inicial passa a aceitar
        // TAMBÉM o documento leve (`tournaments_summary`), mantendo número por número
        // idêntico quando recebe o documento completo (provado nos 28 torneios da base
        // em tests/cartao-le-resumo-ou-documento.test.js). A troca da FONTE de dados,
        // essa sim visível, é a leva seguinte: fazer as duas juntas foi exatamente o
        // que obrigou a reversão da 2.0.69/70/71.
        // Junto: `sw.js` estava com CACHE_NAME em 2.0.74 (duas versões atrás) — o cache
        // do service worker não estava sendo invalidado nos releases 75 e 76.
        // ── ciclo 2.0.76 ───────────────────────────────────────────
        // Quatro frases do dono (25/ago): renomear "Combinar jogos" pra "Propor datas";
        // o botão mostra a data definida INCLUSIVE nas Novidades; o organizador aponta
        // direto; e em torneio de 1 a 3 dias o sistema calcula e sugere como ESTIMADA.
        // Decisão dele: a estimativa GRAVA (não é só sugestão de tela) — é o que faz a
        // data aparecer em todo lugar sem caminho de render novo. O que separa uma data
        // estimada de uma marcada por gente é a ORIGEM, e o sistema nunca pisa na segunda.
        '<li><b>📅 "Combinar jogos" virou "Propor datas" — e o torneio já nasce com horários:</b> em torneios de até 3 dias o app <b>calcula a data e a hora de cada jogo</b> assim que a chave é sorteada, respeitando o número de quadras, a duração da partida e a janela do torneio — e sabendo que ninguém joga em duas quadras ao mesmo tempo (nos grupos de Rei/Rainha os três jogos ficam em horários diferentes, como acontece de verdade). Esses horários aparecem com um <b>≈</b> e o aviso de que são <b>estimados</b>. O <b>organizador pode apontar a data e a hora direto</b> em qualquer jogo, e o que ele aponta vale — as propostas daquele jogo se encerram. E o horário já definido aparece agora <b>também nas "📣 Novidades no seu torneio"</b> e nos grupos que não são o seu: antes, num torneio de grupos, a data simplesmente não aparecia fora da tela da chave.</li>' +
        // ── ciclo 2.0.75 ───────────────────────────────────────────
        // O painel que decide bye/repescagem/espera/exclusão contava a repescagem de
        // eliminatória simples com fórmula própria, diferente da árvore que o sorteio
        // monta. MEDIDO: divergia em 272 dos 298 valores de N entre 3 e 300.
        '<li><b>🔢 A previsão do painel de resolução passa a bater com o sorteio:</b> na hora de escolher entre folga, repescagem, lista de espera ou exclusão, o painel mostra quantos jogos e quanto tempo cada opção custa — e no caso da <b>repescagem</b> ele prometia mais jogos do que o sorteio de fato gera (com 33 inscritos, 48 contra os 37 reais: quase um terço a mais de tempo). Agora a conta vem do próprio motor que monta a chave, então é o mesmo número dos dois lados.</li>' +
        // ── ciclo 2.0.72 — REVERSÃO ────────────────────────────────
        // ⚠️ SEM item pro usuário, e é DECISÃO: esta versão DESFAZ 2.0.69/70/71 e volta
        // ao código da 2.0.68, que o dono aprovou ("a versão mais aceitável que
        // chegamos"). As levas seguintes pioraram no aparelho dele — ocultar/desocultar
        // travando, toque exigindo dezenas de tentativas. Não há nada NOVO a anunciar:
        // o que o usuário vê é exatamente o que a 2.0.68 já entregava. Os itens que as
        // levas revertidas anunciavam saem junto (ver commit).
        // ── ciclo 2.0.74 ───────────────────────────────────────────
        // DUAS correções do dono na mesma régua da previsão de duração:
        // ① "é tempo por SET e não por partida — eu disse lá atrás partida quando
        //    deveria ter dito set". O rótulo do formulário dizia "Duração Média do
        //    Jogo" e era a origem do erro: set único e melhor de 3 ganhavam o mesmo
        //    tempo. ⛔ NÃO virou "Rei/Rainha × 3": MEDIDO no Confra ao vivo, o motor
        //    guarda TRÊS jogos de 1 set por grupo, então o 3× já está na contagem.
        // ② "sabemos que esses jogos ocorrerão, então o tempo tem que estar alocado".
        //    A eliminatória não sorteada valia ZERO: Confra previa 9h para ~25h30.
        '<li><b>⏱️ A previsão de duração passa a valer:</b> o tempo que você configura agora é <b>por set</b> — uma partida melhor de 3 conta ~2,5 sets e uma melhor de 5 conta ~4,5, em vez de todas valerem o mesmo. E a previsão passa a somar o <b>torneio inteiro</b>: as fases que ainda não foram sorteadas entram pelos jogos que certamente vão acontecer, calculados pelo mesmo motor que monta as chaves (com repescagem e folga no lugar certo). Antes elas valiam zero, e a conta só aparecia inteira depois do sorteio — tarde demais pra saber se o torneio cabia no dia.</li>' +
        // ── ciclo 2.0.73 ───────────────────────────────────────────
        // UMA linha, escolhida por não encostar no caminho do toque. MEDIDO no
        // aparelho do dono: tap 4014ms de ATRASO DE ENTRADA + read spike de 276
        // leituras em 10s na mesma janela.
        '<li><b>⚡ A tela para de engasgar ao ocultar, desocultar e abrir os ocultados:</b> cada um desses gestos redesenha a lista — e, quando a vitrine de torneios públicos estava vazia, o app rebuscava <b>tudo</b> do servidor a cada redesenho. Em segundos isso virava centenas de consultas, e era isso que fazia o toque demorar a responder. Agora a busca respeita um intervalo mínimo, sem deixar de ser rápida quando a tela está sem nada.</li>' +
        // ── ciclo 2.0.71 ───────────────────────────────────────────
        // MEDIDO no aparelho do dono: read spike de 276 leituras em 10s
        // (load-all-public=180) + travadas de 1,2s a 4,5s + toque com 4s de atraso.
        // Causa: `_force = curLen===0` tirava o intervalo mínimo, então TODA
        // renderização (ocultar/desocultar/expandir) disparava busca completa.
        // ── ciclo 2.0.70 ───────────────────────────────────────────
        // ⚠️ SEM item pro usuário, e é DECISÃO: é 100% instrumentação (relatório de
        // travada durante rolagem, com direção, no rastro de diagnóstico do dono).
        // Zero mudança de tela. A trava (check-release-notes) pega OMISSÃO e não sabe
        // julgar isso; a justificativa fica aqui.
        // ── ciclo 2.0.69 ───────────────────────────────────────────
        // Dois relatos do dono na melhor versão até agora ("não perca isso"):
        // (1) feedback do toque só no 3º/4º clique — REPRODUZIDO no WebKit: a guarda
        //     de inércia bloqueava o REALCE (ela é sobre navegação, não sobre feedback);
        // (2) torneio ocultado "teima em voltar" — mesma corrida do aprovar: o perfil
        //     em voo sobrescrevia a lista local com a do servidor.
        // ── ciclo 2.0.68 ───────────────────────────────────────────
        // Auditoria da minha própria leva de 4 dias: `sp-abrindo` era aceso e NUNCA
        // apagado (card esmaecido pra sempre + nó destacado preso). Verificado no
        // WebKit: 2 cards acesos → 0, referência liberada.
        '<li><b>🃏 O card não fica mais "apagado" depois de você abrir um torneio:</b> o realce que marca o card tocado ficava aceso para sempre — ao voltar para a tela inicial aquele card seguia esmaecido, como se estivesse desativado. Agora ele se apaga assim que a tela de carregando assume.</li>' +
        // ── ciclo 2.0.67 ───────────────────────────────────────────
        // Sentry do aparelho do dono: travada de 20.434ms. Causa: a "época" do cache
        // de perfis subia a CADA perfil (~111x), e o índice da 2.0.63 se reconstruía a
        // cada chamada durante a hidratação — MEDIDO: render 29ms → 172ms. Um lote =
        // uma invalidação.
        '<li><b>🧊 O travamento ao abrir/ocultar um card acabou:</b> enquanto os nomes dos jogadores chegavam do servidor, uma otimização interna se desfazia e refazia milhares de vezes — e a tela ficava congelada, às vezes por dezenas de segundos, sem responder a nada. Corrigido.</li>' +
        // ── ciclo 2.0.66 ───────────────────────────────────────────
        // O "scroll cortado" de dias: MEDIDO no HTML real da chave do Confra, no motor
        // do Safari — 324 de 324 nomes (100%) nasciam CORTADOS (texto 17px em caixa de
        // 15px), porque `.sp-name-fit` não tinha estilo e herdava a fonte do corpo.
        '<li><b>✂️ Acabou o texto cortado ao rolar:</b> os nomes dos jogadores nasciam <b>grandes demais para a caixa</b> e ficavam cortados até o ajuste automático alcançá-los — rolando, cada card novo aparecia assim. Agora o nome já nasce cabendo e só <b>cresce</b> até o tamanho final: texto inteiro em todo instante.</li>' +
        // ── ciclo 2.0.65 ───────────────────────────────────────────
        // 3 dias de "continua sem feedback de clique". A causa era de manual: o
        // navegador só pinta ENTRE tarefas, e o realce + o overlay do loader (96%
        // opaco, tela inteira) aconteciam na MESMA tarefa. PROVA por quadro no motor
        // do Safari: desenho antigo = 0 quadros com o card realçado; novo = 7.
        '<li><b>👆 Agora o card RESPONDE quando você toca:</b> ao abrir um torneio, o card ficava exatamente igual até a tela de carregando aparecer — e não era o realce que faltava, era que a tela de carregando cobria tudo <b>antes de o realce chegar a ser desenhado</b>. Agora o card escurece visivelmente primeiro e só depois o carregando assume.</li>' +
        // ── ciclo 2.0.64 ───────────────────────────────────────────
        // Print do dono no JOGO 92 do Confra: aprovou pelo feed, o app confirmou,
        // a tela não mudou — e depois o pendente tinha sumido. Corrida: o
        // carregamento do servidor substituía o array e matava a aprovação otimista.
        '<li><b>✅ Confirmar um placar pela tela inicial agora muda a tela na hora:</b> ao confirmar pelo feed, o app avisava que aprovou mas o jogo continuava aparecendo como <b>pendente</b> — e só ao entrar no torneio é que aparecia confirmado. Agora a tela é redesenhada quando a gravação volta do servidor (e, se a gravação falhar, o jogo volta a dizer <b>pendente</b> em vez de mentir que resolveu).</li>' +
        // ── ciclo 2.0.63 ───────────────────────────────────────────
        // A CAUSA RAIZ dos 3 dias, achada com profiler sobre a chave REAL do Confra:
        // _sideBelongsToUser varria os 111 inscritos a CADA lado de jogo (1.020×/render)
        // = 116.883 resoluções de nome por render, 85% da CPU. Índice O(1) → 193ms→34ms.
        '<li><b>🚀 A chave e a tela inicial ficaram muito mais rápidas no celular:</b> ao montar a tela, o app relia a lista inteira de inscritos para <b>cada lado de cada jogo</b> — numa chave grande isso passava de <b>cem mil</b> consultas repetidas e travava o telefone por segundos (no computador passava batido, porque a CPU é bem mais rápida). Agora a lista é consultada uma vez e reaproveitada: o mesmo desenho da chave ficou <b>quase 6× mais rápido</b>.</li>' +
        // ── ciclo 2.0.62 ───────────────────────────────────────────
        // A telemetria do aparelho do dono nomeou: `timeout:_pintaUmaVez=925ms` —
        // o fallback de 120ms (1.9.75) vencia o rAF com a thread ocupada e chamava
        // o render pesado ANTES de o loader virar pixel. 2,6s de toque sem resposta.
        '<li><b>⏱️ O "Abrindo o torneio…" aparece no ato do toque:</b> ao abrir um torneio, o aviso de carregando só surgia depois de a tela pesada já ter sido montada — até 2,6 segundos de toque sem resposta nenhuma. Agora o aviso é pintado <b>antes</b> de qualquer montagem, então o toque responde na hora e a espera passa a ter cara de espera.</li>' +
        // ── ciclo 2.0.61 ───────────────────────────────────────────
        '<li><b>🎾 Fila ou Jogador X — a escolha aparece na hora do W.O.:</b> ao apontar a falta, os dois caminhos ficam lado a lado ("Aplicar W.O. — entra o 1º da fila" × "W.O. + Jogador X no lugar, sem pontuar") — antes o Jogador X ficava escondido no fim da tela seguinte, e na tela de escolher substituto ele subiu pra cima da explicação.</li>' +
        // ── ciclo 2.0.55 ───────────────────────────────────────────
        // Telemetria do aparelho do dono nomeou: ~285-289ms constantes = clique
        // SINTÉTICO do WebKit (touch-action:manipulation não o mata no WKWebView).
        '<li><b>⚡ O toque no card vira clique NA HORA:</b> o iOS segurava cada toque ~0,3s antes de entregar o clique; agora o app dispara o clique no instante em que o dedo solta — o realce e o carregando chegam esse tanto mais cedo, em todos os cards que navegam.</li>' +
        // ── ciclo 2.0.51 ───────────────────────────────────────────
        // Veredito do dono na 249: "um piscar de tela PRETA é bem mais aceitável".
        '<li><b>⬛ Nenhum quadro branco sobrou:</b> o fundo do app agora é escuro desde o primeiro instante — na web e no aplicativo — então qualquer transição (abrir, atualizar, destravar o celular) no máximo dá um <b>piscar escuro</b>, nunca uma tela branca. E se um carregamento emperrar de verdade, o app <b>se recarrega sozinho</b> uma vez antes de pedir qualquer coisa a você.</li>' +
        // ── ciclo 2.0.60 ───────────────────────────────────────────
        '<li><b>📒 O histórico de W.O. do grupo virou registro de verdade:</b> antes ele era deduzido do estado do torneio, então mudava sozinho — quem voltava para a lista de espera sumia da lista, uma substituição antiga desaparecia, um W.O. revertido reaparecia. Agora cada W.O. é gravado no momento em que acontece, com quem levou, quem entrou e quando; reverter marca como desfeito em vez de apagar. Mexer no torneio depois não muda mais o que já aconteceu.</li>' +
        '<li><b>💬 O organizador vê o botão do grupo de WhatsApp em todos os jogos:</b> em qualquer grupo da rodada, inclusive nos que já terminaram e nas rodadas que ainda vão abrir. Para quem joga, continua como era: o grupo aparece no seu jogo, na sua rodada.</li>' +
        // ── ciclo 2.0.59 ───────────────────────────────────────────
        // (só rastro interno: reverter deixava a marca de substituição pendurada. Sem tela
        // nova — mas MUDA o que aparece na lista de W.O. depois de reverter, então tem item.)
        '<li><b>↩️ Reverter um W.O. apaga mesmo o registro dele:</b> a marca de "fulana entrou no lugar de sicrana" ficava guardada depois de reverter e podia reaparecer como um W.O. fantasma se a pessoa voltasse àquele grupo. Agora o registro sai junto com a reversão — e sem encostar nos outros W.O.s do mesmo grupo, nem no de um xará.</li>' +
        // ── ciclo 2.0.58 ───────────────────────────────────────────
        '<li><b>🕓 O histórico de W.O. do grupo ficou completo:</b> quem entrou no lugar de alguém e depois também levou W.O. deixava o elo anterior invisível — a tabela do grupo pulava uma pessoa e a lista mostrava um "quem substituiu quem" pela metade. Agora a corrente inteira aparece, cada um com a sua linha na classificação e a marca de W.O., mesmo quando a pessoa já voltou para a lista de espera.</li>' +
        // ── ciclo 2.0.57 ───────────────────────────────────────────
        '<li><b>↩️ Um "Reverter" para cada W.O. do grupo:</b> o botão era um só e desfazia sempre o último — grupo com dois ou três W.O.s ficava sem como desfazer os outros. Agora cada linha "fulana W.O. → sicrana" tem o seu botão, ao lado dela. Quando um W.O. só pode ser desfeito depois de outro (a pessoa que entrou também levou W.O.), o botão fica apagado e explica qual reverter primeiro.</li>' +
        '<li><b>🕓 O histórico do grupo mostra a substituição anterior:</b> quem entrou por W.O. e depois também levou W.O. deixava o elo de trás invisível — agora aparece com o nome de quem ela substituiu, inclusive quando essa pessoa já voltou para a lista de espera. E a mesma substituição não aparece mais duplicada.</li>' +
        '<li><b>💬 O organizador cria e entra nos grupos de WhatsApp dos jogos:</b> o botão do grupo de cada rodada só aparecia para quem jogava aquele grupo — e é o organizador quem costuma montar os grupos. Agora ele vê o botão em todos os grupos. Quem desligou o WhatsApp no perfil continua fora, organizador inclusive.</li>' +
        '<li><b>📋 Quem volta para a lista de espera sai da lista de W.O.:</b> depois de levar W.O. e reativar, a pessoa aparecia nos dois lugares ao mesmo tempo. Agora ela fica em um só — e no grupo onde levou o W.O. a indicação histórica continua lá, com quem entrou no lugar dela.</li>' +
        // ── ciclo 2.0.56 ───────────────────────────────────────────
        // (2.0.55 é da leva mobile — toque no touchend + telemetria, itens dela.)
        '<li><b>🎯 Substituição de W.O. agora alcança os jogos SEMPRE:</b> dois consertos da mesma regra — o card não desenha mais o parceiro duplicado quando o Jogador X está no time (a vaga dele aparece como Jogador X mesmo), e dar W.O. em quem entrou por substituição anterior troca a pessoa também nos jogos ainda não jogados, não só na classificação. Jogo já disputado continua intocável.</li>' +
        // ── ciclo 2.0.54 ───────────────────────────────────────────
        '<li><b>📞 O campo do WhatsApp no perfil voltou a se comportar:</b> a máscara aparece enquanto você digita (só números), no formato do país escolhido, e o botão <b>Verificar</b> acende assim que o número fica completo — havia um jeito de abrir o perfil em que nada disso funcionava e o botão ficava apagado pra sempre.</li>' +
        // ── ciclo 2.0.53 ───────────────────────────────────────────
        '<li><b>🔁 Todos os W.O.s do grupo ficam indicados:</b> grupo com mais de uma substituição mostrava só a última pílula — agora cada W.O. aparece ("fulana W.O. → sicrana"), inclusive a cadeia (quem entrou e depois também levou W.O.), e todo mundo que saiu por W.O. aparece na classificação do grupo, afundado no fim com a tag.</li>' +
        '<li><b>📱 Registrar contato funciona de novo — e também pela ficha:</b> o diálogo de registrar celular/letzplay dizia "Nada a registrar" com o número digitado na tela (o diálogo era removido antes de ler os campos) — corrigido. E abrindo a ficha de um participante, o organizador agora tem os campos de celular e letzplay logo abaixo do nome, salvando direto no perfil com a marca de quem registrou (a pessoa é avisada).</li>' +
        // ── ciclo 2.0.52 ───────────────────────────────────────────
        // (2.0.51 é da leva mobile — chão escuro/fallback/telemetria, itens dela.)
        '<li><b>👤 A vaga do Jogador X aparece na classificação do grupo:</b> quando um W.O. é completado com Jogador X, a tabela agora mostra a vaga dele — zerada — em vez de sumir com a linha e subir todo mundo um degrau. Ele continua sem pontuar e fora do sorteio; só a vaga fica visível, na posição que os critérios dão a uma linha zerada.</li>' +
        // ── ciclo 2.0.50 ───────────────────────────────────────────
        '<li><b>🚫 W.O. também depois das partidas jogadas:</b> o organizador pode decretar W.O. (por exemplo, por atitude antidesportiva) mesmo com o grupo já terminado. Os placares e os nomes de quem jogou ficam exatamente como estão; quem entra da lista de espera herda a vaga e a posição na classificação — a mesma regra de sempre: quem sai mantém o que fez, quem entra herda a posição.</li>' +
        '<li><b>🎾 letzplay no botão de contato:</b> além do celular, o organizador agora pode registrar a conta letzplay de um inscrito — a pessoa é avisada e pode corrigir o @ no próprio perfil. E como o histórico do letzplay é público, o toggle "Autorizar importação" saiu do perfil: criar a conta já autoriza a consulta, como passou a constar nos Termos de Uso.</li>' +
        // ── ciclo 2.0.49 ───────────────────────────────────────────
        // ⚠️ 2.0.49 NÃO ganhou item, e é DECISÃO: é a CONCLUSÃO do item 🔢 da 2.0.47 —
        // o box tinha crescido no CSS, mas a regra anti-zoom do iOS (16px !important em
        // todo input NO CELULAR) o engolia de volta; o dono testou a 2.0.47 no aparelho
        // e viu "não mudou nada", com razão. A exceção de especificidade maior entrega
        // o que o item 🔢 já prometia. Verificado com emulação touch (pointer:coarse):
        // box = número (24,65px). Anunciar de novo venderia a mesma entrega duas vezes.
        // ── ciclo 2.0.48 ───────────────────────────────────────────
        // Três relatos do dono no aparelho, mesma manhã:
        '<li><b>🧑‍🤝‍🧑 Os nomes da chave não somem mais quando a rede engasga:</b> uma busca de perfis que ficasse pendurada (acontece no celular ao voltar pro app) travava <b>todas</b> as buscas seguintes — a chave inteira ficava com "…" no lugar dos nomes até fechar o app. Agora a busca tem prazo, tenta de novo sozinha e os nomes entram assim que chegam.</li>' +
        '<li><b>🔑 Fez login, a tela já diz "Entrando…":</b> depois do aviso de login a página inicial continuava na tela por vários segundos — e dava vontade de clicar em ENTRAR de novo. Agora ela vira a tela de carregando no instante do login.</li>' +
        '<li><b>📵 Destravou o celular com o app aberto e a tela ficou branca?</b> O iOS às vezes descarta o miolo do app em segundo plano e ele voltava como um retângulo branco morto. Agora o app percebe e se recarrega sozinho (só no aplicativo instalado).</li>' +
        // ── ciclo 2.0.47 ───────────────────────────────────────────
        // Dois pedidos do dono testando a build 246 no aparelho:
        '<li><b>🔢 O box do placar ainda não lançado ficou do tamanho do placar lançado:</b> o número do resultado tinha crescido, mas o box de digitar (com o 0 dentro) continuava pequeno ao lado dele. Agora os dois seguem a <b>mesma régua</b>, em todos os cards de jogo, em qualquer fase.</li>' +
        '<li><b>👆 O toque no card ficou mais visível:</b> o escurecimento e o contorno do toque estavam sutis demais sobre cards com foto — foram reforçados, inclusive o flash instantâneo do sistema (o único que aparece quando o aparelho está ocupado).</li>' +
        // ── ciclo 2.0.46 ───────────────────────────────────────────
        // ⚠️ 2.0.46 NÃO ganhou item próprio, e é DECISÃO: ela é a CONCLUSÃO do item 📱
        // (2.0.40) no NATIVO. A passagem de bastão do splash escondia o splash nativo no
        // primeiro duplo-rAF — e no aparelho o WKWebView dispara rAF antes de compor
        // pixel: a WebView ficava preta (o dono viu na build 245 do TestFlight; o
        // simulador não reproduz). Agora o hide() espera o DOMContentLoaded + 2 rAF.
        // O que o usuário percebe é o que o item 📱 já promete: a abertura não fica
        // preta. Anunciar de novo seria vender duas vezes a mesma entrega.
        // ── ciclo 2.0.41 ───────────────────────────────────────────
        // Dois relatos do dono no mesmo dia, os dois sobre o ABRIR do torneio no
        // celular: (1) toque no card sem feedback até o loader; (2) loader saindo
        // antes de a chave ter os nomes. Um item só: é a mesma experiência.
        '<li><b>👆 Tocar no card do torneio responde na hora — e o carregando só sai com a tela pronta:</b> no celular, o toque no card não dava nenhum sinal até a tela de carregando aparecer; agora o card <b>escurece e ganha contorno no instante do toque</b> e assim fica até o aviso assumir. E ao abrir um torneio grande, o "Abrindo o torneio…" passou a segurar até a chave estar com <b>todos os nomes nos seus lugares</b> — antes a classificação vinha pronta e os nomes da chave pipocavam depois.</li>' +
        // ── ciclo 2.0.40 ───────────────────────────────────────────
        // O mutirão do celular (24/ago): tela preta na abertura (router esvaziando o
        // container + SW respondendo null + splash nativo saindo cedo), travamento de
        // segundos (motor de nomes 2.0.30/35 sem orçamento + perfilador em produção) e
        // scroll cortado (contain:paint + fit durante a rolagem + inscritos em fatias).
        // Item ÚNICO porque pro usuário é uma coisa só: o app no celular voltou a andar.
        '<li><b>📱 O aplicativo no celular voltou a ser rápido — e a abertura não fica mais preta:</b> ajustes internos recentes cobravam caro justamente no telefone: a tela podia abrir <b>preta</b>, a rolagem demorava a responder e o conteúdo <b>vinha cortado</b> ao rolar a tela inicial e o detalhe do torneio. As causas foram removidas uma a uma — o ajuste de nomes dos cards reaproveita o que já calculou, nada pesado roda enquanto você rola, e a abertura sempre mostra <b>conteúdo ou um botão de tentar de novo</b>, nunca uma tela vazia.</li>' +
        // ── ciclo 2.0.45 (conserta duas regressões que a 2.0.44 causou) ──
        '<li><b>\uD83D\uDD27 O \u201cver mais\u201d das Novidades voltou a funcionar:</b> na leva anterior ele parou de responder ao toque e a se\u00e7\u00e3o ficou com a <b>margem do topo</b> menor do que era. Os dois est\u00e3o de volta ao normal.</li>' +
        // ── ciclo 2.0.44 ───────────────────────────────────────────
        '<li><b>\uD83D\uDCCC S\u00f3 o \u201cver menos\u201d acompanha a rolagem:</b> com a se\u00e7\u00e3o de Novidades <b>fechada</b> n\u00e3o h\u00e1 lista pra percorrer \u2014 ent\u00e3o o \u201cver mais\u201d volta a ficar <b>parado</b> no cabe\u00e7alho, onde sempre esteve.</li>' +
        // ── ciclo 2.0.42 (a nota da 2.0.40 se perdeu num rebase entre sessões; vai aqui) ──
        '<li><b>\uD83D\uDCCC A etiqueta das Novidades para dentro da caixa:</b> ao rolar at\u00e9 o fim da se\u00e7\u00e3o, o \u201cver menos\u201d flutuante passava um pouco <b>para fora</b> da borda de baixo. Agora ele para com a <b>mesma folga</b> que tem no topo.</li>' +
        // ── ciclo 2.0.39 ───────────────────────────────────────────
        '<li><b>\uD83C\uDFEA Os selos das lojas ficaram do mesmo tamanho:</b> na p\u00e1gina inicial (e no convite impresso), a arte do <b>Google Play</b> aparecia menor que a da <b>App Store</b>. As duas artes oficiais s\u00e3o enquadradas de um jeito \u2014 a do Google j\u00e1 vem com uma margem em volta \u2014 e agora isso \u00e9 compensado: o selo desenhado fica do mesmo tamanho nos dois.</li>' +
        '<li><b>\uD83D\uDCCC Fechar as Novidades traz voc\u00ea de volta ao topo da se\u00e7\u00e3o:</b> d\u00e1 pra fechar l\u00e1 do fim da lista, e antes a p\u00e1gina encolhia debaixo do dedo e deixava voc\u00ea perdido no meio do que vinha depois. A etiqueta tamb\u00e9m voltou a ter a <b>mesma apar\u00eancia</b> da de \u201cSeus \u00faltimos resultados\u201d.</li>' +
        // ── ciclo 2.0.38 ───────────────────────────────────────────
        '<li><b>\uD83D\uDCCC O \u201cver menos\u201d das Novidades acompanha a rolagem:</b> com a se\u00e7\u00e3o aberta, era preciso rolar toda a lista de volta at\u00e9 o t\u00edtulo pra fech\u00e1-la. Agora a etiqueta <b>desce junto</b> enquanto voc\u00ea percorre a se\u00e7\u00e3o \u2014 e some quando ela acaba, sem atrapalhar o resto da tela.</li>' +
        // ── ciclo 2.0.37 ───────────────────────────────────────────
        // Ordem do dono lendo a leva anterior: "nada por nome porra. só uid. a menos que seja
        // digitado sem uid." Item pro usuário porque os DOIS defeitos apareciam na tela dele:
        // gente reativada sem ninguém ter pedido e a mesma pessoa contada duas vezes.
        '<li><b>\uD83D\uDD11 A pessoa \u00e9 reconhecida pela conta dela, n\u00e3o pelo nome:</b> em dois pontos o app ainda decidia \u201cquem \u00e9 quem\u201d comparando <b>nomes</b> \u2014 e nome muda (quem se renomeia) e se repete (dois hom\u00f4nimos). Ao incluir os desativados na fase seguinte, isso <b>reativava participantes que ningu\u00e9m tinha escolhido</b>; e ao lan\u00e7ar um W.O., quem tinha trocado de nome podia <b>aparecer duas vezes na lista de inscritos</b>. Agora a identidade \u00e9 a conta; o nome s\u00f3 vale pra quem foi <b>digitado \u00e0 m\u00e3o</b>, sem conta no app.</li>' +
        // ── ciclo 2.0.36 ───────────────────────────────────────────
        // Três relatos do dono no mesmo dia, todos no avanço de fase do sandbox da Confra.
        // Viram DOIS itens porque pro usuário são duas coisas: o que a busca esconde e o
        // que acontece com as pessoas (e com o relógio) quando a fase vira.
        '<li><b>\uD83D\uDD0D Buscar um nome na chave n\u00e3o esconde mais a classifica\u00e7\u00e3o do grupo:</b> ao filtrar por um nome, o grupo dessa pessoa aparecia <b>sem a tabela de classifica\u00e7\u00e3o</b> quando havia um W.O. naquele grupo. Agora a classifica\u00e7\u00e3o fica sempre de p\u00e9 \u2014 e continua sendo poss\u00edvel achar o grupo de quem <b>tomou o W.O.</b> pelo nome dela.</li>' +
        '<li><b>\u23F1\uFE0F Ao virar de fase, ningu\u00e9m vai pra lista de espera \u2014 e a contagem regressiva \u00e9 da RODADA:</b> quem estava <b>desativado</b> ou tinha levado <b>W.O.</b> era mandado pra lista de espera na virada da fase, sem ter pedido isso (a fila s\u00f3 acontece quando a pr\u00f3pria pessoa religa o bot\u00e3o <b>Ativado</b>) \u2014 e isso ainda fazia o <b>n\u00famero de inscritos aumentar</b>, contando a mesma pessoa duas vezes. O rel\u00f3gio da rodada tamb\u00e9m contava at\u00e9 o fim da <b>fase inteira</b>; agora o prazo da fase \u00e9 dividido pelo n\u00famero de rodadas e a regressiva \u00e9 <b>do fim da rodada atual</b>.</li>' +
        // ── ciclo 2.0.35 ───────────────────────────────────────────
        // A leva de tamanhos do card, refeita com o dono olhando a tela a cada passo. Item
        // ÚNICO porque pro usuário é uma coisa só: como o jogo aparece no card. A 2.0.34
        // (revert) não ganhou item, e este substitui o que a 2.0.33 tinha escrito.
        '<li><b>\uD83C\uDFBE O placar do jogo ficou leg\u00edvel em melhor de 3 e de 5:</b> na chave do computador, o placar com cinco sets ocupava tanto espa\u00e7o que <b>o nome dos jogadores virava um borr\u00e3o</b> \u2014 sobravam 8 pixels pro nome. Agora as colunas do placar s\u00e3o do tamanho do formato (mais largas em melhor de 3, mais estreitas em melhor de 5) e sobra espa\u00e7o pro nome. A palavra \u201cSet\u201d parou de se repetir coluna a coluna: aparece uma vez, e as colunas levam s\u00f3 <b>1, 2, 3, 4</b>. Os dois nomes de uma dupla passaram a <b>quebrar linha juntos</b>, e o nome curto n\u00e3o encolhe mais por causa do nome comprido do parceiro. Cards de melhor de 3 e de 5 agora t\u00eam a <b>mesma altura</b>.</li>' +
        '<li><b>\uD83D\uDCCF O card do jogo \u00e9 igual em todo lugar:</b> o card que aparece na <b>tela inicial</b> (em \u201cNovidades\u201d e \u201cSeus \u00faltimos resultados\u201d) desenhava o nome de um jeito pr\u00f3prio \u2014 e <b>cortava</b> o nome comprido com retic\u00eancias, coisa que a chave nunca fez. Agora os dois usam a mesma regra: o nome nunca \u00e9 cortado, a letra \u00e9 que cede, e o espa\u00e7o do nome \u00e9 igual pra todo participante.</li>' +
        // ── ciclo 2.0.33 ───────────────────────────────────────────
        // Cinco pedidos do dono no mesmo dia, olhando o SB da Confra. Viram TRÊS itens
        // porque pro usuário são três coisas: (a) a chave parar de pular, (b) o placar de
        // melhor de 3/5 se explicar e cobrar a margem do tie-break, (c) o card ficar legível.
        // O "Simular fase (dev)" NÃO vira item: é botão de teste, só aparece no Sandbox e só
        // pra identidade de teste — anunciar ferramenta interna é ruído pra quem joga.
        // O cabeçalho do card pendente (4 linhas → 2) entra no item (c), que é onde o
        // usuário vê a diferença: sobra card na tela.
        '<li><b>\uD83D\uDCCD A chave n\u00e3o pula mais de lugar quando voc\u00ea lan\u00e7a um placar:</b> em chave larga, bastava rolar at\u00e9 a rodada que voc\u00ea estava lan\u00e7ando e confirmar um placar \u2014 a chave <b>voltava sozinha para a Rodada 1</b> e voc\u00ea tinha que procurar o jogo de novo a cada resultado. Agora ela fica exatamente onde estava, em qualquer formato de chave.</li>' +
        '<li><b>\uD83C\uDFBE Tie-break e super tie-break avisam a diferen\u00e7a de 2 pontos ANTES:</b> empatou os sets, a linha do card j\u00e1 diz <b>\u201cSuper Tie-Break (dif 2 pts)\u201d</b> \u2014 antes de voc\u00ea entrar na quadra. No tie-break de um set, o aviso aparece junto com os campinhos de ponto. E o aplicativo passou a <b>cobrar</b> o que avisa: 10-9 no super tie-break n\u00e3o \u00e9 mais aceito. O placar que espera aprova\u00e7\u00e3o tamb\u00e9m ganhou o <b>nome de cada set em cima do n\u00famero</b> \u2014 quem vai confirmar precisa saber qual coluna \u00e9 o Set 2 e qual \u00e9 o super tie-break.</li>' +
        // ⚠️ 2.0.34 NÃO ganha item, e é DECISÃO. Ela DESFAZ o item de tamanhos que a 2.0.33
        // tinha escrito aqui (nome/foto/número maiores) e também a caixa de duas linhas da
        // 2.0.30 — ordem do dono, vendo no ar: _"reverte tudo que está uma merda"_. Anunciar
        // "voltamos ao que era" seria contar pro usuário uma ida e volta que aconteceu dentro
        // do mesmo dia e que, pra quem joga, não deixou saldo nenhum. O item da 2.0.30 (nome
        // comprido em duas linhas) sai junto, pelo mesmo motivo: a entrega não está mais no ar.
        // A justificativa fica aqui, pro próximo leitor não achar que faltou.
        // ── ciclos 2.0.30 + 2.0.31 ───────────────────
        // Substitui o item do ciclo 2.0.29 (que descrevia a MESMA entrega pela metade: lá o
        // nome parava de ser cortado, mas continuava encolhendo numa linha só). Item único,
        // porque pro usuário é uma coisa só — como o nome dele aparece no card do jogo.
        // O ciclo 2.0.31 entra AQUI pelo mesmo motivo, e não como item próprio: a causa dele
        // é técnica (um `class` duplicado fazia o navegador descartar a classe do nome, então
        // `.sp-mc-nm` nunca valia ali), mas o que o usuário VÊ é a última frase deste item —
        // o nome no peso certo. As outras duas metades da classe (`nowrap` e o alinhamento da
        // coroa) são invisíveis por si só: elas só sustentam a quebra em duas linhas descrita
        // acima, que faz `whiteSpace = ''` contando com o nowrap vir do CSS.
        // ── ciclo 2.0.27 ─── (os 5 acertos do melhor de 3/5 vistos no sandbox pelo dono;
        //     o item do ciclo 2.0.26 abaixo descreve a entrega, este descreve o que mudou nela)
        '<li><b>🎾 O placar por set ficou no lugar em tela estreita — e o box do próximo set nasce zerado:</b> com a fonte grande, o card passava da borda e o <b>✓ Confirmar</b> aparecia cortado; agora o card para na largura da tela. E confirmar um set não copia mais o placar dele para o box seguinte — o Set 2 (e o super tie-break, na melhor de 3 ou de 5) começa em branco, como tem que ser. O box do super tie-break passou a ser rotulado <b>STB</b>, já que a linha de cima escreve o nome inteiro, e essa linha ganhou <b>cor de destaque</b>. Quando o jogo termina, ela some: fica só o placar dos sets.</li>' +
        // ── ciclo 2.0.26 ───────────────────────────────────────────
        // Voz do que o USUÁRIO vê. As causas (plano de sets canônico, --scroll-anchor,
        // validade de presença na leitura, recuperação de uid no slot) estão nos commits.
        '<li><b>🎾 Melhor de 3 e melhor de 5 agora têm um box por set:</b> o card do jogo ganhou uma linha dizendo <b>“Melhor de 3 · Set 1”</b> e um <b>quadradinho de placar para cada set</b>, com o nome dele em cima (Set 1, Set 2, Super Tie-Break). Confirmou o set, o placar dele fica à esquerda e nasce o box do próximo, zerado. Empatou os sets? A linha já avisa que o próximo é o <b>Super Tie-Break</b>, antes de você entrar na quadra — e quem fecha em 2×0 (ou 3×1, na de 5) simplesmente nunca vê esse box, porque ele não aconteceu. O card de <b>1 set</b> continua exatamente como estava.</li>' +
        '<li><b>⏱️ Presença agora vale por 24 horas:</b> a presença que você marca vale para o dia de jogo e depois some sozinha. Antes ela ficava para sempre, e num torneio que atravessa semanas apareciam pessoas “presentes” desde o primeiro dia — <b>uns com presença, outros não, sem motivo visível</b>. Em torneio com rodadas separadas por mais de um dia a presença deixa de atrapalhar: o que vale ali é a <b>data e hora do jogo</b>. Marcação de W.O. não é presença e continua valendo normalmente.</li>' +
        '<li><b>👤 Quem mudou o nome no perfil não aparece mais com o nome antigo na chave — e a classificação voltou a contar essa pessoa no lugar certo:</b> em alguns jogos gerados por fase o aplicativo tinha perdido a ligação entre a pessoa e a conta dela, e passava a mostrar o nome congelado do dia da inscrição. Era mais do que um rótulo velho: sem essa ligação, quem estava nessa situação <b>entrava na eliminatória sem identidade</b> — no torneio de exemplo eram quatro pessoas, e os confrontos da fase seguinte saíam montados sem elas contarem direito na classificação do grupo. Agora o aplicativo reencontra a conta, exibe o nome do <b>perfil</b> e conta cada um no lugar certo.</li>' +
        '<li><b>👁 O botão “Fase anterior” parou de ficar escondido atrás da barra de busca:</b> na chave, o botão vertical à esquerda aparecia cortado pela metade (dava para ler só “Fase a”). Ele passou a se posicionar abaixo de tudo o que fica grudado no topo, e aparece inteiro.</li>' +
        '<li><b>↔️ O “Aplicar W.O.” voltou a ficar alinhado com “Ao Vivo” e “Confirmar”:</b> no cabeçalho do card ele nascia deslocado dos vizinhos. Agora os botões da mesma linha têm sempre a mesma altura — a do mais alto — e ficam alinhados em cima e embaixo.</li>' +
        // ── ciclo 2.0.23 ─── (o item abaixo ganhou a alça/✕ no meio: a linha de Pontos
        //     Avançados perdia o `display:flex` ao reaparecer — ver o commit. Continua
        //     UM item só: pro usuário é a mesma entrega, agora inteira.)
        // ── ciclo 2.0.21 ─── (o item do ✕/ℹ️ abaixo foi reescrito, não duplicado:
        //     o ℹ️ saiu de perto do ✕ e foi pro texto em cinza. Pedido do dono no
        //     mesmo dia, olhando a tela — a nota descreve o estado FINAL.)
        // ── ciclo 2.0.20 ─────────────────────────────────────────────────────
        // Voz do que o USUÁRIO vê. As três entregas do dia: o auto-W.O., o rótulo do botão
        // e as duas leituras de tela (proporção em % / linha dos critérios de desempate).
        '<li><b>🚫 Não vai dar pra jogar? Agora você mesmo dá o seu W.O.:</b> tocar em <b>Aplicar W.O.</b> e escolher o <b>seu próprio nome</b> abre um aviso do que vai acontecer com o jogo — e, confirmando, o W.O. <b>vale na hora</b>, sem depender de ninguém confirmar. Antes o aviso ficava parado esperando a confirmação do outro lado, que num jogo de 1×1 é justamente quem ganha com a sua falta. Apontar a falta de <b>outra pessoa</b> continua igual: o outro lado confirma ou contesta. E quando você joga de dupla numa eliminatória, quem fica no jogo é que escolhe como ele continua (suplente, Jogador X ou o adversário avançar).</li>' +
        '<li><b>🔴 O botão de W.O. ficou igual em todas as telas:</b> ele agora diz <b>“Aplicar W.O.”</b> — em duas linhas e fonte menor, pra ocupar pouca largura ao lado de <b>Ao Vivo</b> e <b>Confirmar</b>. Antes cada tela escrevia o rótulo do seu jeito (num lugar “W.O.”, noutro “W.O. do time”), e “W.O.” sozinho se confundia com o <b>selo</b> de quem levou W.O. na tabela.</li>' +
        '<li><b>⚖️ A proporção do sorteio agora fala em porcentagem:</b> no bloco <b>Proporção do sorteio</b> o número grande em verde passou a ser o percentual (<b>25% / 75%</b>), com a composição de homens e mulheres logo abaixo (<b>1H / 3M</b>), e as marcas do slider também viraram porcentagem. É como o valor fica gravado e como ele é falado no resto do app.</li>' +
        '<li><b>✕ A lista de critérios de desempate parou de embolar em tela estreita:</b> em <b>Pontos Avançados</b>, <b>Força dos Adversários</b> e <b>Qualidade das Vitórias</b> a explicação em cinza empurrava o <b>✕</b> pro meio da linha. Agora a explicação desce pra segunda linha quando não cabe e o <b>✕</b> fica sempre <b>colado na direita</b>. O <b>ℹ️</b> ficou junto do texto em cinza que ele explica (“…configurados”, “(Buchholz)”, “(Sonneborn-Berger)”), do tamanho da leitura e <b>sem lavagem</b> (o cinza da explicação descolorava o ℹ️ junto) — quem procura a explicação olha pra ela, não pro botão de remover. E o critério com explicação passou a caber em <b>duas linhas</b>: o título em cima, a explicação inteira embaixo (antes ela mesma quebrava em duas e o item ocupava a altura de quatro), com a <b>alça de arrastar e o ✕ no meio da altura</b>, como nos demais.</li>' +
        // ── ciclo 2.0.19 ─────────────────────────────────────────────────────
        // Voz do que o USUÁRIO vê. A causa (classifCongelada + a régua unificada) está no commit.
        '<li><b>🔒 A classificação do grupo que terminou não muda mais:</b> assim que os jogos de um grupo acabam, a <b>ordem publicada vira definitiva</b> — as pessoas já sabem em que posição ficaram e com quem vão jogar na próxima fase, e melhoria futura na régua de desempate não reordena mais o que já foi publicado. Grupo com jogo pendente segue sendo recalculado normalmente. Junto disso, a classificação da tela e a <b>chave da fase seguinte passaram a concordar</b>: em 3 grupos elas discordavam, e era por isso que uma dupla aparecia num jogo da linha Ouro sem estar na lista de Ouro.</li>' +
        // ── ciclo 2.0.18 ─────────────────────────────────────────────────────
        '<li><b>⚖️ Os critérios de desempate que você configura agora valem de verdade — e na sua ordem:</b> na hora de decidir <b>quem é repescado</b> numa eliminatória e de classificar quem não avançou da fase de grupos, o app usava uma régua própria: um critério que não está na tela decidia primeiro, e <b>Pontos Avançados, Buchholz e Sonneborn-Berger simplesmente não contavam</b>. Dava para reordenar ou excluir critérios na tela sem que nada mudasse. Agora todos os caminhos usam a <b>mesma régua</b>, na ordem que você deixou — mexeu na configuração, muda o resultado.</li>' +
        // ── ciclo 2.0.17 ─────────────────────────────────────────────────────
        '<li><b>🖼️ Foto e nome certos em todo lugar onde aparece gente:</b> nos cards de dupla, no convite de parceria pendente e nas linhas de jogador do painel, a foto era desenhada a partir do <b>nome</b> — e quando o perfil ainda não tinha carregado, saía o <b>mesmo círculo vazio para todo mundo</b> e o nome ficava em branco. Agora essas telas identificam a pessoa pela conta dela, então foto e nome se preenchem sozinhos assim que o perfil chega.</li>' +
        // ── ciclo 2.0.16 ─────────────────────────────────────────────────────
        '<li><b>🔎 Procurar por quem levou W.O. agora mostra o grupo dele:</b> ao buscar o nome de alguém que levou W.O., aparecia só o chip solto na caixa de W.O. — sem dizer de que grupo a pessoa era nem quem entrou no lugar dela. Acontecia porque quem leva W.O. sai dos jogos (o substituto assume a vaga), e a busca só enxergava os nomes dentro dos jogos. Agora o <b>grupo inteiro aparece</b>, com a linha “🔁 Fulana W.O. → Beltrana” e a classificação — e a busca funciona tanto pelo nome de <b>quem saiu</b> quanto pelo de <b>quem entrou</b>.</li>' +
        // ── ciclo 2.0.15 ─────────────────────────────────────────────────────
        // Escrito na voz do que o USUÁRIO vê. A causa (o _rewriteSlot com clearResults)
        // está no commit; aqui o que importa é a garantia: placar lançado não se mexe.
        '<li><b>🔒 Jogo que já tem placar nunca é reescrito:</b> quando alguém sai do grupo e a pessoa da lista de espera assume a vaga, os <b>jogos já realizados ficam exatamente como estavam</b> — com o nome de quem jogou e o placar que foi lançado. Quem entra herda a <b>posição na classificação</b>, não o passado: joga daí em diante. Antes, aplicar o W.O. num grupo já encerrado trocava o nome dentro dos jogos antigos e apagava os placares.</li>' +
        // ── ciclo 2.0.14 ─────────────────────────────────────────────────────
        '<li><b>🔁 A vaga de quem sai depois do sorteio é ocupada na hora por quem está esperando:</b> sair do torneio quando você já está num grupo passou a valer como <b>W.O.</b> — e o W.O. já sabe chamar a lista de espera. Entra a <b>próxima pessoa que mantém a proporção de homens e mulheres</b> do grupo (quando a proporção está travada), ela assume a vaga até o fim do torneio, e todo mundo do grupo é avisado. Antes a vaga simplesmente ficava sem dono.</li>' +
        // ── ciclo 2.0.13 ─────────────────────────────────────────────────────
        // O item do </div> descreve o que o USUÁRIO viu (o formulário abrindo em branco),
        // não a causa técnica — ela está no commit 09c89d4b. Os outros três são entrega
        // nova: fase 2 por grupo, organizadores com nome/foto, e a desinscrição que
        // deixava vaga fantasma no grupo.
        '<li><b>🛠️ Criar e editar torneio voltaram a abrir:</b> por algumas horas, clicar em <b>Editar</b> abria um formulário <b>em branco</b>, com o título “Criar Novo Torneio” — e criar também não funcionava. Era um erro nosso, introduzido no ajuste anterior, e nada aparecia no caminho pra avisar. Já corrigido, com uma trava nova pra essa família de erro não passar de novo.</li>' +
        '<li><b>🥇 A eliminatória do Rei/Rainha forma as duplas <b>dentro do grupo</b>:</b> quando a classificatória é uma rodada de Rei/Rainha e você escolhe que <b>todos</b> avançam com estratégia <b>Performance</b>, a dupla <b>Ouro</b> é o 1º + 2º <b>do mesmo grupo</b> e a <b>Prata</b> é o 3º + 4º — como acontece na quadra. Antes o app juntava pelo ranking geral do torneio, e as duplas saíam com gente de grupos diferentes. E o sorteio dos confrontos agora <b>semeia por cabeça de chave</b>: as melhores duplas de cada linha só se cruzam no fim, em vez de a ordem sair pela letra do grupo.</li>' +
        '<li><b>👥 Nome e foto de quem organiza param de sumir:</b> na seção <b>Organização</b>, as co-organizadoras apareciam como um círculo vazio e <b>sem nome nenhum</b>. O nome era escrito antes de o perfil chegar e ficava congelado vazio para sempre; o ícone, que nasce do nome, virava o mesmo círculo mudo para todo mundo. Agora nome e foto se preenchem sozinhos quando o perfil chega — e o mesmo conserto vale para os cards de inscrito, o painel de jogos, as enquetes e a lista de convite.</li>' +
        '<li><b>🚪 Sair do torneio depois do sorteio não apaga mais a sua vaga:</b> quem se desinscrevia <b>depois</b> de já estar num grupo sumia da lista de inscritos, mas continuava ocupando o lugar no grupo — os números do torneio paravam de fechar e ninguém era avisado. Agora, com o sorteio feito, sair <b>desativa</b> a pessoa (como no W.O.): ela para de jogar, a vaga e o histórico continuam no lugar, e o organizador é avisado. Antes do sorteio, nada muda — sair continua sendo sair.</li>' +
        // ── ciclo 2.0.10 ─────────────────────────────────────────────────────
        // Ordem do dono (22/ago/2026): "que 2.1 porra. 2.0.x" — o MINOR é o da LOJA,
        // e a loja está em 2.0. Patch novo entra NESTE bloco, não abre bloco novo.
        '<li><b>\uD83C\uDFBE Onde o set empata agora \u00e9 uma chave dentro do <b>Formato da Partida</b> \u2014 uma em cada fase:</b> havia uma se\u00e7\u00e3o solta \u201cTie-break do set\u201d fora do formato, e ela valia sempre pela <b>primeira</b> fase: numa fase 2 com formato pr\u00f3prio, a tela prometia um set e o jogo jogava outro. Agora \u00e9 um bot\u00e3o <b>Set curto</b> ao lado dos formatos, e a classificat\u00f3ria e a elimina\u00f3ria podem ser diferentes. Ligado, o set empata em 5-5 e fecha em 6-5; desligado, empata em 6-6 e fecha em 7-6.</li>' +
        '<li><b>\uD83D\uDCDD E os bot\u00f5es de formato pararam de mentir sobre o tie-break:</b> a descri\u00e7\u00e3o embaixo de cada formato dizia sempre \u201cem 5-5\u201d, mesmo num torneio configurado para 6-6. Agora ela l\u00ea a <b>sua</b> escolha, e acompanha tamb\u00e9m o n\u00famero de games (num set de 4, ela diz 3-3).</li>' +
        '<li><b>\u2696\uFE0F A propor\u00e7\u00e3o de homens e mulheres do sorteio virou um <b>controle deslizante</b> \u2014 e \u00e9 o mesmo nas duas telas:</b> a configura\u00e7\u00e3o do torneio e a lista de espera tinham controles separados, que podiam mostrar coisas diferentes. Agora \u00e9 um s\u00f3: voc\u00ea arrasta entre <b>1H/3M</b>, <b>2H/2M</b> e <b>3H/1M</b> e v\u00ea a composi\u00e7\u00e3o em cima do valor. Mudou num lugar, mudou no outro \u2014 inclusive a chave de <b>travar</b>.</li>' +
        '<li><b>\uD83E\uDDF9 A op\u00e7\u00e3o \u201cSem regra\u201d saiu, porque ela n\u00e3o era verdade:</b> mesmo sem regra escolhida, o sorteio continuava espalhando a minoria \u2014 por outro caminho, invis\u00edvel para quem organiza. Agora o padr\u00e3o \u00e9 <b>50/50</b> e o espalhamento s\u00f3 acontece com a propor\u00e7\u00e3o <b>destravada</b>. O que est\u00e1 na tela \u00e9 o que o sorteio faz.</li>' +
        '<li><b>\uD83D\uDC65 A se\u00e7\u00e3o da propor\u00e7\u00e3o some quando n\u00e3o h\u00e1 o que proporcionar \u2014 e diz por qu\u00ea:</b> em torneio com categorias por g\u00eanero, ou em que s\u00f3 h\u00e1 mulheres inscritas, ela sai de cena com uma linha explicando. Antes sumia calada, e dava a impress\u00e3o de que faltava alguma coisa.</li>' +
        '<li><b>\uD83D\uDCF1 Registrar o contato de quem n\u00e3o recebe SMS: agora d\u00e1 pra escolher o pa\u00eds:</b> a tela cravava <b>+55</b>, e n\u00famero de fora do Brasil era recusado. Agora tem a mesma lista de pa\u00edses do login, a <b>pontua\u00e7\u00e3o aparece sozinha</b> conforme voc\u00ea digita (voc\u00ea s\u00f3 digita n\u00fameros) e trocar o pa\u00eds reescreve o que j\u00e1 estava no campo.</li>' +
        '<li><b>\uD83D\uDCF1\uD83D\uDCAC No card do inscrito: quem <b>n\u00e3o tem</b> celular mostra <b>contato</b> escrito, quem <b>tem</b> mostra o bal\u00e3ozinho do WhatsApp:</b> s\u00e3o duas coisas diferentes. Falta de contato \u00e9 pend\u00eancia e precisa ser vista \u2014 por isso vem com a palavra escrita, em \u00e2mbar pontilhado, e leva ao registro do celular. Quem j\u00e1 tem n\u00e3o \u00e9 pend\u00eancia: ali o bot\u00e3o <b>abre a conversa</b> direto no WhatsApp (verde quando a pr\u00f3pria pessoa confirmou por SMS, \u00e2mbar quando o n\u00famero foi registrado pela organiza\u00e7\u00e3o). Quem escondeu o n\u00famero no perfil n\u00e3o vira bot\u00e3o de conversa pra ningu\u00e9m.</li>' +
        '<li><b>\uD83D\uDC64 \u201cEssa conta \u00e9 sua?\u201d \u2014 dizer <b>sim</b> agora J\u00c1 resolve:</b> quem entrava por um caminho diferente do de sempre (por exemplo, Google em vez da senha) criava uma segunda conta e recebia o aviso. Ao confirmar, o app apenas abria o <b>perfil</b> \u2014 uma tela cheia de campos, sem dizer o que fazer. Agora ele <b>manda o link na hora</b> e mostra para qual e-mail foi: basta abrir e clicar em \u201cUnir minhas contas\u201d. Voc\u00ea passa a entrar por qualquer um dos dois logins, e cai sempre na conta com os seus torneios.</li>' +
        '<li><b>\u2709\uFE0F E o aviso parou de oferecer um caminho que n\u00e3o existia:</b> ele dizia \u201cconfirme por e-mail ou celular\u201d mesmo quando a outra conta <b>n\u00e3o tinha celular</b> \u2014 e a pessoa ia tentar o SMS \u00e0 toa. Agora s\u00f3 aparece o canal que aquela conta realmente tem, com o endere\u00e7o \u00e0 vista.</li>' +
        '<li><b>\uD83E\uDD16 O aplicativo chegou \u00e0 <b>Google Play</b> \u2014 e a tela inicial passa a mostrar os selos das <b>duas</b> lojas:</b> at\u00e9 agora s\u00f3 saía o da <b>App Store</b>, e n\u00e3o por esquecimento: a ficha da Play ainda n\u00e3o estava p\u00fablica, e um selo que leva pra \"p\u00e1gina n\u00e3o encontrada\" \u00e9 pior que selo nenhum. Com a ficha no ar, quem abre o site pelo <b>Android</b> tamb\u00e9m recebe o bot\u00e3o <b>Baixar na Google Play</b>, que at\u00e9 hoje ficava escondido. No <b>convite impresso</b> os dois selos j\u00e1 vinham saindo desde antes \u2014 ali eles anunciam onde o app <b>vai</b> estar, e quem imprime \u00e9 o organizador, que conhece o contexto.</li>' +
        '<li><b>\uD83D\uDCBB O aviso \u201cbaixe o app da loja\u201d parou de aparecer no <b>computador</b>:</b> quem tinha salvado o scoreplace como \u00edcone <b>no PC</b> recebia o mesmo aviso do celular \u2014 e o bot\u00E3o dele levava \u00e0 <b>App Store</b>, uma ficha que no navegador do computador <b>n\u00e3o instala nada</b>. Pior: o aviso ensina a <b>remover</b> o \u00edcone, e no computador <b>n\u00e3o existe app pra colocar no lugar</b> \u2014 quem seguisse a instru\u00e7\u00e3o ficaria sem nada. Agora ele s\u00f3 aparece no <b>celular</b>, e s\u00f3 quando a loja daquele aparelho j\u00e1 tem o app publicado.</li>' +
        '<li><b>\u1F4F1 O bot\u00E3o de confirmar o celular agora ACENDE quando o n\u00FAmero fica completo:</b> quem digitava o celular no perfil e apertava <b>Salvar</b> n\u00E3o salvava nada \u2014 o n\u00FAmero s\u00F3 entra depois de confirmado por SMS, e nada na tela dizia isso antes de a pessoa errar o caminho. Muita gente saiu do perfil achando que tinha cadastrado o celular. Agora o bot\u00E3o <b>Verificar</b> fica apagado enquanto falta n\u00FAmero e <b>acende</b> assim que ele fica completo, mostrando onde tocar. E a tela passa a explicar <b>por que</b> confirmamos: \u00E9 por seguran\u00E7a e autenticidade \u2014 impede que algu\u00E9m cadastre o celular de outra pessoa e faz um erro de digita\u00E7\u00E3o aparecer na hora, em vez de o n\u00FAmero ficar errado sem ningu\u00E9m notar.</li>' +
        '<li><b>\u1F4AC Se voc\u00EA ainda n\u00E3o tem celular no perfil, o app leva voc\u00EA at\u00E9 l\u00E1:</b> ao entrar, aparece um convite lembrando que <b>o celular \u00E9 o seu WhatsApp</b> \u2014 e que \u00E9 por ali que os jogos s\u00E3o combinados. Sem ele, quem for jogar com voc\u00EA n\u00E3o tem como te chamar. Tocar em <b>Cadastrar agora</b> abre o perfil <b>direto no campo do celular</b>, j\u00E1 aberto e destacado, em vez de deixar voc\u00EA procurando. <b>Nada fica travado</b>: d\u00E1 pra fechar e usar o app inteiro \u2014 o convite volta no dia seguinte, e some de vez assim que o celular estiver l\u00E1. Quem j\u00E1 tem celular nunca v\u00EA esse aviso.</li>' +
        '<li><b>\uD83C\uDFBE O formato da partida de cada fase \u2014 agora de verdade, na tela:</b> a se\u00e7\u00e3o <b>Formato da Partida</b> era anunciada como sendo de cada fase, mas continuava aparecendo <b>solta acima das fases</b>, com cara de formato \u00fanico do torneio inteiro. Agora ela vive <b>dentro de cada fase</b> \u2014 uma na classificat\u00f3ria (roxa), outra na eliminat\u00f3ria (\u00e2mbar) \u2014 e as duas s\u00e3o o <b>mesmo controle</b>: a grade de 1&nbsp;Set / Melhor de 3 / Melhor de 5 / Personalizado. N\u00e3o h\u00e1 chave nenhuma pra ligar: a grade j\u00e1 vem acesa no formato que aquela fase <b>vai</b> jogar, e escolher outro \u00e9 o que d\u00e1 a ela um formato pr\u00f3prio. Escolher de volta o mesmo da classificat\u00f3ria faz a fase <b>voltar a acompanh\u00e1-la</b>. D\u00e1 pra fazer, por exemplo, <b>Rei/Rainha em 1 set</b> na classificat\u00f3ria e <b>melhor de 3 com super tie-break</b> na eliminat\u00f3ria.</li>' +
        '<li><b>\uD83D\uDD14 A notifica\u00e7\u00e3o que voc\u00ea acabou de ler parou (de novo) de pular pro fim:</b> as que ficam 5 segundos na tela contam como lidas \u2014 isso continua \u2014 mas o cart\u00e3o <b>fica no topo</b> at\u00e9 voc\u00ea sair e voltar. O conserto anterior tratava qualquer atualiza\u00e7\u00e3o de tela como \"entrei agora\", e a pr\u00f3pria marca\u00e7\u00e3o de lida provocava uma dessas atualiza\u00e7\u00f5es \u2014 ou seja, ler a notifica\u00e7\u00e3o era o que a derrubava. Agora s\u00f3 <b>entrar na tela</b> reorganiza a lista.</li>' +
        '<li><b>\u2600\uFE0F No tema claro, o quadro do placar voltou a aparecer:</b> em jogo <b>sem resultado</b>, o quadro de cada time sumia no branco \u2014 tanto o fundo quanto a tarja lateral eram claros demais para se ver. Agora as duas cores t\u00eam valor pr\u00f3prio em cada tema.</li>' +
        '<li><b>\uD83D\uDFE5 Em <b>Seus \u00faltimos resultados</b>, o placar de quem perdeu agora \u00e9 vermelho:</b> a regra j\u00e1 valia na chave (n\u00famero verde para quem venceu, vermelho para quem perdeu), mas essa lista da tela inicial tinha ficado de fora e mostrava o perdedor em cinza.</li>' +
        '<li><b>\uD83D\uDC65 Na partida casual, ningu\u00e9m mais joga contra si mesmo:</b> a mesma pessoa aparecia nos <b>dois times</b>, e as vagas restantes viravam \"Jogador 2\" e \"Jogador 4\". A sala guardava quem estava nela em tr\u00eas listas que podiam discordar entre si; agora ela confere as tr\u00eas, e uma sala que j\u00e1 esteja assim se corrige sozinha.</li>' +
        '<li><b>\uD83D\uDEAA A partida casual n\u00e3o prende mais voc\u00ea numa tela de espera:</b> ao fechar o placar aparecia <b>\"Aguardando confirma\u00e7\u00e3o \u2014 o outro jogador precisa confirmar o encerramento\"</b>, em tela cheia, com um bot\u00e3o s\u00f3: Cancelar. A sa\u00edda de emerg\u00eancia s\u00f3 aparecia <b>12 segundos</b> depois. E o pior: a espera come\u00e7ava mesmo quando os advers\u00e1rios eram <b>vagas sem conta</b> (\"Jogador 2\", \"Jogador 4\") \u2014 gente que nunca teria como confirmar. Agora \u00e9 uma pergunta e pronto: voc\u00ea confirma o encerramento e a partida fecha na hora. Quem estiver jogando junto \u00e9 avisado de que ela terminou.</li>' +
        '<li><b>\uD83D\uDD35\uD83D\uDD34 Na montagem dos times, cada lado volta a ter a sua cor:</b> ao formar as duplas \u00e0 m\u00e3o, <b>todos os cart\u00f5es ficavam da mesma cor</b> e a divis\u00e3o dos times sumia da tela. Era o realce de \"jogador vinculado\" pintando por cima da cor do time \u2014 e formar time \u00e0 m\u00e3o \u00e9 justamente vincular gente de verdade. Agora a cor diz de que <b>lado</b> se joga, e o v\u00ednculo se anuncia pela <b>foto</b> da pessoa.</li>' +
        '<li><b>\uD83C\uDFC5 A classifica\u00e7\u00e3o recuperou vit\u00f3rias que estava jogando fora:</b> o mesmo defeito do placar com dois perdedores atingia a <b>tabela</b>. Quando o nome gravado do vencedor n\u00e3o batia mais com a dupla (porque algu\u00e9m foi substitu\u00eddo ou trocou de parceiro depois do jogo), a conta n\u00e3o reconhecia <b>nenhum</b> dos dois lados \u2014 e a vit\u00f3ria simplesmente <b>sumia</b> da classifica\u00e7\u00e3o, do campe\u00e3o e do p\u00f3dio. Agora quem venceu \u00e9 decidido pela <b>identidade</b> de quem jogou, em <b>todo</b> o app: classifica\u00e7\u00e3o, chave, p\u00f3dio, confrontos diretos, compartilhamento. No torneio da Confra isso devolveu <b>6 vit\u00f3rias</b> \u00e0 tabela \u2014 3 jogos, as duas pessoas de cada dupla vencedora. Nem uma a mais: est\u00e1 medido.</li>' +
        '<li><b>\uD83D\uDFE9\uD83D\uDFE5 O placar parou de mostrar <b>dois perdedores</b>:</b> na dashboard, em <b>Novidades no seu torneio</b>, aparecia jogo com os DOIS n\u00fameros em vermelho e nenhuma tarja verde \u2014 1 e 6, os dois como se tivessem perdido. O vencedor \u00e9 gravado como o <b>nome da dupla</b> (\"Fulano / Ciclano\"), e esse nome deixa de bater com o time quando a dupla muda depois do resultado. A\u00ed o app n\u00e3o reconhecia nenhum dos dois lados como vencedor. Agora quem venceu \u00e9 resolvido por uma <b>regra \u00fanica</b>: primeiro pelo nome, depois pela <b>identidade</b> de quem jogou e, na falta das duas, pelo <b>pr\u00f3prio placar</b> do jogo. E, mais importante, o problema <b>parou de nascer</b>: todo resultado lan\u00e7ado agora \u2014 pelo placar ao vivo, pela entrada de resultado ou ao aprovar um placar pendente \u2014 guarda <b>quem</b> venceu, e n\u00e3o s\u00f3 o nome da dupla. Trocar de parceiro ou de nome depois do jogo n\u00e3o apaga mais o vencedor. Onde n\u00e3o h\u00e1 resultado nada muda \u2014 continua cinza.</li>' +
        '<li><b>\u23F1\uFE0F Voc\u00ea escolhe o que acontece no empate de games \u2014 e em QUE empate:</b> a configura\u00e7\u00e3o do formato tinha uma chave liga/desliga do tie-break, e \"desligado\" nunca dizia o que aconteceria. Agora s\u00e3o duas escolhas \u00e0 vista: <b>em que empate</b> (5-5, 6-6 ou <b>7-7</b>, que n\u00e3o existia) e <b>o que acontece ali</b> \u2014 <b>\u23F1\uFE0F Prorrogar</b> (segue at\u00e9 algu\u00e9m abrir 2 games) ou <b>\u26A1 Tie-break</b>. Duas corress\u00f5es v\u00eam junto: o <b>placar ao vivo ignorava</b> a escolha 5-5/6-6 e come\u00e7ava o tie-break sempre em 5-5 \u2014 a tela prometia uma coisa e a quadra jogava outra; e <b>prorrogar simplesmente n\u00e3o existia</b> em torneio, embora o motor j\u00e1 soubesse fazer. Torneio j\u00e1 criado <b>n\u00e3o muda de comportamento</b>: tie-break ligado vira \"tie-break\", desligado vira \"prorrogar\", que \u00e9 o que a chave j\u00e1 significava.</li>' +
        '<li><b>\uD83E\uDDEE E a conta do resumo estava errada:</b> ele dizia que um tie-break de 7 se prolonga a partir de <b>5 a 5</b>. N\u00e3o se prolonga \u2014 em 5-5 ainda d\u00e1 pra fechar em 7-5. Quem prolonga \u00e9 o <b>6-6</b>. E a frase usava \"prorroga\" dentro do tie-break, que \u00e9 a palavra do <b>set</b>: virou \"segue at\u00e9 algu\u00e9m abrir 2 pontos\".</li>' +
        '<li><b>\uD83C\uDFBE O tie-break e o super tie-break pararam de parecer a mesma coisa:</b> o texto do formato dizia s\u00f3 \"2 sets de 6 games + Super TB 10 no 3\u00ba set\" e <b>escondia</b> que os sets normais t\u00eam tie-break \u2014 dava a impress\u00e3o de duas regras brigando pelo mesmo jogo. Agora ele diz onde cada uma vale: <b>2 sets de 6 games (TB7 em 5-5) + Super TB 10 se ficar 1-1</b>. E o super tie-break avisa que usa a <b>mesma diferen\u00e7a m\u00ednima</b> do tie-break \u2014 a 10 com 2 de vantagem, ou seja, 10-9 n\u00e3o fecha. O texto \u00e9 o <b>mesmo nas duas fases</b>.</li>' +
        '<li><b>\u2716\uFE0F No <b>T\u00e9rmino da fase</b>, o \u2715 voltou pra linha da data:</b> em tela de celular ele descia sozinho e virava um bot\u00e3o vermelho solto embaixo do campo.</li>' +
        '<li><b>\uD83D\uDC4B Quem entra com a Apple n\u00e3o vira mais "Jogador sem perfil" \u2014 nem aparece com o e-mail no lugar do nome:</b> duas coisas quebravam a\u00ed. Uma: se a rede engasgasse logo depois do login (\u00e9 o instante mais fr\u00e1gil, voltando da tela da Apple), o <b>cadastro n\u00e3o chegava a ser criado</b> \u2014 a pessoa entrava, mas para o aplicativo ela n\u00e3o existia: n\u00e3o aparecia na busca, n\u00e3o entrava em lista de espera, n\u00e3o conseguia se inscrever, e quem organiza via <b>"Jogador sem perfil"</b> na lista. Agora o cadastro \u00e9 criado logo no in\u00edcio, cada espera tem prazo, e a grava\u00e7\u00e3o tenta de novo antes de desistir. Outra: a Apple s\u00f3 envia o seu nome no <b>primeiro</b> acesso, e ele chegava tarde demais \u2014 o aplicativo acabava gravando o <b>seu e-mail como se fosse o seu nome</b>, e era assim que voc\u00ea aparecia para os organizadores. O nome da Apple agora \u00e9 guardado e usado, e quem j\u00e1 est\u00e1 com o e-mail no lugar do nome <b>se corrige sozinho</b> no pr\u00f3ximo acesso. Quando a Apple n\u00e3o manda nome nenhum (acontece com o <b>e-mail oculto</b>), o aplicativo <b>pergunta</b> como te chamar em vez de publicar o seu endere\u00e7o.</li>' +
        '<li><b>\uD83D\uDD22 O mesmo n\u00famero no site e no aplicativo:</b> daqui pra frente a vers\u00e3o que voc\u00ea l\u00ea no site \u00e9 a mesma do aplicativo da Apple. Esta 2.0 leva pro aplicativo <b>tudo o que saiu na v1.9</b> \u2014 os destaques est\u00e3o logo abaixo.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.08);">' +
      '<div style="font-weight:800; color:var(--sp-c-6ee7b7,#6ee7b7); font-size:1rem; margin-bottom:8px;">\uD83C\uDFAF v1.9 \u2014 O app responde na hora, os n\u00fameros batem em todo lugar, e a tela nunca mais fica muda <span style=\"color:var(--text-muted); font-weight:400; font-size:0.78rem;\">(Agosto, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>\uD83C\uDFBE Cada FASE pode ter o seu formato de partida:</b> a se\u00e7\u00e3o <b>\uD83C\uDFBE Formato da Partida</b> deixou de valer pro torneio inteiro e agora aparece <b>dentro de cada fase</b>, na cria\u00e7\u00e3o e na edi\u00e7\u00e3o \u2014 uma na classificat\u00f3ria, outra na eliminat\u00f3ria, com valores independentes. D\u00e1 pra fazer, por exemplo, <b>Rei/Rainha em 1 set</b> na classificat\u00f3ria e <b>melhor de 3 com super tie-break</b> na eliminat\u00f3ria. Em torneio de elimina\u00e7\u00e3o direta continua sendo um formato s\u00f3 (a eliminat\u00f3ria \u00e9 a fase inicial). A tela de <b>Regras</b> passou a mostrar o formato de cada fase \u2014 antes ela dizia \"1 set\" enquanto a eliminat\u00f3ria jogava melhor de 3.</li>' +
        '<li><b>\uD83D\uDCCD Abrir o torneio j\u00e1 cai no topo do SEU grupo:</b> antes a tela mirava o seu pr\u00f3ximo <i>jogo</i> \u2014 quem ainda n\u00e3o tinha jogo marcado ficava no topo do torneio, procurando onde estava. Agora o alvo \u00e9 o <b>seu grupo</b>, mesmo sem jogo pendente. E no Rei/Rainha ele passou a se anunciar com o selo <b>SEU GRUPO</b> e a borda ciano, como j\u00e1 acontecia nos outros formatos. Quem chega pelo \"Ir para o torneio\" de um grupo espec\u00edfico continua caindo naquele grupo.</li>' +
        '<li><b>\u2705 D\u00e1 pra confirmar o placar direto na tela inicial \u2014 sem entrar no torneio:</b> em <b>\uD83D\uDCE3 Novidades no seu torneio</b>, o jogo com placar lan\u00e7ado e aguardando aprova\u00e7\u00e3o agora traz as duas sa\u00eddas lado a lado \u2014 <b>\u274c Contestar</b> e <b>\u2705 Confirmar</b> \u2014 para quem pode homologar \u2014 o time advers\u00e1rio e quem organiza. Antes o card mostrava o placar e a etiqueta \"aguardando aprova\u00e7\u00e3o\", mas a a\u00e7\u00e3o s\u00f3 existia dentro do torneio, e nem todo mundo descobria o caminho. Quem <b>n\u00e3o</b> pode homologar (quem propôs o placar, quem n\u00e3o joga aquele jogo) continua sem bot\u00e3o, e jogo <b>em disputa</b> segue resolvido s\u00f3 por quem organiza, dentro do torneio. Ao confirmar, os dois bot\u00f5es <b>somem na hora</b> e d\u00e3o lugar ao <b>\u270f\uFE0F Editar</b>, para quem tem poder de editar \u2014 quem organiza, ou quem jogou aquele jogo quando o torneio deixa os jogadores lan\u00e7arem. O Editar leva ao torneio, com a edi\u00e7\u00e3o do placar j\u00e1 aberta.</li>' +
        '<li><b>\uD83C\uDF04 No tema claro, a foto do local (ou a capa do torneio) some do card \u2014 agora aparece:</b> quem usa o app no claro via um card liso onde no escuro havia a foto. A imagem n\u00e3o vem pronta no card: ela chega um instante depois (\u00e9 assim que o app evita cobran\u00e7a por foto do Google e n\u00e3o carrega imagem pesada dentro da p\u00e1gina) \u2014 e o tema claro, que pinta os cards de branco pra n\u00e3o ficarem escuros, apagava a foto rec\u00e9m-chegada. Agora o card que <b>de fato</b> recebeu foto fica de fora dessa pintura, e o t\u00edtulo em cima dela \u00e9 claro nos dois temas.</li>' +
        '<li><b>\u23F1\uFE0F O rel\u00f3gio do torneio agora tem COR \u2014 e ela diz se voc\u00eas est\u00e3o em dia:</b> o contador do meio do card virou um sem\u00e1foro: <b>verde</b> quando voc\u00eas est\u00e3o junto ou \u00e0 frente do programado, <b>amarelo</b> quando a defasagem come\u00e7a a crescer, <b>vermelho</b> quando atrasou. A barra do realizado usa a mesma r\u00e9gua, ent\u00e3o n\u00famero e barra nunca contam hist\u00f3rias diferentes. Em torneios com foto de capa a cor <b>n\u00e3o aparecia</b>: a tarja que escurece a foto pra dar leitura levava o rel\u00f3gio junto e ele saía branco. E o contador voltou pro <b>centro</b> da linha \u2014 o \"final estimado\", numa linha s\u00f3, era a coisa mais larga do card e o empurrava pra esquerda; agora ele quebra em duas linhas, junto com o \"in\u00edcio real\".</li>' +
        '<li><b>\uD83D\uDCCA As barras de progresso do torneio agora dizem o pr\u00f3prio n\u00famero \u2014 e uma delas conta uma novidade:</b> as tr\u00eas barras do card ficaram mais altas e cada uma passou a carregar o seu percentual, colado na direita de onde a cor chegou. A de cima diz quanto da rodada j\u00e1 foi jogado; a roxa, quanto do torneio inteiro. A novidade \u00e9 a <b>azul</b>: ela mostra quanto do tempo programado da rodada j\u00e1 passou \u2014 ou seja, <b>quanto j\u00e1 deveria ter sido jogado</b> a esta altura. Lado a lado, as duas explicam na hora a cor do rel\u00f3gio: 38% jogado com 63% do prazo consumido \u00e9 atraso; 38% com 20% do prazo \u00e9 folga. Quando a cor ainda est\u00e1 curta demais para o n\u00famero caber dentro, ele aparece logo depois da ponta.</li>' +
        '<li><b>👆 O toque no card: acabou o "pulo duplo", e agora ele só esmaece:</b> o card carregava um efeito de <b>passar o mouse</b> que o empurrava 5px — e o iPhone <b>simula mouse no toque</b>. Então a sequência era: aperta (encolhe) → solta (pula pro lado, resíduo do mouse) → o mouse "sai" (pula de volta). Dois pulos, e nada disso lia como clique. O efeito de mouse saiu do toque (continua no computador, onde faz sentido) e o realce virou só <b>esmaecer</b> — a mudança mais barata que existe de fazer, e que se vê de longe.</li>' +
        '<li><b>🩹 E o realce não atrapalha mais a rolagem:</b> ele entrava no instante do toque — inclusive no toque que <b>começa uma rolagem</b> —, e mexer no tamanho do card ali obriga o aparelho a redesenhar bem no primeiro quadro do gesto. Era isso que trazia a tela cortada de volta. Agora, se você tocar para <b>parar uma rolagem por inércia</b>, o card não acende: aquilo não é um clique.</li>' +
        '<li><b>🙂 Os ícones dos jogadores voltaram a ter cara:</b> na chave, todos apareciam como o <b>mesmo círculo</b>, sem a inicial de ninguém. O ícone é desenhado a partir do <b>nome</b> — e, desde que a identidade passou a nascer do cadastro em vez do nome guardado, quem tem conta aparece <b>sem nome por um instante</b>, até o perfil chegar. Só que o preenchimento posterior corrigia o <b>texto</b> e esquecia o ícone: sem nome, o desenho saía sem inicial e sempre da mesma cor. Agora nome e ícone vêm da mesma fonte e no mesmo instante — e quem tem foto no perfil aparece com a foto, não com as iniciais.</li>' +
        '<li><b>🟩🟥 O placar da chave agora se lê num relance — verde ganhou, vermelho perdeu:</b> a cor estava respondendo a duas perguntas ao mesmo tempo, e por isso mentia. Num jogo <b>sem resultado nenhum</b>, a tarja saía verde em cima e vermelha embaixo — <b>por posição</b>, não por quem venceu. Agora cada elemento responde uma coisa só: a <b>tarja</b> diz em que pé está o resultado (<b>verde</b> confirmado, <b>âmbar</b> proposto aguardando confirmação, <b>cinza</b> sem resultado) e o <b>número</b> diz quem ganhou (<b>verde</b>) e quem perdeu (<b>vermelho</b>). No resultado proposto os números já saem verde e vermelho — antes eram os dois âmbar, e você via o placar sem saber quem tinha vencido.</li>' +
        '<li><b>👆 O toque no card FINALMENTE acende — e a pista veio de você:</b> você disse que o card dava <b>"uma leve mexidinha"</b>. Essa mexidinha é o efeito de passar o mouse (o iPhone simula isso no toque), e ela provou duas coisas de uma vez: o aparelho <b>não</b> estava travado no instante do toque, e mesmo assim o realce não aparecia. O motivo: no iPhone o realce de "pressionado" é <b>adiado</b> enquanto o navegador decide se aquele toque vai virar rolagem — e num card dentro de uma lista rolável, o dedo sai antes da decisão. Oito versões mexendo nesse realce não podiam funcionar: ele nunca chegava a ser aplicado. Agora o realce é aplicado <b>no instante do toque</b>, sem esperar decisão nenhuma: o card <b>encolhe e clareia</b> na hora, e volta ao normal ao soltar. Se o dedo andar, ele apaga — porque aquilo virou rolagem.</li>' +
        '<li><b>⚪ O clarão branco, agora consertado no lugar certo:</b> ele voltou porque as correções anteriores guardavam os <b>chamadores</b> — e sempre sobrava um. Sobravam dois: a troca de tela (que acontece ao <b>entrar</b> no torneio) e uma verificação automática a cada <b>2 minutos</b>, que rodava em qualquer tela, inclusive com você lendo a chave. Agora a regra mora no <b>único ponto por onde todo recarregamento passa</b>: atualização só é aplicada na tela inicial. Não há mais "o lugar esquecido". E a atualização não se perde — a pílula "Nova versão" continua aparecendo para quem quiser atualizar na hora.</li>' +
        '<li><b>🩹 A chave cortada ao rolar — agora com o mecanismo identificado:</b> aquele "aparece cortado e se conserta depois da primeira vez" é a assinatura de um problema específico: a área da chave estava configurada como uma <b>camada de desenho separada</b>, com orçamento próprio de blocos de imagem. Ao rolar, o aparelho precisa redesenhar os blocos dessa camada — e até terminar, você vê o buraco; depois de pronto, some. Eram dois ajustes antigos causando isso, e um deles estava até na página inteira. O segundo é uma propriedade <b>obsoleta desde o iOS 13</b>: ela não entrega mais nada (a rolagem suave virou padrão) e só cobra a camada. Saíram as duas, das cinco telas onde apareciam.</li>' +
        '<li><b>👆 O toque no card agora acende MESMO quando o aparelho está ocupado:</b> o realce que existia (o card esmaecer) é desenhado pelo <b>navegador</b>, e navegador ocupado não desenha — justamente no momento em que a falta de resposta incomoda. Medimos: com o aparelho livre o realce aparece; com ele ocupado por 1,2s, <b>não aparece nada</b>. Agora o card também pede o realce do <b>sistema</b> (aquele claro que o iPhone pinta no toque), que é desenhado fora do navegador e sobrevive ao aparelho travado. Os dois convivem: livre, você vê os dois; preso, vê pelo menos um.</li>' +
        '<li><b>⚪ Sumiu o clarão branco ao desbloquear o celular dentro de um torneio:</b> ao voltar pro app, ele conferia se havia versão nova e <b>recarregava por baixo de você</b>. Isso já tinha sido consertado uma vez — mas só para um dos três avisos de retorno; os outros dois (que disparam exatamente ao desbloquear) ficaram de fora, então o conserto nunca valeu na prática. Agora a regra é uma só para os três: atualização só é aplicada na tela inicial, onde não há leitura nem rolagem a perder.</li>' +
        '<li><b>🟨 O quadro que a seta aponta fica marcado por 3 segundos:</b> a seta diz para onde ir; a borda amarela diz <b>chegou</b>. Ela nasce junto com a seta e permanece 3 segundos depois de ela sumir, para quem rolou até lá encontrar o quadro ainda marcado em vez de uma tela igual a todas as outras.</li>' +
        '<li><b>⏳ Os dois relógios do torneio agora medem coisas diferentes — e cada um a que importa:</b> no card da <b>rodada</b>, o número do meio virou uma <b>contagem regressiva ao vivo</b> até o prazo para terminar a rodada ("10d 15h 58m 45s restante"), descendo a cada segundo e mirando exatamente o <b>final programado</b> que aparece logo abaixo, em azul — é o tempo que as pessoas têm para jogar e lançar os placares. Já no card de <b>torneio completo</b>, o relógio conta o <b>tempo decorrido</b>: da hora em que os jogos já podiam começar a acontecer (o início programado ou o sorteio, o que veio depois) até agora — e, quando o torneio encerra, congela no quanto ele durou. Antes os dois mostravam a mesma coisa, o tempo corrido desde o começo. Rodada sem prazo definido continua mostrando o decorrido: prazo estimado por tempo de quadra não vira promessa de contagem regressiva.</li>' +
        '<li><b>📱 O SMS de verificação do celular não chegava — e ninguém ficava sabendo:</b> uma participante pediu o código, o envio saiu normalmente (o Google aceitou e entregou à operadora) e o SMS <b>nunca chegou no aparelho dela</b>. A tela ficava muda: sem botão para reenviar, sem explicação, sem saída. E o pior: essa falha <b>não existia em lugar nenhum</b> — nem para ela, nem para quem organiza, nem para o app; só descobrimos porque ela avisou por fora. Três coisas mudaram. O código <b>agora sai em português</b> (saía em inglês, o que faz qualquer pessoa achar que é golpe). Apareceu um <b>“Reenviar o código”</b> com contagem, e as mensagens de erro passaram a dizer o que fazer em vez de mostrar o código técnico. E toda tentativa passou a <b>deixar rastro</b>: quem pediu o código e não conseguiu confirmar aparece para quem organiza — e recebe um e-mail que <b>reconhece a tentativa</b>, em vez do mesmo pedido de sempre.</li>' +
        '<li><b>🤝 E quando o SMS realmente não alcança a pessoa, quem organiza pode registrar o contato:</b> sempre vai sobrar alguém que a operadora não entrega. Para esses, o organizador (ou co-organizador) do torneio pode <b>registrar o celular</b> pelo card do inscrito — e fica gravado <b>quem</b> registrou e <b>quando</b>. Não é “salvar sem conferir”: o número entra marcado como <b>contato</b>, a pessoa <b>recebe um aviso</b> de que isso aconteceu, e o perfil dela mostra de onde veio. Esse número <b>não serve para entrar no app nem para recuperar senha</b> — para isso continua sendo obrigatório confirmar por SMS. Celular que a própria pessoa já verificou <b>não pode ser trocado</b> por ninguém.</li>' +
        '<li><b>🔔 A notificação que você acabou de ler parou de sumir da sua frente:</b> notificações que ficam 5 segundos na tela são marcadas como lidas — isso continua. O que mudava é que, na atualização seguinte da lista, ela <b>descia para o bloco das antigas</b>: sumia justamente o que você estava olhando. Agora ela <b>fica no lugar</b>, no topo, apenas esmaecida — e só é reclassificada quando você <b>sai e volta</b> para a tela. O título do bloco também parou de mentir: mostra quantas seguem não lidas e quantas você <b>leu agora</b>.</li>' +
        '<li><b>👀 O convite "veja quem está em quadra" só aparece quando há alguém em quadra:</b> ele estava saindo mesmo com o quadro vazio — convite apontando para o nada, o que queima a confiança em todos os outros.</li>' +
        '<li><b>🩺 O aparelho vinha dizendo quem trava a tela — e a mensagem chegava CORTADA:</b> quando um toque demora, o app manda um relatório com o nome do trecho de código responsável. Esse relatório vinha truncado em 250 caracteres por um ajuste padrão que nunca tinha sido mexido — e o corte caía <b>exatamente em cima dos nomes</b>. O aparelho mandava a informação certa desde o começo; ela era descartada na chegada. A tentativa de subir esse limite fez os relatórios <b>pararem de chegar</b>, então ela foi revertida: agora quem se ajusta é a mensagem, que passou a caber no limite priorizando os nomes. Além disso, o registro passou a anotar <b>qual trecho mexeu na tela por último</b> antes de cada travamento: era o último esconderijo, porque um trecho pode ser rapidíssimo e ainda assim deixar uma conta pesada para o aparelho pagar logo depois, fora de qualquer medição.</li>' +
        '<li><b>🚨 O app instalava a versão nova e continuava rodando a VELHA — só no aparelho, nunca no navegador:</b> o app guarda uma cópia dos próprios arquivos para abrir rápido sem internet. Isso faz sentido no site; <b>dentro do aplicativo não faz nenhum</b>, porque os arquivos já estão no aparelho. E tinha um efeito grave: ao abrir, o app pegava a <b>cópia guardada da versão anterior</b> — inclusive a lista de quais arquivos carregar — então <b>instalar uma atualização não mudava nada</b>. No site isso se resolve sozinho a cada recarga, e é por isso que a web parecia boa enquanto o aplicativo parecia intocado, versão após versão. Essa cópia foi <b>desligada dentro do aplicativo</b>, e quem já a tinha guardada tem ela <b>apagada automaticamente</b> na primeira abertura.</li>' +
        '<li><b>🎯 ACHAMOS: rolar a tela consumia quase todo o aparelho — e era isso que engolia o seu toque:</b> a cada movimento do dedo (até <b>60 vezes por segundo</b>) o app remedia a barra do topo e as barras grudadas, o que obriga o aparelho a <b>recalcular a página inteira</b>. Medido: <b>313ms de trabalho por segundo de rolagem</b> num documento menor que o seu — no seu iPhone isso chega perto de <b>um segundo de aparelho travado por segundo de rolagem</b>. Explica os dois incômodos de uma vez: a tela vinha <b>cortada e se consertava</b> ao parar de rolar (o aparelho não conseguia desenhar enquanto isso), e o <b>toque no card não acendia</b> — o realce do toque é desenhado pelo aparelho, e ele estava ocupado. Esse recálculo saiu da rolagem: agora acontece só quando a altura muda de verdade. E ele nunca precisou estar ali — as barras são fixas, não se movem com a rolagem.</li>' +
        '<li><b>🔦 E o app deixou de ser cego justamente onde mais dói:</b> esse defeito sobreviveu a quatro versões porque o medidor interno vigiava tarefas agendadas e observadores, <b>mas não a rolagem</b> — então os travamentos chegavam marcados como "ninguém foi o culpado". Agora a rolagem também é vigiada, com nome de quem segurou a tela.</li>' +
        '<li><b>📊 A barra do "Carregando" parou de mentir — e agora anda mesmo quando o aparelho está ocupado:</b> ela chegava a <b>100% no número com a barra parada em 5%</b>. Eram duas coisas somadas. A barra só avançava por um <b>relógio interno do app</b>, que para de bater exatamente quando o aparelho trava — ou seja, ela congelava justo no momento em que você está olhando para ela. E o preenchimento usava um tipo de animação que <b>obriga o aparelho a refazer o desenho</b>; mesmo quando o valor final chegava, não sobrava quadro para pintar antes de a tela sair. Já o número é texto puro, que salta na hora — daí o 100% sobre a barra parada. Agora quem move a barra é o <b>processador gráfico</b>, que continua trabalhando mesmo com o app ocupado, e o número é calculado pela <b>mesma fórmula</b> da barra: os dois não têm mais como discordar.</li>' +
        '<li><b>🏪 O caminho agora é o app de verdade — os selos das lojas entraram no lugar do "Instalar na tela inicial":</b> a tela de entrada oferecia um <b>atalho na tela inicial</b> (a versão web salva como ícone). Com o app publicado, esse atalho virou <b>concorrente</b> do app de verdade, ocupando o lugar mais nobre da tela para entregar o pior dos dois caminhos. Saiu, e no lugar entrou o <b>selo oficial da loja</b>, que leva direto à ficha do scoreplace. O selo do Google Play só aparece quando a ficha do Android estiver publicada — <b>selo que leva a uma página inexistente é pior que selo nenhum</b>. E o botão "Baixar na App Store" saiu de dentro da tela inicial: convite para baixar é coisa de porta de entrada, não de quem já está lá dentro.</li>' +
        '<li><b>⚡ O app parou de refazer as contas da tela inteira a cada mudancinha:</b> toda vez que qualquer coisa mudava na tela — um card entrando na lista, um nome chegando — o app <b>remedia a barra do topo e reescrevia cinco medidas globais</b>. Reescrever uma medida global obriga o navegador a <b>reavaliar a página inteira</b>, e a sua tela inicial tem mais de 4.000 elementos. Pior: quase sempre os números eram <b>os mesmos de antes</b> (a barra do topo não muda de altura porque entrou um card na lista) — era trabalho pesado para chegar na mesma resposta. Medido no navegador, com 50 mudanças seguidas: antes eram <b>50 recálculos e 250 reescritas</b>; agora é <b>um por quadro de tela e nenhuma reescrita</b>. Foi o seu iPhone que apontou o culpado pelo nome.</li>' +
        '<li><b>🩹 A chave parou de aparecer cortada quando você rola:</b> ao entrar num torneio, a chave era desenhada <b>em pedaços</b> — um primeiro bloco e o resto entrando aos poucos. O "Carregando" saía depois do <b>primeiro</b> bloco, então quem rolava logo em seguida rolava para dentro do que <b>ainda não tinha sido desenhado</b>, e via a tela cortada. Já tínhamos tentado remendar aumentando o primeiro bloco, e não podia funcionar: o problema não era o tamanho do primeiro pedaço, era <b>existir um segundo</b>. Agora a chave é montada inteira e entregue de uma vez, com o "Carregando" por cima o tempo todo — do jeito que você mandou: entregar a página pronta.</li>' +
        '<li><b>✨ O último brilho eterno saiu de dentro do app:</b> o seu iPhone nos entregou uma travada de meio segundo com <b>um brilho ainda rodando</b> — e era justamente o brilho-dica que voltou na versão passada. É a mesma animação que, em seis botões, tinha derrubado a rolagem inteira. Um botão só, mas <b>para sempre</b>, é o mesmo veneno em dose menor: o custo não é por botão, é por quadro de tela. Agora ele passa <b>duas vezes e para</b> — continua chamando o olho quando a tela abre, sem cobrar nada depois.</li>' +
        '<li><b>🔎 E o app passou a dizer o NOME de quem trava a tela:</b> o relatório que o seu aparelho manda vinha com "algo segurou a tela por 852ms" — <b>sem dizer o quê</b>. Agora ele identifica o trecho de código responsável. Não é uma melhoria que se sente hoje; é o que permite consertar o que ainda sobrar sem ficar no chute.</li>' +
        '<li><b>✏️ O convite não corta mais palavra:</b> "confira seus últimos resultados" aparecia cortado nas duas pontas no seu aparelho. Agora quebra linha e continua centralizado.</li>' +
        '<li><b>👇 Uma seta convida para o que está logo abaixo — uma de cada vez:</b> a tela inicial é ocupada pelos botões de ação, e o que você veio procurar fica fora de vista. Agora uma <b>seta amarela</b> espera no rodapé com o convite — <b>encontre seus torneios</b>, <b>novidades nos seus torneios</b>, <b>confira seus últimos resultados</b>, <b>veja quem está em quadra</b> — e, conforme você rola, ela <b>sobe junto com o quadro que está indicando</b>, colada no seu dedo, até esmaecer no topo quando você chega lá. É <b>uma por vez, nunca em sequência</b>, nessa ordem, e só aparece o que de fato existe: ao voltar ao app depois, é a vez da próxima.</li>' +
        '<li><b>👆 A do perfil aponta para cima, e em duas etapas:</b> o perfil não está abaixo — ele mora no menu. Então essa seta aponta para o <b>menu</b>; quando você abre o menu, ela <b>pula para o próprio perfil</b> lá dentro. E <b>cada convite só aparece para quem ainda não domina aquilo</b>: quem já abriu o próprio torneio, as novidades, os resultados, a presença ou o perfil <b>três vezes</b> não vê mais aquele convite — ele se cala sozinho, mesmo que você nunca tenha tocado nele.</li>' +
        '<li><b>✨ O brilho dos botões voltou — agora ensinando, não enfeitando:</b> em vez de seis botões brilhando o tempo todo (o que travava o aparelho), o brilho aparece em <b>um único botão por vez</b>, e só naqueles que você <b>ainda não usou</b>. Assim que você usa aquele botão, o brilho passa para o próximo que você ainda não conhece — e some de vez quando não há mais nada a apresentar.</li>' +
        '<li><b>🛡️ Ninguém mais é apagado por uma aba que ficou aberta a noite toda:</b> se alguém deixa o app aberto no torneio e volta horas depois para lançar um placar, o aparelho dele tem uma <b>cópia antiga</b> do torneio. Testamos esse cenário exato contra o banco de dados de verdade: placar, elenco, presença, W.O. e suplentes já estavam protegidos — mas quem entrou na <b>lista de espera sem ter conta</b> (jogador digitado pelo organizador) <b>sumia em silêncio</b>. Agora não some mais: a proteção passou a reconhecer também quem não tem conta. Tirar alguém continua exigindo um ato explícito de quem organiza.</li>' +
        '<li><b>🪄 Os brilhos pulsantes do app foram refeitos para não custarem nada:</b> os realces que “respiram” (dicas, destaque de convite, botão de inscrição) pulsavam mudando a <b>sombra</b> — e mudar sombra obriga o aparelho a redesenhar aquela área <b>60 vezes por segundo</b>. Era a mesma família do defeito que travou o app ontem. Agora o pulso é um <b>anel que cresce e some</b>, algo que o processador gráfico faz sozinho. O efeito é o mesmo aos olhos; o custo desapareceu. Nenhuma animação do app volta a mexer em sombra — e as telas em lista passaram a ser desenhadas de forma isolada, para que mexer num cartão não obrigue o aparelho a reavaliar a tela inteira.</li>' +
        '<li><b>🎽 O ícone do app voltou a aparecer no Android (era um “S” num círculo colorido):</b> o atalho na tela inicial e a lista do Chrome mostravam uma letra genérica no lugar do nosso pódio. O motivo: os ícones estavam declarados <b>só em formato vetorial</b>, que o Chrome no Android <b>não aceita</b> para atalho — sem uma imagem utilizável, ele desenha a inicial do site. Agora o app publica ícones em imagem comum (192, 512, além do favicon da aba e do ícone do iPhone), gerados do <b>mesmo ícone oficial das lojas</b> — e <b>reenquadrados</b> para preencher o círculo do atalho: o pódio estava ocupando pouco mais da metade do espaço disponível.</li>' +
        '<li><b>✋ Tocar no card agora responde na hora — o card <b>esmaece</b> no dedo:</b> pedido seu, e por um motivo técnico que importa: esse esmaecimento é desenhado pelo <b>próprio navegador no instante do toque</b>, sem depender do app — então ele responde mesmo se o aparelho estiver ocupado. O contorno colorido continua, somando ao efeito.</li>' +
        '<li><b>✨ O brilho que passava pelos botões estava travando o app inteiro no iPhone:</b> aquele reflexo que desliza sobre os botões rodava <b>sem parar, em seis botões ao mesmo tempo</b>, dentro do app. O aparelho do dono nos entregou a prova: toda travada de ~1 segundo acontecia com <b>seis desses brilhos em curso</b> e <b>nenhum código do app rodando</b>. No iPhone esse efeito repinta a área a cada quadro, e com seis deles sempre havia um passando — era isso que matava a rolagem, cortava a chave e atrasava o “Carregando”. O brilho continua na tela de entrada (onde a tela é leve e ele faz sentido) e sai de dentro do app.</li>' +
        '<li><b>🧊 O efeito de vidro fosco atrás das tarjas estava matando a rolagem no iPhone:</b> as caixas que aparecem <b>sobre a foto do local</b> (progresso, tempo, estatísticas, lista de espera) usavam um <b>desfoque do fundo</b> para dar leitura. No iPhone esse efeito obriga o aparelho a <b>refazer o desfoque a cada quadro</b> e tira a rolagem do processador gráfico — resultado: rolagem que morre e engasga no começo, tela que aparece cortada e toque sem resposta. Como o app não estava executando nada nesses momentos (medimos, e não havia), o desfoque era o único suspeito que restava. Ele saiu de <b>todas as telas</b>; quem garante a leitura continua sendo a tarja escura, que não mudou de cor.</li>' +
        '<li><b>🎯 ACHAMOS O CULPADO DE VERDADE: o ajuste automático do tamanho dos nomes travava o app inteiro:</b> para o nome caber na caixa do card, o app <b>diminuía a letra de pouquinho em pouquinho e remedia a tela a cada passo</b> — até 200 vezes por nome. Numa chave com ~400 nomes isso trava o aparelho por cerca de <b>1,5 segundo</b>, e acontecia a cada abertura, várias vezes seguidas, <b>e também enquanto você rola</b>. Era isso o scroll que morria, a chave que aparecia cortada e o toque no card sem resposta. Agora o cálculo é feito <b>de uma vez só para o grupo todo</b>, por aproximação direta: o resultado na tela é <b>exatamente o mesmo</b> (conferimos nome por nome nos 400), gastando 75% menos — e, no aparelho, a diferença é de ~1,5s para ~0,4s.</li>' +
        '<li><b>🔦 Agora NENHUM trabalho pesado consegue se esconder — e mais dois relógios pararam de sacudir a tela:</b> o app ganhou um fiscal interno que registra <b>qualquer tarefa agendada</b> que passe de 0,18s, com nome — inclusive as do próprio motor de dados. E dois relógios de 1 segundo (contagens regressivas “em Xm Ys” e o aviso de torneio-teste) passaram a tocar a tela <b>só quando o texto de fato muda</b> — contagens acima de 1 minuto agora mudam por minuto, não por segundo.</li>' +
        '<li><b>🚂 ACHAMOS O TREM: a barra de progresso reescrevia a tela inteira a cada segundo:</b> a caixa “Progresso” (nos cards da tela inicial E no detalhe) se redesenhava por completo <b>a cada 1 segundo</b> — e cada redesenho obrigava o aparelho a recalcular a página inteira (~6.000 elementos no detalhe). Era isso que travava o scroll por 2 segundos (“pode tentar o quanto for”), cortava a chave ao rolar e engolia o toque no card. Agora ela só toca a tela quando algo <b>de fato mudou</b> (um jogo concluiu, um minuto virou) — no segundo típico, zero trabalho.</li>' +
        '<li><b>🧊 A travada de ~1,2s que segurava o app foi encontrada e desmontada:</b> o auto-relatório do aparelho apontou travadas repetidas sem nome — era o app <b>reprocessando todos os torneios e regravando o cache inteiro</b> a cada aviso do servidor (qualquer presença ou placar de qualquer participante!). Agora só o torneio que <b>mudou</b> é reprocessado, e a gravação do cache acontece uma vez por rajada, fora do caminho do toque. É a causa mais provável do “2-3s até o Carregando” e de parte do corte no scroll.</li>' +
        '<li><b>⏱️ O vácuo do toque agora é medido desde o dedo:</b> descobrimos que o atraso que sobrou no toque acontece <b>antes</b> de o app sequer ficar sabendo do toque — o aparelho segura o evento enquanto termina um trabalho pesado. O app passou a medir esse tempo de espera direto do relógio do toque (e a registrar toda travada da interface), então o próximo relato automático diz exatamente <b>quanto</b> o dedo esperou e <b>o que</b> rodava naquele instante.</li>' +
        '<li><b>🔁 O detalhe do torneio parou de “abrir, recarregar e abrir de novo”:</b> toda abertura tinha um segundo ato indesejado — segundos depois de a tela aparecer, chegava a resposta do servidor e o app <b>reconstruía a página inteira com um “Carregando” no meio</b>, mesmo quando nada tinha mudado. A causa: a primeira pintura nunca registrava a “assinatura” do que mostrou, então a comparação seguinte sempre acusava diferença. Agora a assinatura é registrada na primeira pintura (dado igual = silêncio absoluto) e, quando o dado realmente muda, a atualização troca o conteúdo <b>sem loader e sem reconstruir aos pedaços</b>.</li>' +
        '<li><b>📡 O “Ao Vivo” só aparece para quem pode operá-lo:</b> em torneios com arbitragem habilitada, <b>qualquer pessoa logada</b> via o botão Ao Vivo em qualquer jogo sem placar — inclusive inscritos de outros grupos. Regra corrigida (decisão do organizador): o botão aparece para o <b>organizador</b>, para os <b>jogadores daquele jogo</b> e para o <b>árbitro confirmado</b> do torneio — nunca para participante que não está no jogo.</li>' +
        '<li><b>🕵️ O toque no torneio parou de disputar a vez com a tela inicial:</b> medimos direto no aparelho (o app agora se auto-reporta) que o atraso do “Abrindo o torneio…” vinha de trabalho da tela inicial — uma repintura agendada que disparava <b>no meio da navegação</b> e roubava o quadro do aviso. Agora, tocar num torneio <b>cancela</b> o trabalho pendente da tela inicial e segura atualizações de fundo por 2 segundos; e o auto-relatório passou a dizer <b>com nome</b> qual parte do app segurou a tela, inclusive no iPhone.</li>' +
        '<li><b>⚡ O “Abrindo o torneio…” aparece na hora do toque — e a navegação nunca mais fica refém de um quadro ocupado:</b> tocar num torneio podia deixar 2–3 segundos <b>sem resposta nenhuma</b> antes de o aviso aparecer (aquela dúvida de “será que registrou?”). Agora o aviso pinta imediatamente e a abertura tem um teto duro de espera; a lista compacta da tela inicial entrou no mesmo trilho. Os primeiros grupos do torneio dobraram na primeira pintura (duas telas cheias) e o resto monta num ritmo que se adapta ao aparelho — menos chance de encontrar a chave “cortada” ao rolar. Se ainda houver toque sem resposta, o app agora <b>mede e reporta sozinho</b> o que estava travando naquele momento.</li>' +
        '<li><b>🚿 Chega de “carrega, mostra, volta a carregar” — a tela só mostra o Carregando quando está de fato vazia:</b> durante a abertura, o app re-processava a mesma tela <b>várias vezes</b> (cada etapa do login re-disparava a pintura) e cada repintura subia um “Carregando…” <b>por cima do que você já estava vendo</b>, resetava o scroll e chegava a piscar preto. Agora, repintar uma tela que já está na sua frente é <b>silencioso</b>: o conteúdo novo troca o antigo num piscar imperceptível, sem loader, sem pulo de scroll — e um acúmulo interno que fazia cada navegação renderizar a mesma tela até 10 vezes foi eliminado.</li>' +
        '<li><b>🧩 O detalhe do torneio entrega conteúdo de verdade na hora, e monta o resto enquanto você lê:</b> a tela do torneio (a mais pesada do app) montava <b>tudo de uma vez</b> — no Confra são ~6.000 elementos — e você esperava olhando para nada. Agora a primeira pintura já traz o cabeçalho e os <b>primeiros grupos reais</b>, e as demais caixas entram em lotes, por baixo, sem reconstruir nada e sem a tela pular. Rolar fica mais leve porque o aparelho deixa de processar a tela inteira de uma tacada.</li>' +
        '<li><b>🧱 O motor de dados do app foi atualizado (Firebase 10 → 12):</b> um defeito interno da versão antiga podia, em situações raras, <b>travar toda a comunicação com o servidor</b> até recarregar a página — o app tinha até um recarregamento automático de emergência só para isso. A versão nova traz ~2 anos de correções exatamente dessa família de erros. A rede de segurança continua armada, mas a expectativa é que ela pare de ser necessária.</li>' +
        '<li><b>😴 O card de “Folga” parou de derrubar a tela da fase de grupos:</b> desde junho, quando a lista de jogos de um grupo incluía uma <b>Folga</b>, um defeito interno podia matar a tela inteira do torneio — em vez do chaveamento, nada aparecia. A causa era o card da Folga tentar mostrar o <b>nome atualizado</b> do jogador antes de ter o torneio em mãos. Agora o card renderiza sempre — e, de bônus, passou a mostrar de fato o nome ao vivo do perfil, que era a intenção original.</li>' +
        '<li><b>🎾 A tela de “Carregando…” virou UMA só, medida por medida:</b> as telas de carregamento tinham os <b>mesmos elementos em tamanhos diferentes</b>, que se alternavam na abertura — o logo aparecia maior na tela inicial e encolhia na seguinte, e o texto “Carregando…” mudava de <b>tamanho e de lugar</b> (numa tela ficava embaixo da barra, na outra em cima). Parecia troca de tela, não continuidade. Agora todos os elementos — logo, bola, texto e barra de % — têm <b>o mesmo tamanho nas mesmas posições</b> em toda tela de carregamento; a única coisa que muda é o texto, sempre com a mesma fonte.</li>' +
        '<li><b>📍 “Você está aqui?” aprendeu a ouvir o “Agora não”:</b> ao abrir o app num local preferido sem ida programada, ele pergunta se você veio jogar — mas a resposta “Agora não” não ficava guardada, e a pergunta <b>voltava a cada abertura do app</b>. Agora o “Agora não” <b>silencia a pergunta naquele local por 4 horas</b>, mesmo fechando e reabrindo o app. Se mudar de ideia dentro dessas horas, o check-in manual (📍 no local) continua a um toque.</li>' +
        '<li><b>👤 O Meu Perfil foi reorganizado em blocos coloridos:</b> identidade no topo (foto + nome, sem texto cortado), depois <b>Contato</b>, <b>Acesso à conta</b> — com os <b>logos oficiais</b> do Google, da Apple e do WhatsApp —, <b>Notificações</b>, <b>Privacidade</b>, <b>Meu jogo</b>, <b>Aparência</b> e, por último, a exclusão de conta isolada numa zona de risco. Os antigos \'Ocultar telefone/e-mail\' viraram uma coluna <b>\'Divulgar\'</b> com um interruptor alinhado a cada contato, ligados por padrão — mesma proteção, leitura direta. O rótulo \'Divulgar\' mora no cabeçalho do bloco, alinhado com os interruptores. O celular ganhou o mesmo <b>\'Alterar\'</b> do e-mail: o número fica exibido numa linha limpa (com o selo de verificado colado nele) e os campos de edição só abrem quando você quer trocar. O selo de <b>verificado</b> virou a bolinha verde com check, e as três perguntas de privacidade (estatísticas, presença e o aviso de placar ao vivo) usam o mesmo seletor <b>Todos · Amigos · Ninguém</b> — o aviso de ao vivo agora pode ser só de amigos. O interruptor \'aceito contato por WhatsApp\' saiu: quem cadastra o celular já está dizendo que aceita; quem não quer, não cadastra (ou desliga o Divulgar).</li>' +
        '<li><b>🏬 Os convites impressos agora trazem os selos oficiais das duas lojas:</b> antes o nome da loja era escrito como texto imitando a marca. Agora são os selos oficiais da <b>App Store</b> e do <b>Google Play</b>, e isso vale tanto no convite do app quanto nos de <b>torneio</b>.</li>' +
        '<li><b>🗂️ Na tela inicial, “Novidades no seu torneio” e “Seus últimos resultados” passam a usar a linha inteira:</b> fechadas, as duas seções mostravam <b>um jogo só</b> e deixavam o resto da linha vazio — mesmo numa tela larga, onde cabiam dois ou três lado a lado. Agora elas mostram <b>quantos jogos couberem na largura da sua tela</b> (um no celular, dois ou três em telas maiores), e os jogos à mostra <b>dividem a linha</b> em vez de se amontoarem num canto. O botão de abrir acompanha: ele conta <b>quantos jogos realmente sobraram</b> escondidos, e some quando não sobra nenhum.</li>' +
        '<li><b>🏷️ O convite impresso passou a usar o selo oficial da loja:</b> antes ele escrevia o nome da loja como <b>texto imitando a marca</b>, o que ficava amador no papel. Agora usa o selo oficial — e isso vale tanto para o convite do app quanto para os de <b>torneio</b>. A Google Play só entra quando a ficha dela abrir ao público; anunciar antes mandaria quem lê para uma página onde não dá para instalar.</li>' +
        '<li><b>🔵 Na partida casual, você é sempre o time azul — já no primeiro jogo:</b> a regra valia só quando o app <b>re-sorteava</b> as duplas. Quem formava as duplas <b>arrastando</b> os nomes começava a partida do lado que calhasse, e o seu lado podia <b>inverter do 1º pro 2º jogo</b> — era o “os slots estão frouxos e trocam de nome”. Agora o lado é decidido <b>uma vez</b>, na montagem da partida, e vale igual pra todo mundo que está na sala. <b>Ninguém troca de parceiro</b>: muda só de que lado a sua dupla aparece. E, se houver <b>duas pessoas com o mesmo nome</b> na quadra, o app prefere <b>não mexer</b> a arriscar mover a pessoa errada.</li>' +
        '<li><b>🔁 O “Jogar novamente” e o próximo jogo do Rei/Rainha voltaram a responder:</b> em partida com amigos na mesma sala, esses dois botões podiam <b>simplesmente não fazer nada</b> — uma falha interna interrompia a ação em silêncio, sem nenhum aviso na tela. Corrigido.</li>' +
        '<li><b>👥 Nome com barra (“Ana C/ Silva”) parou de virar dois jogadores:</b> o app remontava as duplas <b>quebrando o texto</b> “Fulano / Beltrano” no meio, então um nome que já tinha uma barra era lido como duas pessoas. Agora ele usa a lista real de quem está jogando, com o time de cada um.</li>' +
        '<li><b>📋 A lista de inscritos abre na hora, mesmo com 143 nomes:</b> o app montava a <b>lista inteira</b> antes de mostrar qualquer coisa — e só <b>quatro</b> cabem na tela do celular, ou seja os outros 139 eram trabalho que ninguém estava vendo. Agora ele entrega primeiro <b>o que você vê</b> (com folga pra rolar) e vai completando o resto enquanto você lê ou digita na busca: no Confra, a lista aparece <b>quase 4× mais rápido</b>. Nada fica pelo caminho — a lista <b>sempre</b> termina de chegar, mesmo com o app em segundo plano, a <b>ordem é a mesma</b> do começo ao fim (ela não se remexe enquanto você lê) e, se você marcar presença com a tela no <b>meio</b> da lista, ela continua no mesmo ponto e sem espaço em branco onde você está olhando.</li>' +
        '<li><b>📱 O app instalado ficou mais próximo do site em fluidez:</b> o aplicativo permitia <b>zoom de pinça/duplo-toque</b> dentro da tela, o que faz o sistema segurar cada toque por um instante para ver se vem um segundo — atraso que o site não tem. Desligado.</li>' +
        '<li><b>▶️ O replay virou a própria partida, jogada de novo na sua frente:</b> ele era uma <b>tela separada</b>, que redesenhava um placar simplificado e tinha que <b>adivinhar</b> quando um game havia virado. Agora o replay é o <b>próprio placar ao vivo</b>: mesma tela, mesmas placas, mesmas cores, mesma bola de saque — e os pontos vão entrando <b>na ordem em que foram marcados na quadra</b>, com o game e o set virando na hora certa, porque quem conta é o mesmo motor que contou na partida. No fim, cai na <b>mesma tela de estatísticas</b> que aparece quando um jogo termina de verdade, com o gráfico de momentum e os números por jogador. Dá pra <b>pausar, acelerar (1× · 2× · 4×) ou pular pro fim</b>. E o cabeçalho diz <b>REPLAY</b>, nunca "AO VIVO" — reproduzir um jogo antigo não avisa ninguém, não aparece na vitrine de partidas ao vivo, não vai pro seu relógio e <b>não grava nada</b>: o resultado verdadeiro da partida fica intacto.</li>' +
        '<li><b>▶️ O replay da partida voltou a aparecer:</b> quando o placar estava em <b>tela cheia</b>, o replay abria <b>fora</b> da área que o celular desenha e simplesmente não era visto. Agora ele nasce dentro dela.</li>' +
        '<li><b>⏳ As telas de "Carregando" pararam de mudar de tamanho entre uma tela e outra:</b> a mesma bolinha era desenhada em <b>cinco tamanhos diferentes</b> conforme a tela, e ficava pulando conforme você navegava. Agora ela tem <b>um tamanho só</b> no app inteiro — o que varia é apenas o espaço que o bloco ocupa.</li>' +
        '<li><b>🎨 Na partida casual, a cor do card volta a significar UMA coisa: o time:</b> era possível um jogador que <b>não é do seu time</b> aparecer na cor do seu time (ou sem cor, no meio dos coloridos), o que confundia na hora de conferir as duplas. Agora é tudo ou nada — <b>ou os quatro estão divididos 2×2 e todos ganham a cor do seu time, ou ninguém fica colorido</b>.</li>' +
        '<li><b>✅ Confirmar um placar agora só diz "confirmado" quando realmente gravou:</b> o app avisava sucesso <b>antes</b> de salvar. Se a gravação falhasse, ninguém era avisado — e a pessoa saía certa de ter confirmado, com o jogo ainda <b>pendente</b> no torneio. Agora o aviso vem depois da gravação, e <b>se falhar o app diz que falhou</b> e que o jogo continua pendente.</li>' +
        '<li><b>⏱️ O aviso de "Abrindo o torneio" aparece no ato, e os nomes param de vir cortados ao rolar:</b> o aviso era criado no mesmo instante em que a tela trocava, e o celular só consegue desenhar depois de terminar o que está fazendo — por isso ele demorava a surgir. Agora ele é desenhado <b>antes</b> de a troca começar. E os nomes que ainda não couberam na caixa passam a ser ajustados <b>conforme você rola</b>, e não só os do começo da lista — era isso que fazia o texto vir cortado a partir de uns oito jogos.</li>' +
        '<li><b>👆 Segurar o dedo num torneio não seleciona mais o texto do card — e o toque passa a ser atendido:</b> o card se comportava como um parágrafo de texto, então o iPhone entendia o dedo parado como <b>"selecionar texto"</b> e ficava com o gesto pra ele. Era por isso que o card não acendia e às vezes o toque simplesmente não abria o torneio. Agora o card é tratado como botão: <b>acende ao encostar</b> e abre. Campos de digitação continuam selecionáveis normalmente.</li>' +
        '<li><b>🏢 O logo dos locais seguiu o mesmo caminho:</b> guardado fora da ficha do local, carrega uma vez e fica no cache — a lista de locais monta mais rápido.</li>' +
        '<li><b>👤 Sua foto de perfil também saiu de dentro do cadastro:</b> ela era guardada <b>dentro</b> da sua ficha, então toda vez que o app buscava perfis — e ele busca dezenas de uma vez, pra montar chave, classificação e lista de inscritos — <b>a foto inteira vinha junto de cada um</b>. Agora ela fica num armazenamento de imagens e carrega uma vez só, ficando no cache. Telas com muita gente ficam visivelmente mais rápidas.</li>' +
        '<li><b>🗂️ Logo e capa do torneio passaram a ficar guardados fora da ficha do torneio:</b> eles eram gravados <b>dentro</b> dela e, por isso, iam e voltavam inteiros a cada partida registrada. Agora ficam num armazenamento próprio de imagens: <b>carregam uma vez e ficam no cache</b> do aparelho, em vez de trafegar de novo o tempo todo.</li>' +
        '<li><b>🖼️ As listas de torneios ficaram bem mais leves de montar:</b> a <b>foto de capa e o logo</b> de cada torneio eram embutidos <b>dentro do próprio desenho da tela</b> — num torneio só isso chegava a 194 KB, e a tela inteira tinha que ser processada com tudo isso junto antes de aparecer. Agora o card aparece primeiro e <b>a imagem é pintada logo em seguida</b>, sem ida à internet: mesma foto, tela montada bem mais rápido.</li>' +
        '<li><b>⚡ Abrir um torneio ficou mais leve — e agora avisa que está abrindo:</b> a tela do torneio era a única que montava <b>sem nenhum aviso de carregamento</b>, e o aviso que existia era apagado no meio do caminho — por isso o toque parecia não pegar. Agora o <b>Carregando aparece no mesmo gesto</b> e só sai quando a tela está pronta. Junto: <b>o logo e a capa do torneio pararam de ser reenviados a cada placar registrado</b> — eles eram 62% do peso do torneio e viajavam inteiros a cada partida salva, deixando tudo mais lento pra quem estava acompanhando.</li>' +
        '<li><b>👆 Tocar num torneio responde na hora, venha de onde vier:</b> o card <b>acende assim que o dedo encosta</b> e aparece o aviso de que o torneio está abrindo. Isso já valia na tela inicial, mas <b>na lista de torneios o toque não dava sinal nenhum</b> — dava a impressão de que não tinha pego, e a pessoa tocava de novo. Agora as duas telas passam pelo mesmo caminho.</li>' +
        '<li><b>⏳ O toque responde na hora, os nomes não vêm cortados e voltar pro app não recarrega:</b> tocar num torneio agora mostra o <b>Carregando</b> no mesmo gesto (antes ficava um tempo sem sinal nenhum); os nomes da chave passam a ser ajustados <b>primeiro onde você está olhando — e uma tela e meia adiante</b>, então param de aparecer cortados ao rolar; e <b>voltar pro app</b> deixou de recarregar a tela por baixo de você (a piscada branca com scroll travado) — a atualização espera você trocar de tela.</li>' +
        '<li><b>🧱 A tela inicial também chega pronta:</b> ela pintava e, logo depois, quatro blocos (movimento nos locais, presença, avisos, ao vivo) caíam por cima e <b>empurravam a lista</b> — daí a piscada na abertura e o toque que errava o card. Agora o <b>Carregando</b> segura enquanto isso assenta, com limite de 1,2 segundo para nunca travar.</li>' +
        '<li><b>🧊 Rolagem solta, toque de primeira e torneio entregue pronto:</b> com as dicas de volta, dois problemas antigos apareceram — o balãozinho <b>engolia o toque</b> mirado no card (daí precisar tocar 2 ou 3 vezes) e a tela era <b>medida a cada evento de rolagem</b>, o que travava o scroll em torneios grandes. Os dois foram corrigidos. E a chave do torneio agora é montada <b>atrás do "Carregando"</b> e entregue pronta, em vez de aparecer em pedaços.</li>' +
        '<li><b>👆 O toque funciona de primeira, e a lista não vem mais cortada:</b> os cards das listas eram desenhados só quando entravam na tela — e por isso apareciam cortados ao rolar e <b>engoliam o primeiro toque</b> (o dedo servia só para "acordar" o card). Foi desligado. Além disso, abrir um torneio grande deixava o app travado por um tempo: os perfis eram buscados <b>um por um</b> (143 idas ao servidor no Confra) e agora vão em <b>lotes de 10</b> — cerca de 15 idas.</li>' +
        '<li><b>👆 A tela inicial parou de se redesenhar embaixo do seu dedo:</b> ela se repintava sempre que <b>qualquer pessoa</b> lançava um placar — daí a piscada preta ao entrar e o toque no torneio que precisava de <b>dois cliques</b> (o card era destruído entre o toque e o clique). Agora só se redesenha quando entra ou sai torneio da sua lista. Placar novo você vê ao abrir o torneio, que é onde ele é olhado. E a chave voltou a aparecer de uma vez só, sem o pisca-pisca da versão anterior.</li>' +
        '<li><b>💬 As dicas voltaram, e a tela inicial parou de piscar duas vezes:</b> a otimização anterior fazia o app pular o desenho do que está fora da tela — e com isso o <b>balãozinho de dica</b> não achava mais onde se encaixar e simplesmente não aparecia. Foi retirada. E, ao abrir o app, a descoberta de torneios e a resposta do servidor chegavam separadas e repintavam a tela duas vezes: agora os dois pedidos viram <b>uma repintura só</b>.</li>' +
        '<li><b>🚀 A chave aparece na hora:</b> em vez de esperar a tela inteira ficar pronta, o app pinta primeiro o <b>topo</b> (cabeçalho, progresso e avisos) e traz os jogos logo em seguida. Medido em torneio de 100+ jogos: o que levava cerca de <b>1,5 segundo</b> de tela parada agora aparece em <b>menos de um décimo</b> disso, e o resto entra enquanto você já está lendo.</li>' +
        '<li><b>⚡ A chave do torneio abre bem mais rápido:</b> em torneio grande (100+ jogos) a tela levava segundos parada até desenhar. Duas mudanças, medidas no mesmo torneio: o app parou de repetir a mesma formatação em cada linha de cada jogo (o HTML da chave caiu de <b>779 KB para 611 KB</b>) e agora o celular só desenha o que está <b>na tela</b> — o resto aparece conforme você rola. Nada mudou de lugar nem sumiu: busca, filtro e o pulo pro seu jogo continuam iguais.</li>' +
        '<li><b>🧱 A tela do torneio não abre mais pela metade:</b> logo depois de uma atualização, o app podia carregar <b>um arquivo novo junto de um velho</b> — e aí a chave parava de desenhar no meio, deixando a tela cortada (ou preta). Agora cada peça nova é chamada com rede de segurança: na pior das hipóteses ela desenha como antes, nunca quebra a tela. Também deixamos a faixa de <b>Ao vivo agora</b> só existir quando há jogo ao vivo — antes ela custava trabalho de desenho em toda abertura de chave, para na maioria das vezes não mostrar nada.</li>' +
        '<li><b>🔴 Ao vivo agora:</b> quando alguém está marcando um jogo no <b>placar ao vivo</b> — casual ou de torneio —, ele aparece numa faixa vermelha logo abaixo do topo da tela inicial (e no topo da chave do torneio). Toque e você <b>assiste ao placar sendo preenchido em tempo real</b>, na mesma tela de quem está em quadra, sem poder mexer. No fim, o resumo da partida com o <b>replay</b> ponto a ponto. Jogos do seu torneio e de amigos vêm primeiro; sem nenhum jogo ao vivo, a faixa nem aparece. O convite para assistir sai no <b>primeiro ponto</b> (abrir o placar para conferir a configuração não avisa ninguém), e <b>torneio privado só aparece para quem está nele</b>. Quem está inscrito no torneio recebe esse convite — e quem não quiser desliga em <b>Perfil → Avisar quando um placar ao vivo começar</b>.</li>' +
        '<li><b>🏅 Categoria também para quem joga série com nome de medalha:</b> em torneios cujas categorias se chamam <b>Ouro, Prata e Bronze</b>, a ficha ficava sem categoria nenhuma (“—”). Agora o app lê a escada certa (<b>Ouro=B, Prata=C, Bronze=D</b>) e, quando a categoria não diz a letra, aproveita o <b>nome da competição</b> — mas só para quem ficaria sem nenhuma, nunca para reavaliar quem já tem a sua.</li>' +
        '<li><b>📈 Liderar o ranking da sua categoria agora conta:</b> quem está no <b>pódio da tabela</b> do ranking em que joga ganha o <b>+</b> (e a bolinha anda um pouco para cima). Antes esse sinal dependia de saber o tamanho da tabela — que o letzplay não informa — e por isso nunca aparecia para ninguém.</li>' +
        '<li><b>🖥️ A tela inicial parou de piscar:</b> depois de carregar, a dashboard se redesenhava a cada atualização que chegava do servidor — e cada redesenho dava uma <b>piscada preta</b>. Ela tinha uma trava justamente pra isso, mas a trava nunca fechava: as duas pontas do controle comparavam coisas diferentes. Agora a tela só se redesenha quando algo <b>realmente</b> muda (torneio novo, resultado lançado) — uma vez, sem piscar.</li>' +
        '<li><b>🙋 Quem ficou de fora da rodada volta a aparecer pelo NOME:</b> na caixa “Ficaram de fora desta rodada” (desativados, lista de espera e W.O.) e nas tabelas de classificação, gente com conta e perfil completo podia aparecer como <b>“Jogador sem perfil (…)”</b>. O nome era desenhado <b>antes</b> de os perfis carregarem, e aquele pedaço da tela nunca era repintado — então o rótulo ficava até sair e voltar. Agora cada nome é preenchido assim que o perfil chega, e a <b>busca</b> encontra a pessoa pelo nome de verdade.</li>' +
        '<li><b>📉 Categoria alta precisa de lastro:</b> uma letra apoiada em <b>um torneio só</b>, em que a pessoa também não se firma na categoria de baixo, deixa de ser mantida lá em cima — ela desce um degrau. Quem joga muito na categoria (mesmo perdendo) e quem <b>ganha</b> na de baixo não são afetados: perder na sua categoria é diferente de não ser dela.</li>' +
        '<li><b>🟢 A cor da Análise de Inscritos passou a seguir a categoria, não o rating:</b> quem joga torneio na D e ranking na C é <b>D+</b> — e <b>D+ inscrita na D está no lugar</b>, então fica verde. Antes o rating do letzplay mandava na cor, e uma pessoa com 9 jogos no ranking dele aparecia reprovada na própria categoria. O que ainda manda subir é <b>título</b>: ganhar a categoria é prova, ir bem num ranking social é direção.</li>' +
        '<li><b>🎯 A bolinha da régua vai onde a categoria diz:</b> ela seguia os pontos do letzplay, então dava para aparecer <b>D+</b> escrito com a bolinha lá no <b>B</b>. Agora rótulo e desenho contam a mesma história — e o sinal desloca a bolinha para dentro da letra (<b>D−</b> logo abaixo do D, <b>D+</b> logo acima).</li>' +
        '<li><b>🔒 A Política de Privacidade passou a descrever a extensão do letzplay:</b> o que ela lê, para onde os dados vão e o que ela <b>não</b> coleta (nunca senha, cookie ou credencial; nenhum outro site além de letzplay.me e scoreplace.app).</li>' +
        '<li><b>📬 Um contato só, em todo lugar:</b> a política, os termos e as mensagens de erro agora dão o mesmo endereço — <b>contato@barthlabs.com</b>. Antes cada tela apontava um diferente.</li>' +
        '<li><b>♀️ “Co-organizadora” para de virar “Co-organizador(a)”:</b> quando o app abria do zero, o perfil de quem organiza ainda não tinha chegado e o rótulo saía na forma neutra — e ficava assim, porque a tela não se redesenhava só por isso. Agora o rótulo se corrige sozinho quando o perfil chega, como o nome já fazia.</li>' +
        '<li><b>⚡ O app volta a abrir e carregar rápido:</b> cada aviso de placar guardava uma <b>cópia da foto</b> de quem lançou o resultado — até <b>95 KB por aviso</b>, dentro da sua caixa de notificações. Na abertura, o app baixava todas essas fotos só pra escrever o número do <b>sininho</b>, e a tela ficava no ar sem dados enquanto isso. A foto saiu — ela nunca era mostrada ali — e o sininho passou a ler só o suficiente para escrever o número (ele nunca mostra mais que “9+”).</li>' +
        '<li><b>➖ O “−” chega em quem joga a categoria e ainda não se firmou nela:</b> quem disputa a C com frequência mas fica no piso aparece como <b>C−</b>. Quem só encosta lá de vez em quando continua <b>D+</b> — está buscando, não chegou.</li>' +
        '<li><b>📅 A categoria passa a sair dos jogos RECENTES:</b> a letra vem de onde a pessoa jogou <b>por último</b> em torneio, não da categoria mais alta que ela disputou algum dia. Torneio de 2022 deixa de mandar em quem mudou de categoria desde então.</li>' +
        '<li><b>♀️ A categoria volta a mostrar “Feminina” / “Masculina”:</b> o gênero não estava sendo encontrado e o rótulo saía pelado (“D+” em vez de “Feminina D+”).</li>' +
        '<li><b>👤 Quem teve duas contas unidas volta a ser encontrado pela conta certa:</b> quando duas contas viram uma, a antiga <b>não</b> some — ela fica como um registro apontando para a nova, com o <b>mesmo telefone, e-mail e nome</b>. Por isso uma busca podia cair na conta antiga e o app agir sobre ela: transferir a organização, convidar co-organizador(a) e mandar aviso podiam ir para o lugar onde a pessoa não entra mais — e ela não recebia nada. Agora toda busca por telefone, e-mail, nome ou @ do letzplay chega na conta em uso. No <b>Análise de Inscritos</b> isso também aparecia ao contrário: quando as duas contas casavam com o mesmo e-mail, o app achava “duas pessoas” e desistia de vincular — agora entende que é uma só. E as contas antigas deixaram de aparecer na lista de <b>Convidar</b>.</li>' +
        '<li><b>🔄 A proposta de placar agora aparece sozinha para quem está com o torneio aberto:</b> quem já estava na tela do torneio <b>não via</b> o placar proposto chegar — o card só ganhava o <b>✅ Confirmar</b> depois de sair e voltar. O app comparava um campo de placar que não existia mais e não olhava a proposta, então concluía que “nada mudou”. Agora placar lançado, placar corrigido, contra-proposta e jogo contestado atualizam a tela na hora.</li>' +
        '<li><b>✅ O organizador agora confirma o placar pendente com um toque:</b> quando o adversário não está com o app na mão, o jogo ficava travado esperando aprovação — e o organizador só tinha “Editar”, tendo que relançar o mesmo placar para destravar. Agora ele tem o <b>✅ Confirmar</b> ao lado do Editar. No <b>Rei/Rainha</b> isso não era azar: como as duplas rodam, se só duas pessoas do grupo usam o app existe sempre um dos três jogos em que elas jogam <b>juntas</b> — e esse jogo ficava sem ninguém do outro lado para aprovar.</li>' +
        '<li><b>🧹 Uma categoria só na ficha:</b> saíram o “faixa” e o texto do motivo. Fica <b>“Feminina C+”</b> e pronto — inteiro, do jeito que se usa para inscrever.</li>' +
        '<li><b>🎯 A categoria com sinal entrou na ficha:</b> no lugar do rótulo mais difícil já disputado alguma vez na vida, aparece a categoria atual com <b>+</b> ou <b>−</b> — e o <b>motivo</b> ao lado (“busca a de cima”, “domina a própria”, “base da categoria”).</li>' +
        '<li><b>🔞 Faixa etária e rodada não são mais confundidas com categoria:</b> uma inscrição em <b>“46 a 50 anos”</b> fazia o <b>“a”</b> ser lido como <b>categoria A</b> — e um jogador D aparecia como A. “Rodada: 131” caía no mesmo lugar.</li>' +
        '<li><b>➕➖ O sinal agora tem três origens:</b> quem <b>busca a categoria de cima</b>, quem <b>ganha quase tudo</b> na própria e quem está no <b>topo da tabela</b> levam “+”; quem está na <b>base</b> leva “−”. Quem está no meio, equilibrado, fica sem sinal.</li>' +
        '<li><b>➕ O “+” da categoria ganhou significado:</b> quem joga torneio na D e ranking na C é <b>D+</b> — “é D, mas está buscando a C”. E o sinal só vale com resultado: sem ganhar nada na categoria de cima, continua D. (Cálculo pronto; a tela passa a usá-lo em seguida.)</li>' +
        '<li><b>📏 Uma régua só, com meia-categoria:</b> a faixa passa a ser <b>D-, D+, C-, C+, B-, B+</b> — a metade mostra se a pessoa acabou de chegar na categoria ou já está encostando na de cima. Antes a régua era escolhida pelo <b>gênero</b>, o que media homens e mulheres por escalas diferentes sem motivo.</li>' +
        '<li><b>🏷️ Nome de torneio não aparece mais como categoria:</b> o rótulo cru do letzplay às vezes é o nome inteiro do evento, e ele ocupava o lugar da categoria na ficha. Agora só rótulos curtos e de verdade entram ali.</li>' +
        '<li><b>🧹 Saiu o campo “forma”:</b> era a mesma informação que a régua abaixo já mostra, em formato pior.</li>' +
        '<li><b>🏃 Leitura do letzplay volta ao ritmo normal muito mais rápido:</b> quando o letzplay limitava, o passo lento ficava guardado por <b>6 horas</b> — e as leituras seguintes herdavam a lentidão mesmo já liberadas (20 jogos levando mais de 3 minutos). Agora esse prazo é de 20 minutos.</li>' +
        '<li><b>↙️ Volta atrás nas duas últimas mudanças de gravação do histórico:</b> depois delas nenhuma leitura do letzplay conseguia salvar, nem as pequenas. O caminho de gravação voltou ao estado em que estava funcionando.</li>' +
        '<li><b>💾 Salvar alterações recarrega a tela:</b> ao mudar a categoria de um inscrito e salvar, as <b>cores</b> agora acompanham na hora — antes continuavam mostrando o veredito anterior.</li>' +
        '<li><b>🚦 A cor do nome passa a medir a DISTÂNCIA até o nível real:</b> quem tem nível B e se inscreve na D fica <b>vermelho</b>; um nível abaixo fica <b>âmbar</b>; no lugar certo, <b>verde</b>. Antes, sem título na conta, quase tudo dava verde — mesmo alguém jogando duas categorias abaixo.</li>' +
        '<li><b>⏱️ Leitura de perfis longos deixa de ficar rodando à toa:</b> quando o letzplay limitava as consultas, a leitura passava a esperar até <b>1 minuto por página</b> — um histórico grande levaria mais de uma hora e nunca fechava. Agora, se a limitação for pesada, ela <b>para e avisa</b>, guardando o que já leu para continuar depois.</li>' +
        '<li><b>🌑 A tela não fica mais preta ao abrir:</b> ao trocar de tela, o conteúdo antigo saía antes de o novo estar pronto — e nesse intervalo aparecia o fundo da página. Agora, se a tela ficaria vazia, ela mostra <b>“Carregando…”</b>.</li>' +
        '<li><b>🔄 Leitura antiga do letzplay pede releitura:</b> o app agora confere <b>com qual versão da extensão</b> o histórico foi lido. Quem leu antes das correções de placar e de nomes deixa de contar como concluído — porque o dado está inteiro, mas errado.</li>' +
        '<li><b>👤 Nome de jogador chega inteiro:</b> nomes com mais de duas palavras vinham cortados (“Artur” no lugar de “Artur Luíz C Diegues”) e o pedaço que sobrava <b>vazava para o parceiro</b> — virava “Diegues Ricardo Pettaná”. São 299 nomes assim.</li>' +
        '<li><b>🎾 Jogos decididos no tie-break voltam a contar certo:</b> placares como <b>"55–6"</b> eram na verdade <b>5(4)–6</b> — o tie-break vinha colado no número. Pior: a conta de quem ganhou usava esse número, então <b>a vitória e a derrota saíam trocadas</b> nesses jogos. Agora quem venceu vem do próprio letzplay, e o placar aparece limpo.</li>' +
        '<li><b>🏅 A classificação do letzplay volta a mostrar o nome de cada um:</b> a lista saía com a MESMA pessoa em todas as posições (ou com iniciais tipo "AR", ou sem nome). O leitor pegava o nome do link do <i>avatar</i> e, quando não achava, repetia o da linha de cima. Some também o item fantasma "U · Feed", que duplicava um ranking com endereço errado.</li>' +
        '<li><b>📍 A tela para de pular depois de chegar no grupo:</b> ao abrir um grupo pelo botão, a tela chegava no lugar certo e <b>saltava</b> logo em seguida. Havia dois mecanismos disputando a rolagem; agora só um posiciona.</li>' +
        '<li><b>🎯 “Ir para o torneio” acerta o grupo já na primeira vez:</b> na primeira abertura a tela parava <b>abaixo</b> do grupo (o cabeçalho, com a classificação, ficava escondido) e só acertava na segunda. Era a barra de busca fixa, que ainda não existia no instante da rolagem — o recuo do topo saía menor do que o necessário. Agora a rolagem se corrige sozinha até o grupo ficar exatamente no lugar.</li>' +
      '</ul>' +
    '</div>' +

    // ── v1.8 ─────────────────────────────────────────────────────────────────
    '<div style="margin-bottom:1rem;border:2px solid #a78bfa;border-radius:12px;padding:14px 16px;background:rgba(167,139,250,0.08);">' +
      '<div style="font-weight:800; color:var(--sp-c-c4b5fd,#c4b5fd); font-size:1rem; margin-bottom:8px;">\uD83C\uDFC5 v1.8 \u2014 Sua coloca\u00e7\u00e3o calculada, conta duplicada que o app pergunta antes, e o app s\u00f3 abre quando terminou de carregar <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(Agosto, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🎯 “Ir para o torneio” abre no grupo que você clicou:</b> antes o botão levava para o <b>topo do torneio</b>; agora a chave abre já rolada no <b>grupo daquele card</b>, com a classificação dele à vista. Se o grupo não existir mais (re-sorteio, fase avançada), a tela volta a rolar para o seu próximo jogo em vez de ficar parada no topo.</li>' +
        '<li><b>🔢 Vitórias e derrotas centralizadas:</b> no card de nível, os números voltaram ao centro da caixa — continuam alinhados entre si, sem o traço que os desencontrava.</li>' +
        '<li><b>🚨 Tela preta deixou de ser um desfecho possível:</b> quando o desenho de uma tela falhava, o app ficava com a área de conteúdo <b>vazia</b> — e vazio no tema escuro é uma tela preta, sem nenhuma explicação e sem nada registrado. Agora qualquer falha vira um aviso legível, com botões de <b>tentar de novo</b> e <b>início</b>, e o erro é reportado automaticamente para conserto.</li>' +
        '<li><b>🎯 “Ir para o torneio” em cada grupo:</b> nas <b>Novidades no seu torneio</b> e em <b>Seus últimos resultados</b>, cada grupo ganhou um botão à direita do título que leva direto para a chave e a classificação daquele torneio.</li>' +
        '<li><b>⏱️ Relógios alinhados à direita:</b> na caixa de contagem regressiva, os tempos ficaram alinhados à direita e o título com o ícone à esquerda — sem voltar a cortar o rótulo (“Fim da r…”), porque agora ele quebra em duas linhas em vez de ser truncado.</li>' +
        '<li><b>📊 Card de nível mais limpo:</b> saiu o “letzplay + scoreplace” repetido embaixo do total, o traço entre vitórias e derrotas (que desalinhava os números) e a <b>maior sequência</b> passou a ter o mesmo destaque da sequência atual.</li>' +
        '<li><b>🔥 Sequência de vitórias agora conta TODOS os seus jogos:</b> o número da sequência saía apenas do <b>letzplay</b>, enquanto o total ao lado já somava letzplay + scoreplace — então ele podia mostrar uma sequência antiga e errada. Agora ele mescla tudo em ordem de data: <b>1 vitória no letzplay + 2 no scoreplace contam 3</b>, e qualquer derrota zera. O tile também passou a mostrar o seu <b>recorde</b> de vitórias seguidas.</li>' +
        '<li><b>🧮 O total de V/D parou de divergir de vez:</b> depois de igualar a <i>conta</i>, os dois lugares ainda mostravam números diferentes — porque calculavam igual sobre <b>entradas diferentes</b>. A ficha somava também as partidas casuais guardadas no aparelho (as que ainda não subiram), e o contador da tela inicial as descartava. Agora os dois usam a mesma entrada. De quebra, as partidas <b>em rajada</b> guardadas no aparelho, que escapavam do filtro, também deixaram de contar.</li>' +
        '<li><b>📊 Vitórias e derrotas: um número só no app inteiro:</b> a sua ficha de atleta e o contador da tela inicial mostravam totais <b>diferentes</b> — a ficha somava o letzplay com apenas uma parte das suas partidas do scoreplace (as que a tela por acaso tinha carregado), enquanto o contador somava o histórico completo. Agora os dois usam a mesma conta: <b>casuais + torneios + rankings</b>, sem partidas em rajada. Qualquer contador novo herda a mesma regra.</li>' +
        '<li><b>⚡ O app voltou a responder na hora:</b> a tela inicial estava <b>engasgando</b> — no celular, tocar no menu parecia não fazer nada e só abria depois de vários toques. Não era travamento: a tela montava <b>muito mais do que mostrava</b>. Os blocos recolhíveis (Encerrados, Torneios ocultados) eram construídos por inteiro mesmo <b>fechados</b>, e os encerrados chegavam a ser montados <b>duas vezes</b>. Agora um bloco recolhido só é montado quando você o abre. Medido na mesma base: <b>55% menos conteúdo desenhado e o tempo de montagem caiu 91%</b>.</li>' +
        '<li><b>🚫 Partida “em rajada” deixou de contar nas estatísticas:</b> um 6-0 lançado em <b>poucos segundos</b> é teste do sistema, não jogo disputado — e contá-lo era caminho aberto para inflar aproveitamento. Agora partidas casuais com <b>menos de 2 minutos</b> de jogo, e as que terminam <b>0-0</b>, são ignoradas em todo lugar: número de partidas, vitórias, aproveitamento, sequência e ficha do atleta. Registro antigo sem duração cronometrada <b>não</b> é descartado — falta de medida não é prova de rajada. As que já existiam foram removidas.</li>' +
        '<li><b>📋 Modo Lista voltou a mostrar os Encerrados — e o “nenhum torneio” sumiu:</b> na visualização em lista, a seção recolhível de encerrados não aparecia, e a mensagem <b>“Nenhum torneio encontrado”</b> saía mesmo com torneios na tela. A mensagem agora só aparece quando a tela está realmente vazia, considerando também as faixas do topo, os encerrados e os ocultados.</li>' +
        '<li><b>📅 Histórico de Atividades do torneio: o último evento em cima:</b> a lista vinha em ordem crescente, então num torneio jogando em agosto o topo mostrava inscrições de maio — e o <b>“Ver eventos anteriores”</b> ficava acima de tudo, oferecendo o passado antes do presente. Agora o mais recente vem primeiro e o “ver anteriores” fica no fim.</li>' +
        '<li><b>⚔️ “Partidas” passou a somar tudo:</b> o número na tela inicial contava só as partidas do scoreplace, enquanto a sua ficha de atleta, na mesma sessão, mostrava outro total marcado “letzplay + scoreplace”. Agora, quem tem histórico do letzplay importado vê <b>casuais + torneios + rankings</b> num número só.</li>' +
        '<li><b>🔆 “Últimas Partidas” legível no tema Claro:</b> no bloco de partidas casuais, o time <b>perdedor</b> ficava praticamente invisível — os nomes eram brancos fixos e a linha inteira era esmaecida. Isso funciona no tema escuro e falha no claro (esmaecer contra o branco apaga o texto). Agora o time perdedor recua pelo <b>tom</b>, não pela transparência, e os nomes acompanham o tema. A verificação automática de contraste passou a barrar também essa forma.</li>' +
        '<li><b>🔔 O sino parou de apontar para avisos que a tela não mostrava:</b> a lista de notificações carregava só as <b>50 mais recentes</b>, enquanto o sino contava <b>todas</b> as não lidas. Quem tinha aviso não lido mais antigo que a 50ª posição via o pontinho vermelho para sempre, sem nenhum jeito de chegar até ele. Agora a tela traz as recentes <b>e todas as não lidas</b>, que aparecem no topo; no fim da lista há um <b>Carregar mais</b> para o histórico antigo.</li>' +
        '<li><b>🏁 Torneio encerrado não divide mais espaço com os que estão rolando:</b> encerrados apareciam misturados na lista principal, logo abaixo da faixa “Em andamento”. Agora vão sempre para a seção recolhível <b>Encerrados</b>, no fim — em qualquer filtro. A única exceção é o encerrado nas últimas 12 horas, que fica na lista de propósito para todo mundo ver o resultado fresco.</li>' +
        '<li><b>🔔 Aviso já resolvido para de ficar marcado como não lido:</b> o sininho não zerava por causa de avisos de <b>placar que o outro time já aprovou</b> — o card dizia “✅ Resultado já confirmado” e mesmo assim ele nunca saía dos não lidos. A regra era “aviso que pede uma ação só é marcado quando a ação acontece”, e ela valia até para os que <b>não tinham mais ação nenhuma</b>. Agora vale o estado: resolvido, o aviso é marcado como lido depois de <b>5 segundos na tela</b>, como qualquer outro. Aviso que <b>ainda</b> pede decisão (confirmar placar, aceitar convite, pedido de amizade) continua esperando por você.</li>' +
        '<li><b>📲 “Instalar app” virou “Baixar na App Store”:</b> o botão da tela inicial criava um atalho do site; agora leva <b>direto para a ficha do scoreplace.app na loja</b>. Ele <b>não aparece</b> para quem já está no app instalado das lojas, nem no computador, e <b>só aparece quando a loja daquele aparelho já publicou o app</b> — a Google Play ainda está em teste fechado, então no Android o botão fica de fora até a ficha sair (mandar para uma página inexistente seria pior). No dia em que ela sair, o botão e o selo do convite impresso aparecem juntos.</li>' +
        '<li><b>📋 Os filtros da tela inicial passaram a varrer a plataforma inteira:</b> <b>Todos</b>, <b>Inscrições abertas</b> e <b>Encerrados</b> mostravam só os torneios <b>seus</b> — organizados por você ou em que você joga. O rótulo dizia “Todos” e o número marcava <b>3</b> num app com dezenas de torneios. Agora os três varrem tudo o que existe na plataforma, <b>inclusive de outros organizadores</b>, e o número no botão conta a mesma coisa que a lista mostra.</li>' +
        '<li><b>🙈 Torneio que você ocultou fica sempre em “Torneios ocultados”:</b> a seção recolhível no fim da tela agora lista <b>todos</b> os que você escondeu — abertos, em andamento ou encerrados — <b>em qualquer filtro</b>. Assim você acha o que ocultou sem adivinhar qual filtro faz ele reaparecer, e ele não volta a se misturar na lista principal.</li>' +
        '<li><b>📱 O convite impresso anuncia que o app está nas lojas:</b> o cartaz de convite (do app e dos torneios) ganhou a chamada da <b>App Store</b> e do <b>Google Play</b> — quem recebe o papel já sabe que dá pra instalar, em vez de só abrir o site.</li>' +
        '<li><b>✉️ O botão de convidar ganhou ícone de convite:</b> era um celular (📱), que remetia a “aplicativo” e não a “convite”. Virou envelope.</li>' +
        '<li><b>🌦️ A previsão do tempo diz DE ONDE — e ficou legível sobre a foto:</b> ela aparecia sem dizer a que local se referia; agora traz o <b>local do torneio</b> logo abaixo do título. E, no <b>tema Claro</b>, o texto dentro da caixa sobre a foto do local estava escuro sobre fundo escuro — quase invisível na descrição, na umidade/vento e em “PRÓXIMOS DIAS”. Corrigido: a caixa mantém o fundo escuro e o texto voltou a ser claro.</li>' +
        '<li><b>✂️ Nome de torneio parou de ser cortado:</b> nomes longos (o gerado automaticamente com o e-mail de quem criou, por exemplo) apareciam <b>truncados</b> no card. Agora o nome <b>diminui de tamanho</b> até caber, em vez de sumir na borda — e a mesma regra passou a valer nas outras telas onde o texto podia vazar.</li>' +
        '<li><b>👁️ O botão “Ocultar” voltou a aparecer no card:</b> ele usava um tom quase invisível no tema Claro. Agora acompanha o tema, nos dois.</li>' +
        // ⚠️ 1.8.90 tem uma parte que NÃO ganhou item próprio, e é DECISÃO: os contadores
        // dos botões de filtro. São a MESMA entrega do item dos filtros acima — na 1.8.89
        // troquei a fonte da LISTA e esqueci a dos NÚMEROS, e o dono seguiu vendo “Todos 3”.
        // Dois itens contariam duas vezes o mesmo conserto.
        '<li><b>▶️ Replay da partida:</b> partida jogada com o <b>placar ao vivo</b> agora guarda o <b>ponto a ponto</b>. No <b>card do jogo na chave</b> e no histórico aparece um botão <b>Replay</b> que reproduz a partida inteira em ~10 segundos — game a game, com quem sacava — e termina mostrando as <b>estatísticas do jogo</b>, as mesmas do fim da partida ao vivo. Vale pra <b>torneio</b> e pra <b>partida casual</b>, e <b>qualquer pessoa</b> pode assistir — não só quem jogou. <i>(Só partidas jogadas a partir desta versão: antes disso o ponto a ponto não era gravado.)</i></li>' +
        '<li><b>\ud83d\udd06 Tema Claro leg\u00edvel de ponta a ponta:</b> o app foi desenhado olhando o tema escuro, e v\u00e1rios destaques s\u00f3 funcionavam l\u00e1. No <b>Claro</b>, caixas que deveriam se destacar ficavam <b>brancas sobre branco</b> \u2014 o caso mais vis\u00edvel \u00e9 o <b>quadrinho do placar</b> na chave, quase da mesma cor do card do jogo \u2014 e textos de destaque sa\u00edam em tons p\u00e1lidos <b>ileg\u00edveis</b>, como na <b>Previs\u00e3o do Tempo</b>. Foi feita uma varredura do tema Claro inteiro, medindo o contraste de cada texto e de cada caixa: as caixas invis\u00edveis <b>acabaram</b> e as cores de destaque passaram a ter vers\u00e3o pr\u00f3pria pro fundo claro.</li>' +
        '<li><b>\u23f1\ufe0f A caixa de ESPERA voltou a ser lida:</b> ao lado de <b>INSCRITOS</b>, a caixa que mostra quantas pessoas est\u00e3o na lista de espera usava um fundo \u00e2mbar clarinho <b>por cima</b> da tarja escura das outras \u2014 no tema Claro isso deixava n\u00famero e r\u00f3tulo quase invis\u00edveis. Agora ela usa a <b>mesma tarja</b> das irm\u00e3s, com a identidade \u00e2mbar na borda e no texto.</li>' +
        '<li><b>\ud83c\udff7\ufe0f Etiquetas de status leg\u00edveis no tema Claro:</b> as etiquetas coloridas (<b>Sorteio Realizado</b>, o formato do torneio e afins) usavam tom claro sobre fundo claro \u2014 a verde chegava a ficar praticamente invis\u00edvel. Todas ganharam tom pr\u00f3prio no tema Claro.</li>' +
        '<li><b>\ud83d\udd12 Contraste virou regra travada, nos dois temas:</b> passou a existir uma verifica\u00e7\u00e3o autom\u00e1tica que <b>impede publicar</b> qualquer tela que quebre o contraste \u2014 no tema Claro <b>e</b> no Escuro. Vale pro que j\u00e1 existe e pro que for criado daqui pra frente.</li>' +
        '<li><b>\ud83d\udd35 Voc\u00ea joga sempre de AZUL, e os slots pararam de trocar:</b> no placar ao vivo voc\u00ea podia aparecer no time <b>vermelho</b>, e os jogadores sem nome digitado <b>trocavam de n\u00famero</b> a cada re-sorteio (quem era \u201cJogador 2\u201d virava outro). Eram duas coisas: o app s\u00f3 reconhecia voc\u00ea se tivesse <b>foto de perfil</b>, e o nome curto na tela n\u00e3o batia com o nome completo do perfil. Agora voc\u00ea \u00e9 reconhecido pelos dois, fica sempre no <b>azul, no primeiro lugar</b>, e o n\u00famero de cada jogador <b>gruda na pessoa</b> \u2014 o re-sorteio troca as duplas, n\u00e3o os cr\u00e1chas.</li>' +
        '<li><b>\ud83c\udf24\ufe0f Previs\u00e3o do tempo na TELA INICIAL, no torneio e na CHAVE:</b> ela existia s\u00f3 na tela de detalhe do torneio \u2014 e ainda assim ficava <b>invis\u00edvel</b> por cima da foto do clube, porque o fundo dela era quase transparente. Agora aparece <b>abaixo do cron\u00f4metro da rodada em todas as telas onde esse cron\u00f4metro existe</b> (tela inicial, torneio e chave), com <b>agora</b>, <b>hoje</b> e os <b>pr\u00f3ximos dias</b> \u2014 e escurece junto com as outras caixas quando h\u00e1 foto, pra dar leitura.</li>' +
        '<li><b>\ud83c\udfc6 O rel\u00f3gio do \u201cTorneio completo\u201d destravou:</b> ele contava do <b>primeiro placar at\u00e9 o \u00faltimo</b> \u2014 e como o \u00faltimo placar n\u00e3o anda sozinho, o n\u00famero ficava <b>parado</b> entre um jogo e outro. Pior: durante a 1\u00aa fase esses dois placares s\u00e3o os mesmos da fase, ent\u00e3o dois rel\u00f3gios mostravam <b>o mesmo valor</b>. Agora o torneio inteiro conta da sua pr\u00f3pria r\u00e9gua \u2014 do <b>in\u00edcio programado</b> at\u00e9 o <b>final real</b> (ou at\u00e9 agora, enquanto corre) \u2014 e anda de verdade, segundo a segundo.</li>' +
        '<li><b>\u23f3 A \u201cLista de espera\u201d finalmente d\u00e1 leitura sobre a foto do local:</b> as caixinhas de <b>Inscritos</b>, <b>Equipes</b> e <b>Lista de espera</b> ficavam lavadas por cima da foto do clube. A tentativa anterior n\u00e3o resolveu porque o card s\u00f3 descobre que <b>tem</b> foto depois que ela \u00e9 pintada \u2014 at\u00e9 l\u00e1 as caixas eram montadas como se o fundo fosse liso. Agora elas escurecem no momento em que a foto entra, e o \u00e2mbar da espera clareia para sobreviver a fotos claras.</li>' +
        '<li><b>\u2b50 A coroa do organizador ficou ao lado do nome:</b> no bloco <b>Organiza\u00e7\u00e3o</b> ela era empurrada para a borda do card e ficava solta, longe de quem ela qualifica. Agora vem logo depois do nome, em qualquer largura de tela.</li>' +
        '<li><b>\ud83d\udd12 \u201cTravar propor\u00e7\u00e3o\u201d subiu para a linha do t\u00edtulo:</b> na <b>Lista de espera</b>, o interruptor dividia a linha com o texto explicativo e acabava jogado sozinho para baixo. Foi para o alto, \u00e0 direita, na mesma linha do t\u00edtulo \u2014 e a explica\u00e7\u00e3o ficou logo abaixo.</li>' +
        '<li><b>\u2715 O bot\u00e3o de limpar a busca ficou f\u00e1cil de acertar no celular:</b> o \u2715 que apaga o texto da barra de busca tinha o tamanho do pr\u00f3prio desenho \u2014 errar por poucos mil\u00edmetros fazia o toque cair no campo atr\u00e1s, que abria o menu de <b>copiar/colar</b> em vez de limpar. O desenho continua igual, mas a <b>\u00e1rea que responde ao toque mais que dobrou</b> e agora ocupa a altura inteira do campo.</li>' +
        '<li><b>\ud83c\udff7\ufe0f O nome do grupo e o do torneio em duas linhas, e sem repetir:</b> em <b>\u201cSeus \u00faltimos resultados\u201d</b> e <b>\u201cNovidades no seu torneio\u201d</b> o grupo e o torneio vinham colados na mesma linha, e o torneio sumia cortado no celular. Agora o <b>grupo fica em cima e o torneio embaixo</b> \u2014 e quando v\u00e1rios jogos s\u00e3o do mesmo grupo e do mesmo torneio, esse t\u00edtulo aparece <b>uma vez s\u00f3</b>, em vez de se repetir em cada jogo.</li>' +
        '<li><b>\ud83d\udd35 \u201cVer mais\u201d no lugar da setinha:</b> a seta de abrir/fechar dessas duas se\u00e7\u00f5es era discreta demais e passava despercebida. Saiu, e no lugar entrou uma etiqueta <b>\u201cver mais\u201d / \u201cver menos\u201d</b> \u00e0 direita do t\u00edtulo, em azul-claro. As duas se\u00e7\u00f5es tamb\u00e9m voltam <b>recolhidas</b> (s\u00f3 o jogo mais recente) toda vez que voc\u00ea sai da tela inicial e volta.</li>' +
        '<li><b>\ud83d\udd14 Notifica\u00e7\u00e3o s\u00f3 vira \u201clida\u201d se voc\u00ea realmente a viu:</b> ao abrir as notifica\u00e7\u00f5es, <b>todas</b> eram marcadas como lidas na hora \u2014 inclusive as que estavam muito abaixo e voc\u00ea nunca chegou a ver. Agora s\u00f3 conta a que <b>apareceu na tela e ficou 5 segundos</b>. Passar batido numa rolagem r\u00e1pida n\u00e3o marca nada, e convites e pedidos que esperam resposta sua continuam de fora \u2014 esses s\u00f3 saem da lista quando voc\u00ea responde.</li>' +
        '<li><b>\u23f3 A \u201cLista de espera\u201d voltou a dar leitura sobre a foto do local:</b> no card do torneio com foto, a caixinha da espera ficava quase invis\u00edvel \u2014 fundo transparente e n\u00famero \u00e2mbar por cima da imagem. Ela passou a usar a <b>mesma tarja escura</b> das caixas vizinhas, com o \u00e2mbar mais claro.</li>' +
        '<li><b>\ud83c\udf24\ufe0f Previs\u00e3o do tempo no torneio:</b> logo abaixo do cron\u00f4metro da rodada agora aparece o tempo <b>no local do torneio</b> \u2014 <b>agora</b> (temperatura, umidade e vento), <b>hoje</b> (m\u00ednima e m\u00e1xima) e os <b>pr\u00f3ximos dias</b>, com a chance de chuva de cada um. A previs\u00e3o j\u00e1 existia na tela de criar torneio; agora ela tamb\u00e9m fica onde voc\u00ea acompanha o jogo.</li>' +
        '<li><b>\ud83d\udd35 Voc\u00ea \u00e9 sempre o time azul, no primeiro nome:</b> a cada \u201cJogar novamente\u201d o seu nome pulava de lado \u2014 uma hora azul, outra vermelho \u2014 e \u00e0s vezes aparecia um <b>\u201cJogador 1\u201d</b> no lugar onde voc\u00ea deveria estar. Agora a sua posi\u00e7\u00e3o \u00e9 fixa: <b>voc\u00ea, seu parceiro, e os dois advers\u00e1rios</b>, nessa ordem, em todos os jogos da sess\u00e3o.</li>' +
        '<li><b>\ud83d\udc51 O 3\u00ba jogo do Rei/Rainha volta a ser oferecido:</b> depois de dois jogos com duplas diferentes, o app sugere fechar a s\u00e9rie \u2014 mas o sorteio do 2\u00ba jogo podia <b>repetir a mesma dupla</b> do 1\u00ba, e a\u00ed a s\u00e9rie nunca completava e a sugest\u00e3o n\u00e3o aparecia. O re-sorteio passou a <b>nunca repetir</b> uma dupla j\u00e1 jogada: o 2\u00ba jogo traz uma combina\u00e7\u00e3o nova e o 3\u00ba traz exatamente a que falta.</li>' +
        '<li><b>\ud83d\udc4b A sauda\u00e7\u00e3o da tela inicial ficou maior:</b> o \u201cBem-vindo(a),\u201d em cima do seu nome estava quase como legenda. Cresceu \u2014 continua menor que o nome, que \u00e9 a parte que se quer ler, mas agora d\u00e1 pra ler os dois.</li>' +
        '<li><b>\ud83c\udfc5 O s\u00edmbolo do app dobrou de tamanho nas telas de carregamento:</b> o p\u00f3dio acima do nome <b>scoreplace.app</b> era pequeno demais para as telas que todo mundo v\u00ea em toda abertura. Cresceu nas <b>duas</b>: a de abertura do app e a que aparece no meio do caminho (entrar, sortear, salvar). <i>(No app das lojas, chega na pr\u00f3xima atualiza\u00e7\u00e3o.)</i></li>' +
        '<li><b>\u2696\ufe0f A chave \u201cTravar propor\u00e7\u00e3o\u201d foi para a borda direita:</b> na Lista de espera, o nome agora fica \u00e0 <b>esquerda</b> e a chave \u00e0 <b>direita</b>, encostada na borda da caixa \u2014 antes era o contr\u00e1rio, com a chave no meio da linha. Assim o alvo de toque fica onde o polegar alcan\u00e7a, igual aos outros bot\u00f5es do grupo.</li>' +
        '<li><b>\ud83c\udfc5 \u201cSeus \u00faltimos resultados\u201d fechada deixou de ficar vazia:</b> a se\u00e7\u00e3o vem recolhida pra n\u00e3o ocupar a tela toda \u2014 s\u00f3 que, fechada, ela n\u00e3o mostrava <b>nada</b>: um t\u00edtulo e uma setinha, sem nenhuma pista do que tinha dentro. Agora ela faz igual a \u201cNovidades no seu torneio\u201d: o <b>jogo mais recente fica \u00e0 vista</b> e os anteriores ficam recolhidos, com um \u201cver os N anteriores\u201d embaixo. Se houver um placar <b>esperando a sua aprova\u00e7\u00e3o</b>, \u00e9 ele que aparece \u2014 \u00e9 o que pede a\u00e7\u00e3o sua.</li>' +
        // \u26a0\ufe0f 1.8.67 tem uma 4\u00aa mudan\u00e7a que N\u00c3O ganhou item, e \u00e9 DECIS\u00c3O: o torneio SANDBOX
        // (o "(SB) \u2026", que s\u00f3 o desenvolvedor enxerga) deixou de entrar em "Novidades" e em
        // "Seus \u00faltimos resultados". Ele \u00e9 um clone do torneio real, ent\u00e3o duplicava cada
        // jogo na tela inicial de quem o criou \u2014 e ningu\u00e9m mais no app chega a ver um SB.
        // Anunciar isso seria descrever, pra todo mundo, um sintoma que s\u00f3 existia pra uma
        // pessoa. A trava (check-release-notes) pega OMISS\u00c3O e n\u00e3o sabe julgar isso \u2014 o
        // motivo fica aqui.
        '<li><b>\ud83d\udce3 \u201cNovidades no seu torneio\u201d mostra o lan\u00e7amento de HOJE, mesmo antes de ser confirmado:</b> a se\u00e7\u00e3o s\u00f3 mostrava jogo com o resultado <b>j\u00e1 confirmado pelos dois lados</b> \u2014 e como a confirma\u00e7\u00e3o pode demorar horas, o topo continuava exibindo um jogo da v\u00e9spera com o torneio andando naquele momento. Agora o placar aparece <b>assim que \u00e9 lan\u00e7ado</b>, no topo da lista, marcado como <b>PENDENTE \u00b7 \u23f3 Aguardando aprova\u00e7\u00e3o</b> e dizendo quem lan\u00e7ou \u2014 ou seja, voc\u00ea v\u00ea o que acabou de acontecer sem confundir com resultado final. Se depois for contestado, a se\u00e7\u00e3o mostra isso tamb\u00e9m.</li>' +
        '<li><b>\ud83d\udcf1 \u201cNovidades no seu torneio\u201d passou a ocupar a tela inteira:</b> os jogos eram desenhados <b>um por linha</b>, ent\u00e3o em tela larga sobrava metade da tela vazia \u2014 bem ao lado de \u201cSeus \u00faltimos resultados\u201d, que j\u00e1 usava a largura toda. Agora as duas se\u00e7\u00f5es seguem a mesma regra: <b>1, 2 ou 3 jogos por linha</b> conforme o tamanho da tela.</li>' +
        '<li><b>\ud83c\udfbe O placar do tie-break aparece tamb\u00e9m enquanto o resultado espera aprova\u00e7\u00e3o:</b> um set decidido no tie-break \u00e9 mostrado como <b>6\u207d\u2077\u207e</b> depois de confirmado \u2014 mas, enquanto estava <b>aguardando a confirma\u00e7\u00e3o do outro lado</b>, o card exibia s\u00f3 <b>5</b> e <b>6</b> secos. Os pontos do tie-break estavam gravados desde o lan\u00e7amento; era a tela que n\u00e3o os lia. Agora quem confere o placar v\u00ea o mesmo n\u00famero que vai ficar registrado.</li>' +
        '<li><b>\ud83d\udccd Quem marcou presen\u00e7a aparece VERDE na classifica\u00e7\u00e3o do grupo:</b> na tabela do seu grupo, quem tocou em \u201cCheguei\u201d ganha uma bolinha verde e o nome pintado de verde \u2014 d\u00e1 pra ver de relance <b>quem j\u00e1 est\u00e1 no local e quem falta</b>. Antes a \u00fanica pista era o pontinho de presen\u00e7a <i>por time</i> no card do jogo, que n\u00e3o dizia qual das duas pessoas tinha chegado.</li>' +
        '<li><b>\ud83e\udeaa A ficha do jogador parou de esconder os bot\u00f5es sob o rel\u00f3gio do iPhone:</b> ao tocar no nome de algu\u00e9m, o cabe\u00e7alho da ficha (Voltar + amizade) abria <b>colado no topo da tela</b>, embaixo do rel\u00f3gio/sinal/bateria \u2014 e ali o toque nem chega (o iPhone reserva essa faixa pro sistema), ent\u00e3o o Voltar parecia quebrado. Agora o cabe\u00e7alho desce pra baixo dessa faixa e os bot\u00f5es respondem. <i>(No app instalado; tamb\u00e9m vale pro nativo na pr\u00f3xima atualiza\u00e7\u00e3o das lojas.)</i></li>' +
        '<li><b>\ud83d\udcc5 O bot\u00e3o \u201cCombinar jogos\u201d parou de alargar quando chega proposta:</b> o numerinho de propostas ficava ao lado do texto e esticava o bot\u00e3o, empurrando o \u201ceditar\u201d do grupo de WhatsApp pro lado. Agora o n\u00famero mora no canto de baixo, ao lado de \u201cjogos\u201d, e o texto fica alinhado \u00e0 esquerda \u2014 o bot\u00e3o tem a mesma largura com ou sem propostas.</li>' +
        '<li><b>\ud83d\udee0\ufe0f Corre\u00e7\u00e3o de emerg\u00eancia \u2014 tela preta na vers\u00e3o anterior:</b> a 1.8.72 subiu com um erro que impedia a tela inicial de desenhar (um detalhe de escrita no c\u00f3digo da sauda\u00e7\u00e3o nova). Corrigido, e agora existe uma verifica\u00e7\u00e3o autom\u00e1tica que barra esse tipo de erro antes de publicar.</li>' +
        '<li><b>\ud83d\udc4b A sauda\u00e7\u00e3o da tela inicial ficou em duas linhas:</b> "Bem-vindo," agora vem menor por cima e o <b>seu nome</b> grande embaixo. Numa linha s\u00f3, a sauda\u00e7\u00e3o gastava a largura toda e obrigava o nome \u2014 a parte que a pessoa quer ler \u2014 a encolher.</li>' +
        '<li><b>\ud83c\udfbe Tela de carregamento com o logo maior:</b> o s\u00edmbolo saiu do canto esquerdo, cresceu e passou a ficar <b>centralizado acima</b> do nome scoreplace.app.</li>' +
        '<li><b>\u2194\ufe0f Bot\u00f5es de W.O. mais estreitos:</b> "Aplicar W.O.", "Reverter W.O." e a etiqueta de quem saiu \u2192 quem entrou passaram a quebrar em duas linhas, e o "Aplicar W.O." voltou a ficar colado na <b>borda direita</b>. Assim o cabe\u00e7alho do grupo cabe numa linha s\u00f3 em vez de embolar.</li>' +
        '<li><b>\u26a0\ufe0f O bot\u00e3o de W.O. agora diz "Aplicar W.O." e fica sempre no mesmo lugar:</b> no cabe\u00e7alho do grupo, o bot\u00e3o vermelho escrito s\u00f3 <b>"W.O."</b> era f\u00e1cil de confundir com o <b>selo</b> que a tabela p\u00f5e ao lado de quem levou W.O. \u2014 a mesma palavra, uma sendo aviso e a outra a\u00e7\u00e3o. Agora ele traz o verbo. E a posi\u00e7\u00e3o parou de dan\u00e7ar: quando o grupo j\u00e1 tinha um W.O. aplicado, a etiqueta da substitui\u00e7\u00e3o e o "Reverter" nasciam depois do bot\u00e3o e o empurravam para o meio da linha; agora ele \u00e9 sempre o <b>\u00faltimo</b>, na mesma ponta, com ou sem W.O. aplicado.</li>' +
        '<li><b>\ud83d\udd14 As notifica\u00e7\u00f5es de placar acompanham o jogo:</b> um aviso de "resultado precisa de aprova\u00e7\u00e3o" \u00e9 um retrato do momento em que foi enviado \u2014 mas o jogo continua andando. Depois que o placar j\u00e1 foi confirmado, o aviso continuava oferecendo <b>Confirmar</b> e <b>Contestar</b>, pedindo uma decis\u00e3o que n\u00e3o existia mais (e que a chave ia recusar). Agora, com o resultado j\u00e1 resolvido, esses dois bot\u00f5es <b>somem</b>, o aviso diz "Resultado j\u00e1 confirmado" e sobra s\u00f3 o <b>Editar</b> \u2014 porque corrigir um placar continua sendo poss\u00edvel. Cada aviso decide sozinho: numa lista com um jogo resolvido e outro pendente, s\u00f3 o pendente mostra o Confirmar.</li>' +
        '<li><b>\u231a O rel\u00f3gio passa a contar sozinho (o app j\u00e1 manda o que ele precisa):</b> o placar que viaja pro rel\u00f3gio agora leva tamb\u00e9m <b>as regras da partida</b> (games por set, tie-break, contagem) e a <b>identidade do jogo</b>. \u00c9 o que faltava para o rel\u00f3gio marcar ponto <b>no pr\u00f3prio pulso</b>, sem depender do celular acordado a cada toque \u2014 a causa de a partida ter travado no torneio. O placar oficial continua sendo calculado e gravado pelo celular, como sempre. <i>(Chega ao pulso na pr\u00f3xima atualiza\u00e7\u00e3o do app nas lojas.)</i></li>' +
        '<li><b>\u231a Preparo para o rel\u00f3gio jogar sozinho:</b> o app passou a aceitar o <b>di\u00e1rio de jogo</b> do rel\u00f3gio \u2014 a lista de pontos, desfazimentos e trocas de saque registrados <b>no pulso</b>, que chega ao celular quando os dois se falam de novo. \u00c9 a base para o rel\u00f3gio funcionar com o celular na bolsa ou bloqueado (hoje ele depende do celular acordado a cada toque, que foi o que travou a partida no torneio). O placar oficial continua sendo calculado pelo celular, exatamente como sempre. <i>(Sem efeito vis\u00edvel ainda \u2014 o rel\u00f3gio s\u00f3 passa a usar isso na pr\u00f3xima atualiza\u00e7\u00e3o do app nas lojas.)</i></li>' +
        '<li><b>\u21b6 D\u00e1 pra desfazer o \u00faltimo ponto MESMO com a partida terminada:</b> no placar ao vivo, um toque acidental no ponto final encerrava a partida e n\u00e3o havia caminho de volta \u2014 a tela de fim n\u00e3o oferecia o Desfazer. Agora oferece: o jogo <b>reabre</b> no placar de antes do ponto, voc\u00ea segue jogando e, quando terminar de verdade, o resultado corrigido \u00e9 o que fica gravado \u2014 na chave do torneio e no seu hist\u00f3rico, <b>sem duplicar</b> nada.</li>' +
        '<li><b>\u231a O rel\u00f3gio n\u00e3o fica mais preso na tela de fim de set:</b> quando o app do celular recarregava (o que acontece a cada atualiza\u00e7\u00e3o ou reabertura), o rel\u00f3gio podia <b>descartar em sil\u00eancio</b> tudo o que chegava depois e congelar no resultado antigo \u2014 mesmo com o jogo seguinte j\u00e1 rolando no celular. O placar que viaja pro rel\u00f3gio agora carrega a identifica\u00e7\u00e3o da sess\u00e3o, e o rel\u00f3gio reconhece o recome\u00e7o na hora. <i>(Chega ao pulso na pr\u00f3xima atualiza\u00e7\u00e3o do app nas lojas.)</i></li>' +
        '<li><b>\u2665 Batimento no rel\u00f3gio: leitura mais viva e faixas calibr\u00e1veis:</b> a leitura do BPM passou a vir direto do sensor em cad\u00eancia de treino (antes fazia uma volta que atrasava e perdia os picos \u2014 voc\u00ea sentia 160+ e a tela mostrava o vale de segundos atr\u00e1s), e o perfil ganhou o campo opcional <b>\u2665 FC m\u00e1xima</b>: preenchido, ele calibra as 5 faixas de queima com a SUA frequ\u00eancia real, no lugar da f\u00f3rmula gen\u00e9rica 220 \u2212 idade. <i>(A leitura nova chega ao pulso na pr\u00f3xima atualiza\u00e7\u00e3o do app nas lojas; o campo do perfil j\u00e1 vale.)</i></li>' +
        '<li><b>\ud83d\uddc4\ufe0f Torneios novos passam a guardar os jogos num lugar s\u00f3:</b> por hist\u00f3ria, os jogos da <b>fase classificat\u00f3ria</b> eram guardados num lugar e os da <b>chave</b> em outro \u2014 e cada corre\u00e7\u00e3o no motor tinha que ser feita duas vezes, com risco de uma delas ficar diferente. Agora <b>torneio novo</b> guarda tudo no mesmo lugar. Os torneios que j\u00e1 existem <b>n\u00e3o s\u00e3o movidos</b> \u2014 nada do que j\u00e1 foi sorteado ou jogado \u00e9 tocado \u2014 e continuam funcionando exatamente como antes. Pra voc\u00ea, nada muda na tela: os dois formatos passaram a ser desenhados de forma id\u00eantica.</li>' +
        '<li><b>\ud83c\udfb2 O \u201csorteio\u201d como crit\u00e9rio virou a ORDEM DA CHAVE \u2014 e a classifica\u00e7\u00e3o parou de mudar sozinha:</b> quando o desempate chegava no \u201csorteio\u201d, o app tirava um n\u00famero <b>aleat\u00f3rio na hora</b> \u2014 ou seja, a mesma classifica\u00e7\u00e3o podia aparecer numa ordem a cada vez que a tela era desenhada. Agora vale a <b>ordem em que as pessoas aparecem na chave</b>: quem est\u00e1 num jogo mais cedo conta como sorteado antes. \u00c9 est\u00e1vel e, principalmente, <b>confer\u00edvel</b> \u2014 qualquer participante olha a chave e entende por que ficou naquela posi\u00e7\u00e3o.</li>' +
        '<li><b>\ud83c\udfc1 Entre quem caiu na MESMA fase, valem os seus crit\u00e9rios:</b> na elimin\u00e1toria, a ordem entre os eliminados na mesma rodada seguia uma regra fixa que terminava em <b>ordem alfab\u00e9tica</b> \u2014 o acaso do nome decidindo coloca\u00e7\u00e3o. Agora seguem os <b>crit\u00e9rios de desempate que voc\u00ea configurou</b>, como no resto do torneio.</li>' +
        '<li><b>\ud83d\udcca Buchholz e Sonneborn-Berger passam a valer tamb\u00e9m no Rei/Rainha:</b> esses dois crit\u00e9rios podiam ser escolhidos na configura\u00e7\u00e3o, mas nos torneios de Rei/Rainha n\u00e3o tinham efeito \u2014 a tabela n\u00e3o os calculava. Agora calcula, com a mesma f\u00f3rmula da Fase de Grupos.</li>' +
        '<li><b>\ud83c\udf82 Quem preencheu a data de nascimento leva vantagem sobre quem omitiu:</b> nos crit\u00e9rios <b>antiguidade</b> e <b>juventude</b>, quando s\u00f3 uma das pessoas tem a data no perfil, <b>ela passa na frente</b> \u2014 nos dois crit\u00e9rios, inclusive no de \u201cmais novo\u201d. Quem deixou em branco n\u00e3o \u00e9 beneficiado pela omiss\u00e3o. S\u00f3 quando <b>nenhum dos dois</b> preencheu \u00e9 que o crit\u00e9rio n\u00e3o decide e a disputa passa pro pr\u00f3ximo.</li>' +
        '<li><b>\ud83c\udd94 O confronto direto passou a identificar as pessoas pela conta em TODOS os formatos:</b> na <b>Fase de Grupos</b> ele ainda casava pelo nome escrito \u2014 o \u00faltimo lugar do app que fazia isso. Nome muda quando algu\u00e9m se renomeia e se repete entre hom\u00f4nimos, ent\u00e3o o crit\u00e9rio podia cair na pessoa errada. Agora \u00e9 sempre pela conta, como no resto do app.</li>' +
        '<li><b>\u2696\ufe0f Os crit\u00e9rios de desempate que voc\u00ea configurou passam a valer em TODAS as fases:</b> a tela de <b>Crit\u00e9rios de Desempate</b> deixa o organizador escolher quais valem, em que ordem, e tirar os que n\u00e3o quer. Isso j\u00e1 era respeitado nos torneios de <b>Pontos Corridos</b> e <b>Fase de Grupos</b> \u2014 mas a tabela do <b>Rei/Rainha</b> e a ordem que decide <b>quem sobe pra eliminat\u00f3ria</b> usavam uma sequ\u00eancia fixa, ignorando a sua configura\u00e7\u00e3o. Agora vale o que voc\u00ea configurou, em qualquer fase e em qualquer formato. <b>E o \u201cconfronto direto\u201d passou a olhar quem venceu quem de verdade</b>, identificando as pessoas pela conta (e n\u00e3o pelo nome escrito, que muda quando algu\u00e9m se renomeia).</li>' +
        '<li><b>\ud83c\udf82 \u201cMais velho\u201d e \u201cmais novo\u201d voltam a desempatar de verdade:</b> quem escolhia <b>antiguidade</b> ou <b>juventude</b> como crit\u00e9rio n\u00e3o via efeito nenhum \u2014 em nenhum torneio, em nenhuma fase. O app lia a data de nascimento num formato e o perfil a guardava em outro, ent\u00e3o a data simplesmente n\u00e3o era entendida e o crit\u00e9rio era pulado em sil\u00eancio. Agora \u00e9 lida nos dois formatos. \u26a0\ufe0f Quem n\u00e3o tem data de nascimento no perfil continua sem ser desempatado por ela \u2014 o app <b>nunca chuta</b> uma idade.</li>' +
        '<li><b>\ud83e\uddee A tabela e a chave passam a usar a MESMA ordem:</b> a classifica\u00e7\u00e3o que voc\u00ea v\u00ea na tela e a ordem que decide <b>quem sobe pra fase eliminat\u00f3ria</b> eram calculadas por <b>duas regras diferentes</b> \u2014 a da tela desempatava por sets, games, tie-breaks e aproveitamento; a da eliminat\u00f3ria parava antes e, no empate, mantinha a ordem em que os grupos foram lidos. Na pr\u00e1tica: dava pra estar na frente na tabela e ficar atr\u00e1s na hora de montar a chave. Agora \u00e9 <b>uma regra s\u00f3</b>, e o que est\u00e1 na tela \u00e9 o que vale. <b>Nenhum torneio em andamento muda</b> \u2014 conferido contra os dados reais: os classificados continuam os mesmos.</li>' +
        '<li><b>\ud83c\udd94 A fase de grupos passa a guardar QUEM \u00e9 cada pessoa, como o resto do app j\u00e1 fazia:</b> nos torneios com <b>fase de grupos</b>, os jogos eram gravados s\u00f3 com o nome escrito no dia do sorteio \u2014 enquanto os torneios de Rei/Rainha j\u00e1 guardavam a <b>identidade</b> de cada jogador desde o sorteio. Na pr\u00e1tica: quem trocasse o nome no perfil continuaria aparecendo com o antigo nos jogos e na tabela do grupo. Agora as duas formas gravam igual, e o nome mostrado vem sempre do perfil. <b>Nenhum confronto muda</b> \u2014 os grupos e os jogos s\u00e3o exatamente os mesmos; mudou o que fica guardado junto. Quem joga sem conta continua entrando normalmente, identificado pelo nome.</li>' +
        '<li><b>\ud83c\udfd7\ufe0f A elimin\u00e1toria pode come\u00e7ar por uma rodada que FORMA as duplas \u2014 agora tamb\u00e9m depois de uma classificat\u00f3ria:</b> j\u00e1 dava pra fazer um torneio que <b>abre direto na elimin\u00e1toria com uma rodada Rei/Rainha</b> (grupos de 4 em que as duplas se formam pelo resultado). Mas essa op\u00e7\u00e3o <b>desaparecia</b> se o torneio tivesse fase classificat\u00f3ria \u2014 ent\u00e3o o arranjo mais natural de todos n\u00e3o existia: jogar a classificat\u00f3ria, e s\u00f3 os <b>classificados</b> fazerem a rodada que define as duplas da elimin\u00e1toria. Agora existe, e a coloca\u00e7\u00e3o da classificat\u00f3ria vale de verdade: os melhores viram <b>cabe\u00e7as de chave</b> e caem em grupos diferentes, em vez de se encontrarem logo. O torneio passa a ter tr\u00eas etapas \u2014 classificat\u00f3ria \u2192 forma\u00e7\u00e3o das duplas \u2192 elimin\u00e1toria.</li>' +
        '<li><b>\ud83c\udfaf A fase eliminat\u00f3ria passa a saber <i>quem</i> \u00e9 cada pessoa, n\u00e3o s\u00f3 o nome escrito:</b> quando a fase de grupos termina e o app monta a chave eliminat\u00f3ria, cada confronto era gravado apenas com o <b>nome do jeito que estava escrito no dia do sorteio</b>. Quem trocasse o nome no perfil depois continuaria aparecendo com o antigo justamente na chave que decide o campe\u00e3o \u2014 e o app n\u00e3o teria como corrigir sozinho. Agora cada lado do confronto guarda a <b>identidade</b> de quem joga, ent\u00e3o o nome mostrado vem sempre do perfil, atualizado. Os confrontos e a classifica\u00e7\u00e3o continuam <b>exatamente os mesmos</b>: mudou o que fica guardado, n\u00e3o quem joga contra quem. Vale tamb\u00e9m para a <b>tabela do grupo</b>, que passou a mostrar o nome atual mesmo em grupos antigos.</li>' +
        '<li><b>\ud83c\udfc5 \u201cSeus \u00faltimos resultados\u201d mostra mesmo os 3 mais recentes:</b> a lista da tela inicial j\u00e1 cortava em tr\u00eas \u2014 o problema era a <b>ordem</b>. Jogos aprovados pelo caminho normal (uma dupla prop\u00f5e, a outra confirma) entravam na lista como se n\u00e3o tivessem hora nenhuma e perdiam a vez para partidas <b>bem mais antigas</b>. Resultado: voc\u00ea acabava de jogar e a lista continuava mostrando um jogo de semanas atr\u00e1s. Agora vale a hora em que o resultado foi <b>confirmado</b>, para todo mundo.</li>' +
        '<li><b>\ud83d\udd12 Jogo j\u00e1 encerrado n\u00e3o aceita placar novo:</b> uma partida com resultado <b>j\u00e1 confirmado</b> ainda podia receber uma proposta de placar de quem estava jogando \u2014 e a partida reabria como se o resultado estivesse em d\u00favida. Agora, com o jogo encerrado, o app avisa que o placar j\u00e1 foi confirmado e orienta a <b>falar com o organizador</b>, que \u00e9 quem pode corrigir. Organizador e \u00e1rbitro seguem podendo ajustar normalmente.</li>' +
        '<li><b>\u26a1 Publicar uma versão nova deixou de custar uma tela branca:</b> quando sai uma atualização, o app troca para a versão nova — e até agora ele fazia isso do jeito mais radical possível: <b>apagava tudo o que tinha guardado no seu aparelho</b> e recarregava do zero. Resultado: na <b>primeira vez que você abria o app depois de cada publicação</b>, ele precisava buscar mais de cem arquivos pela internet antes de conseguir desenhar qualquer coisa — e você via a tela branca. Como são várias publicações por dia, isso acontecia bastante. Agora a troca é uma <b>passagem de bastão</b>: a versão nova fica pronta em segundo plano e só então assume, <b>sem jogar fora o que já estava guardado</b>. A tela de carregando aparece na hora, como em qualquer outra abertura.</li>' +
        '<li><b>📊 “Seus últimos resultados” passou a ocupar a tela inteira:</b> os cards tinham uma largura máxima fixa, então quando cabia <b>uma coluna só</b> sobrava tela vazia do lado. Agora eles seguem a mesma regra do resto do app: 1, 2, 3 ou 4 colunas conforme o tamanho da tela, sempre ocupando toda a largura.</li>' +
        '<li><b>🔙 O “Voltar” limpa a busca:</b> se você tinha digitado algo na barra de busca e saía da tela pelo <b>Voltar</b>, o filtro continuava valendo por baixo — você voltava para uma lista filtrada por um texto que não aparecia em lugar nenhum, e a tela parecia vazia sem explicação. Agora sair pelo Voltar zera a busca.</li>' +
        '<li><b>📣 “Novidades no seu torneio” só mostra torneio em andamento:</b> torneio já encerrado não popula mais a seção — novidade é o que está acontecendo, e um torneio antigo com dezenas de jogos afogava o que está em curso. O card também passou a ser <b>o mesmo card da chave</b> (foto de cada pessoa, os dois lados da dupla e o subplacar do tie-break), em vez de um desenho próprio só ali.</li>' +
        '<li><b>🙋 O W.O. mostra o nome do perfil, avisa o grupo, e o botão diz o que faz:</b> ao escolher quem faltou, a lista mostrava o <b>nome gravado no dia do sorteio</b> — quem tinha trocado de nome aparecia com o antigo. Agora o nome vem do perfil, vivo. Além disso, ao decretar o W.O. <b>todo o grupo e o substituto passam a ser avisados</b> na hora (antes só o ausente sabia), e o botão diz <b>“Colocar”</b> em vez de um rótulo genérico.</li>' +
        '<li><b>📐 Todo card da chave tem a mesma largura:</b> um jogo com placar <i>pendente</i> era desenhado mais estreito que os vizinhos da mesma coluna (medido: 280px contra 400px). O limite que causava isso não tinha mais razão de existir — os três estados agora saem idênticos.</li>' +
        '<li><b>\u2696\ufe0f O substituto do W.O. respeita a propor\u00e7\u00e3o de g\u00eanero do grupo:</b> ao dar W.O., quem assume a vaga continua vindo da lista de espera \u2014 mas agora o app busca <b>manter a propor\u00e7\u00e3o do torneio</b> (ex.: 25/75, 1 homem e 3 mulheres por grupo). Num grupo s\u00f3 de mulheres, um homem na fila <b>passa na frente</b> e o grupo que estava 0/100 vira 25/75; num grupo que j\u00e1 tem seu homem, \u00e9 a mulher da fila que entra. Em empate, vale a <b>ordem de chegada</b>, como sempre \u2014 e se ningu\u00e9m na fila melhora a propor\u00e7\u00e3o, o primeiro entra do mesmo jeito: a propor\u00e7\u00e3o nunca deixa vaga aberta. O di\u00e1logo de confirma\u00e7\u00e3o diz com todas as letras quando algu\u00e9m entrou na frente da fila e por qu\u00ea.</li>' +
        '<li><b>\ud83d\udce3 Nova se\u00e7\u00e3o \u201cNovidades no seu torneio\u201d:</b> na tela inicial, entre <b>Seu pr\u00f3ximo jogo</b> e <b>Seus \u00faltimos resultados</b>, agora aparecem os <b>\u00faltimos jogos dos outros</b> nos torneios em que voc\u00ea est\u00e1 inscrito \u2014 do mais recente para o mais antigo, pela hora em que o resultado foi lan\u00e7ado. Vem <b>fechada</b>, mostrando s\u00f3 o jogo mais recente; tocando no t\u00edtulo voc\u00ea v\u00ea os anteriores. Jogos que ainda n\u00e3o foram jogados n\u00e3o entram. Quem acabou de se inscrever e ainda n\u00e3o jogou tamb\u00e9m v\u00ea \u2014 \u00e9 justamente quem quer acompanhar.</li>' +
        '<li><b>\ud83c\udfbe O placar do tie-break agora fica registrado e todo mundo v\u00ea:</b> os pontos do tie-break passam a aparecer <b>junto do placar</b>, em cima e entre par\u00eanteses \u2014 um set decidido no tie-break aparece como <b>6\u207d\u2077\u207e</b> em vez de s\u00f3 <b>6</b>. Antes eles podiam ser digitados e <b>sumir na hora de aprovar</b> o resultado, e nem a lista de resultados da tela inicial os mostrava. Vale para quem lan\u00e7ou, para o advers\u00e1rio e para qualquer pessoa que abrir o jogo depois.</li>' +
        '<li><b>\ud83c\udfbe O tie-break tamb\u00e9m aparece ao <i>corrigir</i> um placar j\u00e1 lan\u00e7ado:</b> quando algu\u00e9m j\u00e1 tinha proposto um resultado e o jogo estava <b>aguardando aprova\u00e7\u00e3o</b>, abrir esse placar para ajustar mostrava s\u00f3 os dois n\u00fameros \u2014 os campinhos dos <b>pontos do tie-break</b> n\u00e3o apareciam de jeito nenhum, nem redigitando o placar. Era o \u00fanico caminho em que eles nunca chegavam a existir na tela, ent\u00e3o o placar era salvo <b>sem</b> o tie-break. Agora eles aparecem assim que o placar for o do gatilho (6-5 na regra 5-5, 7-6 na regra 6-6) \u2014 inclusive j\u00e1 abertos ao entrar, quando a proposta que chegou j\u00e1 era um placar de tie-break. Vale para <b>organizador e participantes</b>, na chave e na lista \u201cMeus Resultados\u201d da tela inicial.</li>' +
        '<li><b>\ud83c\udfbe O campo do tie-break volta a abrir no 6-5:</b> ao lan\u00e7ar o placar de um set decidido no tie-break, digitar <b>6-5</b> deixou de abrir os campinhos roxos onde se anotam os <b>pontos do tie-break</b> \u2014 eles s\u00f3 apareciam no 7-6. Acontecia s\u00f3 nos torneios criados pelo <b>atalho r\u00e1pido</b> (o \u201c+Novo Torneio\u201d que j\u00e1 cria com um toque): ali a modalidade era gravada junto com o \u00edcone (\u201c\ud83c\udfbe Beach Tennis\u201d em vez de \u201cBeach Tennis\u201d), e por causa desse detalhe o app deixava de reconhecer o esporte e aplicava a regra do t\u00eanis (tie-break no 6-6, set 7-6) em vez da regra do Beach Tennis (tie-break no 5-5, set 6-5). A pr\u00f3pria tela de configura\u00e7\u00e3o desses torneios j\u00e1 dizia \u201cTie-break em 5-5\u201d \u2014 ou seja, a configura\u00e7\u00e3o prometia 6-5 e o lan\u00e7amento exigia 7-6. Agora o \u00edcone \u00e9 s\u00f3 enfeite da lista: o esporte \u00e9 reconhecido igual das duas formas, os torneios que j\u00e1 existem passam a funcionar <b>sem precisar mexer em nada</b>, e os novos j\u00e1 nascem gravados certo. Quem escolheu a regra na m\u00e3o (5-5 ou 6-6) continua com a sua escolha valendo.</li>' +
        '<li><b>\ud83d\udd11 Entrar ficou dif\u00edcil de errar \u2014 Google e Apple no topo, e o app lembra como voc\u00ea entrou:</b> muita gente voltava depois de um tempo, n\u00e3o lembrava como tinha entrado e acabava <b>criando uma segunda conta</b> sem querer. O login foi reorganizado: <b>Entrar com Google</b> e <b>Entrar com a Apple</b> agora v\u00eam primeiro, o bot\u00e3o que voc\u00ea usou da \u00faltima vez ganha a marca <b>\u201c\u2713 da \u00faltima vez\u201d</b>, e ao digitar um e-mail que j\u00e1 tem conta o app responde na hora <b>como aquela conta entra</b> \u2014 antes de voc\u00ea errar a senha e cair no cadastro. Se voc\u00ea tentar entrar por um caminho novo com um e-mail que j\u00e1 existe, ele oferece <b>conectar os dois \u00e0 mesma conta</b> em vez de criar outra.</li>' +
        '<li><b>\u2709\ufe0f Um e-mail registra como voc\u00ea entra \u2014 e confirma quando algo muda:</b> ao criar a conta voc\u00ea recebe um e-mail com a <b>foto da sua conta</b> (nome, e-mail, celular e as formas de entrar) \u2014 guarde-o: quando n\u00e3o lembrar como entrou, \u00e9 s\u00f3 buscar \u201cscoreplace\u201d na sua caixa. Quando nome, e-mail ou celular mudam, chega uma <b>confirma\u00e7\u00e3o</b> com os dados atualizados. Quem j\u00e1 tem conta recebe o seu uma \u00fanica vez nesta leva. E o app passa a sugerir cadastrar o <b>celular</b>: \u00e9 a forma mais segura de recuperar seu acesso (e o que nos deixa perceber uma conta duplicada antes de ela atrapalhar torneio).</li>' +
        '<li><b>\ud83d\udcdd Inscri\u00e7\u00e3o sem recusa silenciosa \u2014 e sem bloqueio falso em torneio aberto:</b> havia respostas do servidor que a tela <b>engolia</b>: o organizador inscrevia algu\u00e9m com a rodada j\u00e1 sorteada e a pessoa ia pra <b>lista de espera sem nenhuma mensagem</b> (parecia que tinha sumido); inscri\u00e7\u00e3o recusada podia ficar por cima de um aviso de sucesso; e a pergunta <b>\u201cessa conta \u00e9 sua?\u201d</b> da detec\u00e7\u00e3o de conta duplicada nem chegava a abrir em um dos caminhos. Agora <b>todo desfecho tem resposta na tela</b>. E a regra de \u201cinscri\u00e7\u00f5es abertas\u201d virou <b>uma s\u00f3</b>, a mesma do servidor \u2014 fim do caso em que uma temporada com inscri\u00e7\u00f5es abertas bloqueava a inscri\u00e7\u00e3o (ou se fechava sozinha) por causa de um prazo antigo.</li>' +
        '<li><b>\u1fa79 Se o app carregar quebrado, ele se conserta sozinho:</b> \u00e0s vezes um arquivo do app chega <b>pela metade</b> no celular (conex\u00e3o que oscila no meio do download) e fica guardado assim \u2014 o app abre com peda\u00e7os faltando, bot\u00f5es que n\u00e3o respondem, e continua assim mesmo fechando e abrindo. Agora, quando isso acontece, o app percebe, <b>joga fora o que ficou guardado e recarrega uma vez</b>, sozinho. Acontece uma vez s\u00f3 por sess\u00e3o, pra nunca virar recarga em loop.</li>' +
        '<li><b>\u1f464 O app pede o sobrenome \u2014 e passa a reconhecer voc\u00ea mesmo com o nome escrito diferente:</b> quem se cadastra s\u00f3 com o primeiro nome (\u201cBet\u00e2nia\u201d, \u201cFabio\u201d) fica f\u00e1cil de confundir com outra pessoa \u2014 e, se criar uma segunda conta escrevendo o nome completo, o app n\u00e3o percebia que era a mesma pessoa. Aconteceu de verdade: algu\u00e9m acabou <b>em dois grupos do mesmo torneio</b>. Agora o perfil <b>sugere</b> (sem obrigar) que voc\u00ea coloque tamb\u00e9m o sobrenome, e a checagem de conta repetida passa a enxergar o caso \u201cBet\u00e2nia\u201d \u00d7 \u201cMaria Bet\u00e2nia Roberto Faria\u201d \u2014 mas s\u00f3 quando aquele nome \u00e9 <b>raro</b> na base e n\u00e3o \u00e9 sobrenome de outra pessoa, pra n\u00e3o confundir gente diferente que por acaso tem o mesmo primeiro nome. Como sempre, o app <b>pergunta</b> se \u00e9 voc\u00ea \u2014 nunca junta nada sozinho.</li>' +
        '<li><b>\u1f6aa O bot\u00e3o \u201cEntrar\u201d responde ao primeiro toque \u2014 inclusive logo depois de uma atualiza\u00e7\u00e3o:</b> quando o app se atualizava, ele voltava para a tela inicial e o bot\u00e3o <b>Entrar</b> ficava sem reagir: dava para clicar v\u00e1rias vezes <b>sem nada acontecer e sem nenhum aviso</b>. A tela inicial aparece imediatamente, mas o resto do app ainda estava sendo baixado \u2014 e, como a atualiza\u00e7\u00e3o limpa o que estava guardado no aparelho, essa espera ficava longa justamente ali. Agora o toque <b>sempre</b> responde: o bot\u00e3o avisa que est\u00e1 entrando e <b>guarda o seu toque</b>, abrindo a tela de login sozinho assim que o app termina de subir. Voc\u00ea n\u00e3o precisa tocar de novo.</li>' +
        '<li><b>\u1f4cb Entrar na lista de espera voltou a funcionar:</b> em torneio j\u00e1 sorteado, quem clicava para se inscrever via o pr\u00f3prio nome <b>aparecer na lista de espera e sumir logo em seguida</b>, com um erro de permiss\u00e3o \u2014 e ningu\u00e9m entrava na fila. O motivo: para acrescentar <b>uma</b> pessoa numa lista, o app tentava regravar o <b>torneio inteiro</b> a partir do celular, e bastava um detalhe da c\u00f3pia local estar diferente da do servidor para a grava\u00e7\u00e3o toda ser recusada. Agora a entrada na fila \u00e9 feita <b>no servidor</b>, como todos os outros caminhos de inscri\u00e7\u00e3o: ele l\u00ea o torneio atualizado e grava s\u00f3 a lista. O nome tamb\u00e9m deixou de aparecer antes da confirma\u00e7\u00e3o \u2014 era isso que dava a impress\u00e3o de ter entrado e sa\u00eddo.</li>' +
        '<li><b>\u26a1 O app abre na hora \u2014 acabou a tela branca da abertura:</b> abrir o app pelo \u00edcone deixava a tela <b>completamente branca por v\u00e1rios segundos</b> antes de a tela de carregando aparecer, e na segunda vez era mais r\u00e1pido. O motivo estava numa camada que roda <b>antes</b> de qualquer coisa poder ser desenhada: ela buscava arquivos <b>em outro servidor</b> toda vez que o app era aberto do zero, e s\u00f3 depois disso o app come\u00e7ava a ser montado \u2014 no 4G, com o celular acordando a antena, isso custava os segundos de tela branca. Agora essa camada n\u00e3o depende mais de rede nenhuma, e o app passa a ser <b>montado a partir do que j\u00e1 est\u00e1 no seu aparelho</b>: a tela de carregando aparece imediatamente, com internet lenta ou sem internet. As notifica\u00e7\u00f5es e a atualiza\u00e7\u00e3o autom\u00e1tica para a vers\u00e3o nova continuam funcionando igual.</li>' +
        '<li><b>\u23f3 O bot\u00e3o \u201cEntrar\u201d agora avisa que est\u00e1 entrando \u2014 e continua avisando:</b> o feedback existia, mas durava menos de <b>um piscar</b> (medido: sumia em 60 mil\u00e9simos de segundo), ent\u00e3o na pr\u00e1tica era como n\u00e3o existir \u2014 e quem tocava ficava clicando de novo achando que nada tinha acontecido. Agora o bot\u00e3o fica em <b>\u201cEntrando\u2026\u201d</b>, cinza e travado contra toques repetidos, <b>at\u00e9 a tela de login aparecer de verdade</b>. Se ela n\u00e3o abrir, ele avisa em vez de simplesmente voltar ao normal, que era o sil\u00eancio que fazia parecer defeito.</li>' +
        '<li><b>\u2194\ufe0f Bot\u00f5es da ficha do atleta alinhados \u00e0 direita:</b> na ficha, quando o nome \u00e9 comprido, <b>Voltar</b> e <b>Puxar hist\u00f3rico completo</b> passam para a linha de baixo \u2014 e apareciam encostados \u00e0 esquerda, desalinhados do resto. Agora ficam \u00e0 direita nos dois casos, cabendo tudo numa linha ou n\u00e3o.</li>' +
        '<li><b>\u2709\ufe0f Entrou por um convite e criou a conta? J\u00e1 est\u00e1 inscrito:</b> quem chega por um <b>link de convite de torneio</b> e <b>cria a conta ali</b> passa a ser inscrito na hora \u2014 sem precisar procurar o bot\u00e3o \u201cInscrever-se\u201d depois. V\u00e1rias pessoas se cadastravam e paravam no meio do caminho achando que j\u00e1 estavam dentro. O convite hoje j\u00e1 mostra <b>de que torneio se trata</b> antes do clique, ent\u00e3o d\u00e1 pra decidir com a informa\u00e7\u00e3o na m\u00e3o; e a inscri\u00e7\u00e3o vem com um aviso dizendo que <b>voc\u00ea pode se desinscrever a qualquer momento</b> nessa mesma p\u00e1gina. Vale s\u00f3 pra <b>conta nova vinda de convite</b>: quem j\u00e1 tem conta continua entrando pelo bot\u00e3o, e ningu\u00e9m \u00e9 inscrito por s\u00f3 abrir a p\u00e1gina de um torneio.</li>' +
        '<li><b>\ud83c\udfc1 Torneio terminado deixa de dizer \u201cclassifica\u00e7\u00e3o parcial\u201d \u2014 e a sua coloca\u00e7\u00e3o aparece na ficha:</b> num torneio j\u00e1 encerrado, com todas as equipes posicionadas, a classifica\u00e7\u00e3o ainda se anunciava como <b>parcial</b>. Agora quem decide \u00e9 o pr\u00f3prio resultado: fechou quando <b>todo mundo que entrou em quadra</b> tem posi\u00e7\u00e3o \u2014 quem ficou na <b>lista de espera</b> n\u00e3o entra na conta, e quem levou <b>W.O.</b> mant\u00e9m a coloca\u00e7\u00e3o, porque jogou. Enquanto a final ou a disputa de 3\u00ba estiverem em aberto, ela continua dizendo parcial, como deve. Junto com isso, a <b>ficha do atleta</b> passou a mostrar a coloca\u00e7\u00e3o nos torneios <b>daqui</b> (\u201c7\u00ba\u201d), que antes s\u00f3 aparecia nos do letzplay \u2014 uma posi\u00e7\u00e3o por dupla, resolvida pelo perfil de cada pessoa.</li>' +
        '<li><b>\ud83c\udfbe Cada linha da ficha diz de onde veio, logo na abertura:</b> o selo <b>LP</b> (letzplay) e o logo do <b>scoreplace</b> sa\u00edram do fim da linha e passaram a abrir cada item, antes da data. Numa lista que mistura as duas origens, dava trabalho descobrir de onde era cada torneio \u2014 o marcador antigo era o mesmo trof\u00e9u nos dois casos. E o t\u00edtulo <b>FERRAMENTAS DO ORGANIZADOR</b>, que estava apagado por cima da foto do local, voltou a ter contraste (sem crescer de tamanho).</li>' +
        '<li><b>\ud83d\udcf1 No celular o app diz por que a leitura do letzplay n\u00e3o roda ali:</b> tocar em \u201cPuxar hist\u00f3rico completo\u201d abre um aviso explicando que a leitura \u00e9 feita por uma extens\u00e3o do Chrome, que s\u00f3 existe no computador. Antes o bot\u00e3o simplesmente n\u00e3o fazia nada. E a categoria oficial parou de exibir o nome do torneio junto (\u201c11\u00ba BT House Open - MASCULINA C\u201d virou \u201cMASCULINA C\u201d).</li>' +
        '<li><b>\ud83e\uddf9 Nome de torneio repetido, e a leitura mais silenciosa:</b> alguns torneios do letzplay chegavam com o nome escrito duas vezes ("TORNEIO RP 2026 - 10 anos - TORNEIO RP 2026 - 10 anos") \u2014 agora aparecem uma vez s\u00f3, inclusive nas leituras j\u00e1 feitas. E a barra de progresso parou de exibir avisos t\u00e9cnicos sobre a leitura: ela mostra o passo em curso e o tempo decorrido, e mais nada.</li>' +
        '<li><b>\ud83e\udde9 Extens\u00e3o nova: o app manda pro caminho que funciona:</b> quando sai uma vers\u00e3o nova da extens\u00e3o do letzplay, a Chrome Web Store leva alguns dias revisando. Nesse intervalo o app parava de importar e mandava voc\u00ea pra loja \u2014 que ainda tinha a vers\u00e3o antiga, e o Chrome respondia \u201cj\u00e1 est\u00e1 atualizada\u201d. Agora, enquanto a revis\u00e3o n\u00e3o sai, ele oferece o download direto \u2014 sem tirar a loja da tela, que continua ali como o destino permanente. Quando a vers\u00e3o sair por l\u00e1, o download some sozinho e o Chrome volta a atualizar tudo automaticamente.</li>' +
        '<li><b>\ud83c\udfc5 At\u00e9 onde voc\u00ea chegou no torneio \u2014 e com quem:</b> a ficha do atleta passa a dizer a <b>coloca\u00e7\u00e3o entre TODOS os participantes</b>, n\u00e3o a posi\u00e7\u00e3o dentro do grupo: Campe\u00e3o, Vice, 3\u00ba/4\u00ba na semifinal, 5\u00ba/7\u00ba nas quartas \u2014 sempre com a fase entre par\u00eanteses e o nome da sua dupla ao lado. Posi\u00e7\u00e3o dentro do grupo ("GRUPO 03 \u00b7 2\u00ba de 3") deixou de aparecer: ela n\u00e3o diz nada sobre o torneio. Quando n\u00e3o d\u00e1 pra apurar a coloca\u00e7\u00e3o geral, a linha fica sem coloca\u00e7\u00e3o \u2014 em ranking, a posi\u00e7\u00e3o continua saindo normalmente, porque ali ela j\u00e1 \u00e9 a classifica\u00e7\u00e3o inteira.</li>' +
        '<li><b>\ud83d\udcac Um bot\u00e3o s\u00f3 para o grupo do torneio no WhatsApp:</b> o grupo geral do evento aparecia em <b>dois lugares</b> \u2014 ao lado de Inscrever-se/Desinscrever-se e de novo nas Ferramentas do Organizador. Ficou <b>um s\u00f3</b>, no topo: quem \u00e9 organizador abre por ele o painel completo (<b>criar, trocar, abrir e compartilhar</b>) e quem est\u00e1 inscrito entra no grupo com um toque. E o t\u00edtulo <b>FERRAMENTAS DO ORGANIZADOR</b> voltou a usar a fonte de t\u00edtulo do app, maior e mais leg\u00edvel.</li>' +
        '<li><b>\ud83c\udfc5 A classifica\u00e7\u00e3o final fecha at\u00e9 o 4\u00ba lugar \u2014 e o W.O. fica no jogo em que aconteceu:</b> em torneios com <b>disputa de 3\u00ba lugar</b>, a classifica\u00e7\u00e3o podia parar no 2\u00ba e pular direto pro 5\u00ba, aparecendo como <b>parcial</b> mesmo com tudo jogado. Agora quem decide o 3\u00ba e o 4\u00ba \u00e9 <b>o jogo que foi disputado</b>. E quem levou W.O. em <b>uma</b> partida deixou de sumir das outras: continua aparecendo nos jogos que jogou.</li>' +
        '<li><b>\ud83d\ude4d Os nomes na chave saem do seu perfil \u2014 e acompanham quando voc\u00ea muda:</b> em torneios de <b>dupla</b>, os cards podiam mostrar <b>\u201cJogador sem perfil (\u2026)\u201d</b> no lugar de todo mundo, mesmo com o torneio e os perfis certos: os nomes eram desenhados antes de os perfis carregarem e ningu\u00e9m os repintava depois. Agora cada nome \u00e9 resolvido pelo <b>perfil do jogador</b> e atualizado assim que ele chega \u2014 inclusive quando a pessoa <b>troca o nome no perfil</b>, sem depender do nome que ficou gravado no dia do sorteio.</li>' +
        '<li><b>\u2705 Leitura completa deixa de aparecer como incompleta:</b> havia perfis em que a leitura terminava, gravava tudo, e mesmo assim a barra parava em 99% e o nome continuava violeta \u2014 <b>reler n\u00e3o resolvia</b>, porque o problema n\u00e3o estava na leitura e sim num contador interno que ficava para tr\u00e1s do que j\u00e1 tinha sido lido. Agora o que vale \u00e9 o <b>acervo</b>: quem tem todas as partidas que a lista do letzplay enumera fecha em 100% e fica verde, sem precisar puxar de novo. Vale tamb\u00e9m para as leituras <b>j\u00e1 gravadas</b>.</li>' +
        '<li><b>\ud83d\udd17 O torneio do scoreplace na sua ficha virou link \u2014 e o Voltar traz voc\u00ea de volta:</b> na ficha do atleta, o nome de um torneio <b>daqui</b> abre a chave dele; o <b>Voltar</b> devolve voc\u00ea exatamente \u00e0 ficha que estava aberta, pra consulta r\u00e1pida sem perder o lugar. A linha tamb\u00e9m passou a mostrar <b>com quem</b> voc\u00ea jogou. E torneio do letzplay que foi lido mas ainda <b>n\u00e3o tem jogos publicados l\u00e1</b> deixou de aparecer mudo: agora ele diz isso, em vez de parecer uma linha quebrada.</li>' +
        '<li><b>\ud83e\udd1d Dupla fixa tem nome; dupla que roda vira \u201cdupla vari\u00e1vel\u201d:</b> em torneio onde a fase de grupos \u00e9 jogada com <b>parceiro rotativo</b> (voc\u00ea joga cada jogo com um), a linha dizia \u201ccom Fulano\u201d \u2014 e Fulano era s\u00f3 <b>o \u00faltimo com quem voc\u00ea jogou</b>. Agora ela diz <b>dupla vari\u00e1vel</b> nesse caso, e continua nomeando a dupla quando ela foi mesmo fixa. Isso tamb\u00e9m corrigiu um erro maior: quem jogou os grupos com parceiros diferentes e depois <b>fixou a dupla e foi campe\u00e3o</b> aparecia como se tivesse parado na fase de grupos.</li>' +
        '<li><b>\ud83d\udd11 A coloca\u00e7\u00e3o passou a aparecer tamb\u00e9m em quem j\u00e1 tinha sido lido:</b> a coloca\u00e7\u00e3o sai da <b>chave do torneio</b>, e a leitura s\u00f3 come\u00e7ou a traz\u00ea-la h\u00e1 poucos dias. Quem foi lido antes disso j\u00e1 contava como \u201clido\u201d, ent\u00e3o a releitura pulava esses torneios e a coloca\u00e7\u00e3o nunca chegava \u2014 na ficha do atleta a maior parte das linhas ficava sem nada. Agora um torneio sem a chave volta a ser aberto <b>uma vez</b> pra busc\u00e1-la; depois disso ele n\u00e3o \u00e9 mais rebuscado. Basta puxar o hist\u00f3rico de novo.</li>' +
        '<li><b>\ud83c\udfbd Sua categoria \u00e9 Masculina ou Feminina \u2014 nunca \u201cMista\u201d:</b> \u201cMista\u201d \u00e9 a categoria do torneio, n\u00e3o do atleta. Quem jogou uma mista aparecia com ela como categoria oficial; agora vale a faixa disputada no pr\u00f3prio g\u00eanero, e quando s\u00f3 existe torneio misto o app mostra apenas o n\u00edvel (D, C+\u2026) em vez de afirmar um g\u00eanero que o dado n\u00e3o diz.</li>' +
        '<li><b>\ud83d\udd22 Seus pontos em destaque:</b> o n\u00famero que resume seu n\u00edvel saiu da letra mi\u00fada ao lado da forma e ganhou um canto pr\u00f3prio, em corpo grande.</li>' +
        '<li><b>\uD83E\uDDE9 A extens\u00e3o do letzplay est\u00e1 na Chrome Web Store:</b> instalar virou <b>um clique</b> e a atualiza\u00e7\u00e3o passou a ser <b>autom\u00e1tica</b> \u2014 acabou o vaiv\u00e9m de baixar zip e reinstalar na m\u00e3o a cada vers\u00e3o. O zip continua existindo como alternativa enquanto a loja revisa uma vers\u00e3o nova.</li>' +
        '<li><b>\uD83D\uDC65 Conta duplicada: o app pergunta antes:</b> se voc\u00ea j\u00e1 tem outra conta aqui, agora ele <b>reconhece o seu nome escrito de outro jeito</b> \u2014 com ponto, sem acento, com a inicial abreviada ou faltando uma letra \u2014 e <b>pergunta antes</b> de deixar voc\u00ea se inscrever duas vezes no mesmo torneio. Se o <b>celular ou o e-mail j\u00e1 autenticado</b> for o mesmo nos dois lados, a\u00ed ele <b>une na hora</b> \u2014 \u00e9 prova de que a conta \u00e9 sua. Fora isso <b>nada \u00e9 unido sozinho</b>: s\u00f3 depois que voc\u00ea confirmar a posse da outra conta, pelo e-mail ou pelo celular dela. E se voc\u00ea disser que n\u00e3o \u00e9 voc\u00ea, ele <b>n\u00e3o pergunta de novo</b> \u2014 s\u00f3 volta a perguntar se aparecer algo mais forte, como o mesmo celular.</li>' +
        '<li><b>\u23F3 O app s\u00f3 abre quando terminou de carregar:</b> antes a tela era liberada <b>por tempo</b>, mesmo com os dados ainda a caminho \u2014 voc\u00ea entrava, ia direto procurar o torneio e a interface <b>travava por alguns segundos</b>. Agora quem libera \u00e9 o <b>dado</b>: a tela inicial aparece quando a dashboard est\u00e1 realmente pronta, e a navega\u00e7\u00e3o j\u00e1 come\u00e7a fluida.</li>' +
        '<li><b>\uD83C\uDFBE Uma tela de carregando só, com a marca e o %:</b> o app tinha <b>cinco</b> telas de “carregando” diferentes — uma aparecia entre o Entrar e a dashboard sem porcentagem nenhuma, e outra, bem mais antiga, ainda surgia no meio do uso (histórico, troféus, ficha do jogador, ferramentas do organizador, locais) como uma bolinha solta com um texto cinza. Agora é <b>uma só, em todo lugar</b>: logo do scoreplace.app, a bola girando, o que está acontecendo e a barra laranja com a <b>porcentagem</b> — que sempre fecha em 100% antes de a tela sair, em vez de congelar no meio.</li>' +
        '<li><b>\uD83D\uDCD0 O cabeçalho voltou pro lugar, e o “Entrar” avisa que entendeu o toque:</b> no celular o topo do app invadia a área do relógio, do sinal e da bateria — também na tela inicial de quem ainda não entrou. A causa era um detalhe de formatação que derrubava, junto, várias regras de layout do celular. Está corrigido, com uma trava automática pra não acontecer de novo. E o botão <b>Entrar</b> passou a mudar de estado assim que você toca: fica cinza com <b>“Entrando…”</b> até a tela de login aparecer, em vez de parecer que o toque não pegou.</li>' +
        '<li><b>\uD83D\uDD0E Busca da chave que acha quem est\u00e1 fora:</b> procurar um nome agora encontra tamb\u00e9m quem est\u00e1 em <b>Desativados</b>, <b>Lista de espera</b> e <b>W.O.</b>, e esconde as caixas que ficaram sem ningu\u00e9m. O <b>cabe\u00e7alho parou de deslizar</b> ao limpar o campo no \u2715, e os cart\u00f5es da <b>Organiza\u00e7\u00e3o</b> passaram a respeitar o filtro \u2014 quem n\u00e3o bate com a busca some junto.</li>' +
        '<li><b>\uD83D\uDCE8 O convite deixou de nascer escondido:</b> ao abrir <b>Convidar</b> num torneio, a primeira linha do painel ficava <b>atr\u00e1s da barra de busca</b>. Agora ele abre logo abaixo do cabe\u00e7alho, inteiro, e rola dentro de si em telas menores.</li>' +
        '<li><b>\uD83D\uDC64 Quem se inscreveu n\u00e3o some mais:</b> se a internet caísse no meio da inscri\u00e7\u00e3o \u2014 4G ruim na quadra, aba fechada \u2014 a tela dizia <b>inscrito</b> e o servidor nunca recebia. A pessoa ficava num limbo: aparecia no elenco, mas <b>fora de qualquer grupo</b> e invis\u00edvel na rodada. Agora a inscri\u00e7\u00e3o s\u00f3 \u00e9 dada como feita quando o <b>servidor confirma</b>, e o app avisa se n\u00e3o conseguiu. Junto disso, um <b>grupo j\u00e1 formado n\u00e3o pode mais desaparecer</b> por um aparelho que estava com a tela aberta h\u00e1 muito tempo.</li>' +
        '<li><b>\uD83D\uDCCD \u201cPlace\u201d virou \u201cPresen\u00e7a\u201d:</b> o bot\u00e3o mudou de nome pra dizer o que ele faz de verdade \u2014 marcar que voc\u00ea est\u00e1 no local. Mesma tela, mesmo lugar.</li>' +
        '<li><b>\uD83E\uDDF9 Verifica\u00e7\u00e3o do letzplay mais honesta:</b> uma leitura s\u00f3 conta como <b>verificada</b> (nome verde) quando foi feita pela <b>vers\u00e3o atual</b> da extens\u00e3o. Leituras antigas voltam a aparecer como <b>autorizadas mas ainda n\u00e3o conferidas</b> at\u00e9 serem puxadas de novo \u2014 antes elas eram tratadas como conferidas mesmo tendo vindo de um motor que j\u00e1 se sabia defeituoso.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.08);">' +
      '<div style="font-weight:800; color:var(--sp-c-67e8f9,#67e8f9); font-size:1rem; margin-bottom:8px;">🛡️ v1.7 — Sorteio que não se apaga, contato direto com quem joga com você, e placar validado no servidor <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(Agosto, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🛟 Nada do que já aconteceu se perde:</b> quando duas pessoas mexem no mesmo torneio ao mesmo tempo, o aparelho que estava com a tela aberta há mais tempo podia gravar por cima e <b>apagar o que aconteceu no meio tempo</b>. Agora não apaga mais: <b>inscrição</b>, <b>placar já lançado</b>, <b>rodada recém-sorteada</b>, <b>jogo de quem entrou depois</b>, <b>link do grupo de WhatsApp</b>, <b>horário combinado</b>, <b>substituição por W.O.</b> e <b>aceite de co-organização</b> ficam de pé. O que você quis mudar continua sendo salvo normalmente — só o que ficou para trás é que volta.</li>' +
        '<li><b>🔒 Sorteio realizado não se apaga:</b> depois de sorteado, o chaveamento <b>não é mais destruído</b> para fazer outro — nem por engano, nem com resultados já lançados. Na fase eliminatória a chave é uma árvore fechada e o app recusa; em fase de rodadas, o que existe é <b>gerar uma rodada extra</b>, que acrescenta sem apagar nada do que já foi jogado.</li>' +
        '<li><b>💬 Falar com quem joga com você:</b> na classificação, um botão verde ao lado do nome abre o <b>WhatsApp direto</b> com a pessoa — ou o e-mail, quando ela não tem telefone cadastrado. Todo mundo do seu grupo pode falar com o grupo; o organizador fala com qualquer inscrito, em qualquer classificação.</li>' +
        '<li><b>👤 Ficha do jogador na classificação:</b> tocar no nome na tabela abre a <b>ficha completa</b> — foto, histórico e troféus —, a mesma da Análise de Inscritos. Nos cards da chave o nome deixou de abrir ficha: na quadra, o card é área de toque para lançar placar.</li>' +
        '<li><b>🛡️ Placar validado no servidor:</b> quem pode lançar o resultado de cada jogo passou a ser decidido <b>no servidor</b>, e não só no aparelho — quem está naquele jogo, o que a fase permite, e em que ponto está a negociação entre os times. Na prática você não vê diferença; o que muda é que a regra passa a valer igual para todo mundo.</li>' +
        '<li><b>🚫 W.O. agora é sempre a mesma coisa:</b> quem leva W.O. fica com <b>0 pontos na rodada</b> e vai para os <b>Desativados</b> — não vai mais para a lista de espera. A fila passou a depender de um ato da própria pessoa: quando ela liga o botão <b>Ativado</b> no torneio, entra no <b>fim da lista de espera</b> e volta a jogar quando chegar a vez. O organizador não escolhe mais o destino, e o primeiro da fila continua assumindo a vaga até o fim do torneio.</li>' +
        '<li><b>🔁 O botão “Ativado” não volta mais sozinho:</b> quem estava desativado e ligava o botão via ele <b>voltar para “Desativado”</b> segundos depois, por mais que tentasse. A ativação chegava a ser gravada, mas uma proteção do app — a que impede alguém de sumir do torneio por engano — entendia a ida para a <b>lista de espera</b> como se a pessoa tivesse sido apagada, e desfazia tudo. Agora ir para a fila é reconhecido como o que é: uma <b>mudança de lugar</b>, não um sumiço. E o botão passou a mostrar o seu estado de verdade: estando na fila e disponível, ele fica <b>Ativado</b> — antes dizia “Desativado” mesmo depois de você ligar. Junto disso, <b>reativar tira você da folga</b>: quem estava desativado e voltou passa a aparecer na <b>lista de espera</b>, e não mais entre os <b>Desativados</b> da rodada — inclusive quem já tinha reativado antes desta correção.</li>' +
        '<li><b>⏳ Quem se inscreveu depois do sorteio aparece:</b> a Análise de Inscritos agora mostra também a <b>lista de espera</b>, marcada como tal, para o organizador atribuir gênero e categoria antes de a pessoa entrar. E atribuir gênero <b>fixa de primeira</b> — antes era preciso repetir o processo.</li>' +
        '<li><b>⚖️ Proporção de homens e mulheres no sorteio:</b> em torneios <b>sem categoria por gênero</b> (todo mundo misturado), o organizador escolhe a proporção de cada 4 pessoas sorteadas — <b>50/50</b>, <b>25/75</b> ou <b>75/25</b> — na tela do sorteio equilibrado e também no criar/editar, dentro da fase. Com <b>Travar proporção</b> ligado, um grupo só se forma se a proporção for atendida <b>exatamente</b>, e quem não couber espera; desligado, o sorteio persegue a proporção e, quando não houver mais como mantê-la, <b>flexibiliza para incluir o máximo de gente</b>. Quem está sem gênero declarado <b>nunca é presumido</b> homem ou mulher — e o próprio sorteio deixa você preencher isso ali na hora. Com categorias separadas (Fem, Masc ou Misto) nada disso aparece: ali o sorteio já roda por categoria, e o Misto já é 50/50 por ser sorteio de duplas.</li>' +
        '<li><b>🛡️ Grupo fora da regra não nasce:</b> a composição de cada grupo passou a ser <b>conferida antes de o grupo existir</b>, e não depois. Um grupo que não atenda à proporção travada é recusado na porta em vez de aparecer montado para alguém perceber o erro depois.</li>' +
        '<li><b>🪪 Duas contas da mesma pessoa: o app pergunta antes de virar problema:</b> quando alguém se inscreve com uma conta nova e os sinais indicam que já está naquele torneio por outra (<b>mesmo celular</b> ou <b>mesmo nome</b>), o app avisa que <b>parece</b> ser a mesma pessoa e mostra <b>com qual conta</b> — com e-mail e telefone mascarados —, oferecendo unir as duas ali mesmo. Se não for você, basta dizer: o app <b>não volta a perguntar</b>. Organizador inscrevendo terceiro nunca passa por essa porta.</li>' +
        '<li><b>🔗 Unir contas não perde nada:</b> ao juntar duas contas suas, viajam junto <b>torneios, jogos, presenças, avisos, a leitura do letzplay e os dados do perfil</b> — e os dois logins continuam entrando. Vence a conta <b>mais ativa</b>, que absorve o que só existia na outra.</li>' +
        '<li><b>🏷️ Trocou o nome? Aparece igual em todo lugar:</b> classificação, cards da chave e a <b>busca</b> passaram a mostrar o nome do <b>perfil de agora</b>, e não o que ficou gravado no dia do sorteio. Antes a mesma pessoa podia aparecer com dois nomes em telas diferentes, e procurar pelo nome novo não achava os jogos dela.</li>' +
        '<li><b>🎯 Análise de Inscritos: a mudança vai para a pessoa certa:</b> mexer na categoria ou no gênero de <b>várias pessoas de uma vez</b> agora salva todas — e nunca mais grava no inscrito errado da lista. E ao salvar, os <b>dois botões</b> mostram “Salvando…” até terminar, para você não sair achando que já gravou.</li>' +
        '<li><b>🎾 Placar ao vivo redesenhado:</b> cada dupla virou uma <b>caixa colorida</b> com os nomes, o games/sets e o ponto dentro, e <b>quem saca fica em cima</b> (à esquerda, no celular deitado). Os números cresceram para ocupar a placa inteira, o <b>Desfazer atravessa a base</b> e nada mais encosta nas bordas — feito para ler de longe, com o celular apoiado na quadra.</li>' +
        '<li><b>📐 A tela inteira passou a ser usada:</b> no celular havia uma <b>faixa morta</b> no topo do placar e a placa do ponto <b>cobria o Desfazer</b> — dependendo do aparelho, o botão ficava debaixo do número. Os dois sumiram, no iPhone e no Android.</li>' +
        '<li><b>🏐 “Quem saca primeiro?” cabe numa tela só:</b> os quatro jogadores agora aparecem em <b>duas colunas</b> (seu time à esquerda, o adversário à direita), sem rolar para achar o quarto. O título e o Iniciar foram para o cabeçalho, e o botão Fechar repetido saiu.</li>' +
        '<li><b>⚡ Partida casual: menos rolagem para começar:</b> a modalidade ficou em <b>uma linha só</b> e os botões <b>Sortear Duplas</b> e <b>Rei/Rainha</b> agora ficam <b>lado a lado</b> — sobra tela para os jogadores e para o QR code de convite.</li>' +
        '<li><b>⌚ Relógio: o sacador é o mesmo dos dois lados:</b> ao escolher quem saca <b>no celular</b>, o relógio acende <b>o mesmo nome</b> na hora — antes cada um mostrava um, e dava para começar a partida com sacadores diferentes. E o <b>Encerrar do relógio agora encerra de verdade</b>: fecha o placar no celular, devolve você à tela de configuração e o relógio volta para a espera, em vez de ficar preso na tela do último resultado.</li>' +
        '<li><b>🎾 letzplay: o amistoso conta como jogo:</b> partidas <b>avulsas</b> (sem competição) passaram a entrar na sua leitura como jogo. Antes elas eram descartadas, e a barra ficava eternamente devendo — dizia “concluí” com a conta aberta, e o seu nome não fechava em verde na Análise.</li>' +
        '<li><b>⚖️ Empate em 5-5: você escolhe:</b> ao empatar o set (5-5, 6-6, 7-7…), o app pergunta em tela cheia se quer <b>prorrogar</b> (jogar até 2 games de vantagem) ou <b>ativar o tie-break</b> — números e botões grandes, pra decidir de longe, na quadra. Em partida casual ele pergunta <b>sempre</b>; em torneio vale a regra do organizador.</li>' +
        '<li><b>🎾 No tie-break o sacador continua do mesmo lado:</b> quem saca fica <b>sempre à esquerda</b> (deitado) ou <b>em cima</b> (em pé). Antes o lado congelava justamente no tie-break, que é onde o saque mais troca. Vale igual no relógio.</li>' +
        '<li><b>⌚ O relógio não trava mais ao encerrar:</b> ao tocar em Encerrar no fim da partida, o relógio ficava preso no placar final sem fazer mais nada. Agora ele volta pra uma tela própria.</li>' +
        '<li><b>🙋 Só o primeiro nome no placar:</b> a tela mostra <b>Rodrigo</b>, não <b>Rodrigo Barth</b> — sobra espaço e a fonte cresce. O sobrenome só aparece quando dois jogadores têm o mesmo primeiro nome, e só o quanto basta pra diferenciar.</li>' +
        '<li><b>📏 Placar maior na mesma tela:</b> havia espaço reservado e não usado em volta do <i>Desfazer</i> e do cabeçalho. Com ele devolvido, as <b>placas e os números cresceram</b> sem nada sair da tela.</li>' +
        '<li><b>💡 As dicas saíram de cena por enquanto:</b> elas estavam desatualizadas e apareciam por cima do que você queria ver. Ficam desligadas até serem reescritas direito — nada foi perdido.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:1px solid var(--border-color);border-radius:12px;padding:14px 16px;">' +
      '<div style="font-weight:800; color:var(--sp-c-67e8f9,#67e8f9); font-size:1rem; margin-bottom:8px;">🌳 v1.6 — Chave enxuta, repescagem justa, histórico grande do letzplay e o treino do relógio contando <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🌳 Chave mínima, sem folga de graça:</b> a chave agora nasce do <b>tamanho real</b> do torneio, em vez de inflar até a próxima potência de 2. Com 12 duplas são 6 jogos, depois 3, 2 e a final — e o <b>último inscrito nunca folga</b>. Da 2ª rodada em diante a chave fecha redonda, sem BYE no meio do caminho.</li>' +
        '<li><b>🎟️ Repescagem justa e transparente:</b> a vaga de repescagem fica <b>vazia até a rodada inteira fechar</b> — nada de nome provisório que troca depois. Quem volta é o <b>melhor derrotado</b> segundo os critérios de desempate <b>do próprio organizador</b>, e a chave se corrige sozinha ao ser aberta.</li>' +
        '<li><b>⏱️ Quem chega depois entra na hora:</b> inscrição tardia (sozinho ou em dupla) vira <b>jogo de verdade</b> na mesma hora, na chave de cima e com o pouso certo na de baixo. Marcar presença depois do sorteio <b>sempre</b> gera o confronto — nunca mais fica ninguém de fora sem aviso.</li>' +
        '<li><b>🤝 Duplas sem mistura:</b> ninguém mais entra em duas duplas ao mesmo tempo. <b>Desfazer dupla</b> voltou a funcionar (antes falhava calado), desinscrever um dos dois <b>mantém o parceiro</b> como individual, e quem entra na chave passa a contar como inscrito de fato.</li>' +
        '<li><b>🧹 Chave mais limpa de ler:</b> BYE não vira mais card — a rodada mostra só confrontos verdadeiros, e o nome da rodada conta só os <b>jogos reais</b>. O avanço de fase parou de perguntar "Ajuste de Chaveamento" quando não há o que ajustar.</li>' +
        '<li><b>⌚ O treino do relógio agora CONTA:</b> a partida vira <b>exercício registrado</b> — no iPhone vai pro app Saúde (conta nos anéis de atividade) e no Android é gravado no <b>Health Connect</b>, entrando nos seus exercícios e na atividade diária. O relógio mostra os <b>batimentos ao vivo</b> durante o jogo e o esforço não é mais descartado no fim da partida. Os batimentos ficam no <b>alto do mostrador</b>, dentro de uma marca colorida pela <b>faixa de queima</b> (5 faixas, do azul ao vermelho) — dá pra ver o esforço de relance, sem tirar os olhos do placar.</li>' +
        '<li><b>⌚ Escolher quem saca, no pulso:</b> na tela de início, tocar num nome já <b>acende a escolha</b> (moldura na cor do time e a bolinha da modalidade ao lado) e tocar em outro troca — a confirmação sai no <b>Iniciar</b>. O mesmo vale na pergunta do <b>2º sacador</b>, entre o primeiro e o segundo game. Antes o toque não dava sinal nenhum de que tinha sido registrado.</li>' +
        '<li><b>📚 Histórico grande do letzplay agora vem inteiro:</b> trazer um histórico com centenas de jogos parava no meio e não gravava nada — funcionava só com perfis pequenos. Agora a leitura <b>não tem prazo</b>: ela vai até o fim, grava o que já leu a cada torneio e a cada punhado de páginas, e se o letzplay pedir uma pausa ela <b>continua sozinha de onde parou</b>, sem você clicar de novo. Testado com 472 e com 2.000 jogos. O botão virou <b>Suspender</b>: o que veio fica guardado e a próxima leitura retoma do ponto exato.</li>' +
        '<li><b>👑 Aceitar co-organização funciona (e dá pra tentar de novo):</b> o convite de co-organização estava sendo <b>recusado pelo servidor</b> pra todo convidado com conta — o organizador recebia "aceitou" e o card continuava em "Pendente de aceite". Agora o aceite passa pelo servidor de verdade, e os botões <b>Aceitar / Recusar</b> ficam na notificação <b>enquanto o convite estiver pendente</b>: se algo falhar, você responde de novo em vez de perder o convite.</li>' +
        '<li><b>🎾 Só conta como jogo o que foi jogado:</b> no histórico e na ficha do atleta, agora só aparece partida <b>com placar</b> — jogo apenas sorteado deixou de contar. Cada card mostra <b>parceiro e adversário</b> (antes aparecia "—", e às vezes a própria pessoa do outro lado), o placar sai do lado certo e vitória não é mais confundida com derrota. Torneios de teste do desenvolvedor não entram em estatística de ninguém.</li>' +
        '<li><b>⏸️ Torneio abandonado para de ocupar a tela:</b> torneio que ficou sem placar novo é <b>encerrado automaticamente</b> — e o organizador é avisado <b>48h antes</b>, com o que resolve: preencher as datas de início e término mantém o torneio ativo. Encerrar assim <b>não fecha a classificação</b> (sem pódio, sem título, sem troféu) e o organizador pode <b>reabrir</b> a qualquer momento informando as datas, pra concluir normalmente. Pontos Corridos nunca é encerrado por isso — é temporada contínua. Torneio que nunca teve nenhum jogo simplesmente sai da vitrine, sem ser encerrado.</li>' +
        '<li><b>🗑️ Apagar um torneio apaga tudo dele:</b> os placares de um torneio apagado continuavam guardados e voltavam a aparecer no histórico das pessoas, como se o torneio ainda existisse. Agora somem junto.</li>' +
        '<li><b>🧽 Apagar informação do perfil agora vale:</b> esvaziar um campo do perfil (data de nascimento, cidade, gênero, modalidades, locais, CEPs) e salvar <b>apaga de verdade</b> — antes a informação voltava na próxima vez que você abria o perfil. A proteção que impede o perfil de sumir sozinho continua de pé: só apaga o que <b>você</b> apagou na tela.</li>' +
        '<li><b>📅 O convite mostra até quando o torneio vai:</b> em torneio com <b>duas fases</b>, o convite compartilhado (WhatsApp, e-mail, folheto) mostrava só as datas da <b>fase classificatória</b> — parecia que o torneio acabava antes da eliminatória começar. Agora a fase eliminatória tem o seu próprio <b>Término da fase</b> no criador de torneios, e o convite passa a mostrar a janela inteira: do início da classificatória ao fim da eliminatória. Em branco, nada muda — o torneio termina junto com a classificatória, como antes. O término pode ser ajustado <b>com a eliminatória já rolando</b>, pra estender ou antecipar o fim.</li>' +
        '<li><b>⚥ A etiqueta "Misto" só aparece quando é verdade:</b> o card do torneio marcava <b>Misto</b> mesmo quando todos os inscritos eram do mesmo gênero. Agora, em <b>misto obrigatório</b> (times 50/50) a etiqueta continua sempre — é a regra do torneio. Fora isso, ela só aparece quando os inscritos estão em <b>proporção exata de 1 para 1</b>; sem isso, nenhuma etiqueta de misto no card.</li>' +
        '<li><b>📅 A janela do torneio é sempre do primeiro dia ao último:</b> não importa quantas fases o torneio tenha — a data mostrada vai do <b>começo mais cedo</b> ao <b>término mais tarde</b> entre todas elas. Antes, duas telas do app podiam discordar sobre quando o torneio acaba: quando o organizador informava só o <b>dia</b> do término (sem hora), um lugar entendia meio-dia e outro entendia o fim do dia — 12 horas de diferença. Agora vale sempre o <b>fim do dia</b>, e existe uma única regra por trás de todas as telas.</li>' +
        '<li><b>📅 O torneio termina quando a ELIMINATÓRIA termina:</b> em torneio com duas fases, tudo que anuncia o encerramento mostrava a data da <b>fase classificatória</b> — o card do torneio, o convite compartilhado, a ficha de regras, o folheto impresso, a planilha exportada, o evento que você adiciona na agenda e a contagem "🏆 Fim do torneio". Agora todos mostram até quando vai a <b>última fase</b>. A fase eliminatória ganhou o seu próprio <b>Término da fase</b> no criador de torneios (ajustável mesmo com ela já rolando, pra estender ou antecipar); em branco, nada muda — o torneio termina junto com a classificatória, como antes. O encerramento automático por inatividade também passou a respeitar esse prazo: torneio com eliminatória marcada pra frente <b>não é mais encerrado</b> enquanto ela não vencer.</li>' +
        '<li><b>💬 Cada grupo tem o SEU grupo de WhatsApp:</b> quem clicava em <b>Abrir grupo</b> no card do seu grupo caía no grupo de WhatsApp de <b>outro grupo</b> do torneio. O link que uma pessoa salvava era espalhado por todos os grupos, porque o app estava reconhecendo os jogadores pelo <b>nome</b> — e o nome não fica guardado no torneio (a identidade é a sua conta). Agora o grupo é identificado pelo <b>grupo em si</b>, e o link de um nunca encosta no outro. De quebra, a enquete de horário do <b>Combinar jogos</b> volta a poder fechar sozinha quando todos concordam, e o aviso do grupo novo chega a quem joga.</li>' +
        '<li><b>📌 Detalhes que incomodavam:</b> o aviso de "faltam N equipes" gruda no topo ao rolar (não some mais), o card não fica preso na tela se você soltar o arraste no meio, e o "meu jogo" rola até a posição certa sem cortar o topo.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.08);">' +
      '<div style="font-weight:800; color:var(--sp-c-fbbf24,#fbbf24); font-size:1rem; margin-bottom:8px;">✨ v1.5 — Entrada tardia madura, busca nas chaves e identidade blindada <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🎾 Entrada tardia sempre entra:</b> na Dupla Eliminatória, quem chega depois do sorteio entra <b>na hora</b> — vira um confronto novo que faz a chave crescer (nunca "passa de BYE" de graça), com repescagem no número ímpar. O painel de chaveamento sumiu pra Eliminatória: potência de 2 é resolvida <b>sozinha</b>; só o resto abre decisão.</li>' +
        '<li><b>🔎 Busca nas chaves e na classificação:</b> nova barra de busca no chaveamento e na tabela — ache seu jogo ou sua posição na hora. E a <b>sua linha aparece em verde</b> (nome e colocação) pra você se achar de relance.</li>' +
        '<li><b>🆔 Identidade pela conta, sem confusão de nomes:</b> excluir inscrito, desfazer dupla e registrar W.O. passam a usar a <b>conta</b> (uid) de cada pessoa — dois homônimos não se misturam, e trocar o nome no perfil não quebra nada. W.O. de time chaveia pelos <b>dois</b> membros.</li>' +
        '<li><b>🏷️ Categorias mais claras:</b> a categoria Misto virou um <b>indicador destacado</b> acima do grid (Fem · Misto · Masc centralizado), em vez de uma coluna solta.</li>' +
        '<li><b>🎯 Tie-break explicado:</b> o resumo do torneio agora diz <b>onde</b> o tie-break entra (5-5 ou 6-6), e o botão do grupo do WhatsApp aparece já no raio padrão.</li>' +
        '<li><b>📱 App iOS reconectado:</b> corrigida a conversa do app iOS com a nuvem (CORS <code>capacitor://</code>) — login e dados voltam a funcionar no aplicativo.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.08);">' +
      '<div style="font-weight:800; color:var(--sp-c-a5b4fc,#a5b4fc); font-size:1rem; margin-bottom:8px;">🏆 v1.4 — Eliminatórias com repescagem redondas, do sorteio ao campeão <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🎾 Repescagem como deve ser:</b> a Dupla Eliminatória usa a <b>árvore mínima</b> (chaves superior e inferior espelhadas, sem BYE artificial) e quem chega atrasado entra <b>na hora</b>: o jogo novo nasce contra o <b>melhor derrotado</b> da 1ª rodada — já definido, sem "a definir" pendurado. Chegou um segundo atrasado antes do jogo acontecer? Os dois se enfrentam e o repescado <b>volta pro jogo original dele</b> na chave inferior.</li>' +
        '<li><b>⚖️ Desempate visível:</b> empate de saldo e pontos entre derrotados resolve pela <b>ordem dos jogos na tela</b> — o critério que o organizador consegue conferir olhando a chave.</li>' +
        '<li><b>🤝 Lista de espera viva:</b> formar dupla na espera coloca o time <b>direto na chave</b>, sem re-sortear e sem mexer em nenhum jogo existente; a chave inferior se reorganiza sozinha e nunca "some". Cada pessoa é reconhecida pela <b>conta</b> (uid) — ninguém entra duas vezes, nem com nome trocado.</li>' +
        '<li><b>📋 Presença de torneio estável:</b> marcações em rajada não se atropelam mais (cada toque grava só o próprio campo), com cores canônicas — <b>verde</b> presente, <b>azul</b> confirmado, âmbar "falta um da dupla".</li>' +
        '<li><b>🖥️ Sorteio 100% no servidor:</b> o sorteio, a formação de duplas e a integração de atrasados rodam na nuvem com tela de processamento — sem depender do celular do organizador, e o Cancelar restaura o elenco exatamente como estava.</li>' +
        '<li><b>🎯 Tie-break configurável</b> por torneio (dispara em 5-5 ou 6-6) valendo no placar ao vivo e no lançamento de resultado.</li>' +
        '<li><b>⏱️ Estimativa honesta:</b> a duração prevista do torneio conta <b>equipes efetivas</b> (14 duplas = chave de 14), não pessoas nem inscrições soltas.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #25D366;border-radius:12px;padding:14px 16px;background:rgba(37,211,102,0.08);">' +
      '<div style="font-weight:800; color:var(--sp-c-4ade80,#4ade80); font-size:1rem; margin-bottom:8px;">🎾 v1.3 — Torneio ao vivo, grupo do WhatsApp e presença <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>💬 Grupo do WhatsApp completo:</b> o organizador cria o grupo oficial e <b>notifica todos os inscritos</b> — no app, por e-mail (com o botão <b>"Entrar no grupo"</b>) e no celular; o e-mail chega em <b>todos</b> os seus e-mails vinculados. O botão de entrar fica na cara, ao lado do "Desinscrever-se", e o card mostra <b>quando</b> foi a última notificação.</li>' +
        '<li><b>📋 Chamada direto na tela do torneio:</b> marcar Presente/Ausente e W.O. no próprio card do inscrito, com a contagem presa no topo. E <b>você mesmo marca sua presença</b>: fica <b>verde (presente)</b> se o GPS confirmar que está no local, <b>azul (confirmado)</b> se for um "eu venho" — e o check-in no local vira presente sozinho.</li>' +
        '<li><b>🆔 Cada pessoa reconhecida pela conta, não pelo nome:</b> presença, aprovação de placar em duplas e os jogos do sorteio passam a usar a <b>identidade</b> de cada um — dois homônimos não se confundem mais, e trocar o nome no perfil não quebra os jogos.</li>' +
        '<li><b>🚫 Faltou alguém da dupla?</b> O desfecho do W.O. é <b>combinado entre os times</b> — puxar suplente, seguir com "Jogador X" ou desclassificar; o adversário aceita ou rejeita, e o organizador decide se não houver acordo.</li>' +
        '<li><b>📡 Placar ao vivo melhor:</b> escolha o 1º sacador com um toque (e o 2º entre os games), tudo cabendo na tela; o tie-break dispara no game certo conforme a pontuação do torneio.</li>' +
        '<li><b>📝 Controle da fase ao vivo:</b> a eliminatória herda a inscrição que você abriu na fase inicial, e dá pra abrir/fechar suplentes e novos confrontos a qualquer momento; a 1ª rodada é sempre R1.</li>' +
        '<li><b>⏱️ Estimativa de duração</b> abaixo da regressiva, detalhe do torneio mais limpo e <b>lembrete confiável</b> (1 semana, 2 dias e no dia, enviado pelo servidor).</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #8b5cf6;border-radius:12px;padding:14px 16px;background:rgba(139,92,246,0.08);">' +
      '<div style="font-weight:800; color:var(--sp-c-a78bfa,#a78bfa); font-size:1rem; margin-bottom:8px;">💬 v1.2 — WhatsApp no app e recuperação de conta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>💬 Grupo do WhatsApp entra no app:</b> grupo do jogo (os jogadores do confronto) e grupo oficial do torneio, sem expor o telefone de ninguém — você cria o grupo, cola o link e todo mundo entra num toque. Favoritos e torneios ocultados passam a seguir a sua conta em qualquer aparelho.</li>' +
        '<li><b>📵 O app parou de mandar mensagem por WhatsApp</b> (o número foi bloqueado): seus avisos vão por notificação no app e e-mail. O toggle "WhatsApp" do perfil virou "<b>aceito ser chamado no WhatsApp</b>", e o login por celular passou a ser só por SMS.</li>' +
        '<li><b>🔑 Esqueceu a senha e o e-mail não chega?</b> Voltou o "<b>Redefinir por celular</b>" (código por SMS), e o app avisa quando o provedor costuma segurar o e-mail (Hotmail, Outlook, UOL…).</li>' +
        '<li><b>👥 A lista de inscritos mostra todo mundo</b> — organizador inscrito inclusive — com cada pessoa identificada pela conta, não por e-mail ou nome.</li>' +
        '<li><b>⏱️ Relógio e número do jogo corretos:</b> regressiva pro sorteio na Liga/Pontos Corridos, e o "Jogo N" bate com o do chaveamento.</li>' +
        '<li><b>↺ Restaurar o padrão sugerido</b> (pontuação e critérios de desempate) com um clique, e novo <b>WhatsApp do desenvolvedor</b>.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.08);">' +
      '<div style="font-weight:800; color:var(--sp-c-fbbf24,#fbbf24); font-size:1rem; margin-bottom:8px;">⌚ v1.1 — Placar no relógio e letzplay <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>⌚ Placar no relógio (Apple Watch e Wear OS):</b> controle o placar ao vivo do pulso — ponto de cada time, desfazer, resolver empates e jogar de novo no casual; o relógio espelha o celular em tempo real e instala junto com o app do telefone.</li>' +
        '<li><b>🎾 letzplay mais fiel:</b> os jogos importados mostram o <b>nome real do torneio</b>, quem foi verificado aparece <b>verde na hora</b>, a busca preenche o perfil do inscrito e respeita o ritmo do letzplay (não trava nem "conclui" sem trazer nada), com <b>cronômetro na tela</b> e busca completa de todos os inscritos num job só.</li>' +
        '<li><b>📊 Histórico mais interessante:</b> veja <b>com quem</b> e <b>contra quem</b> você mais joga, com seu aproveitamento ao lado — e data certa em qualquer fuso.</li>' +
        '<li><b>📱 Verificar celular por SMS</b> voltou a funcionar, e ao reinstalar o app dá pra <b>unir contas</b> em vez de bloquear por nome repetido.</li>' +
        '<li><b>⚡ Espertezas do dia a dia:</b> a partida casual lembra sua última configuração, o check-in sugere a última modalidade, quem "autorizou" o letzplay aparece em violeta na análise, e um W.O. contestado avisa a organização inteira.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #38bdf8;border-radius:12px;padding:14px 16px;background:rgba(56,189,248,0.08);">' +
      '<div style="font-weight:800; color:var(--sp-c-7dd3fc,#7dd3fc); font-size:1rem; margin-bottom:8px;">🏷️ v1.0 — Importe o letzplay, estatísticas e feedback <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🎾 Traga seu histórico do letzplay:</b> uma extensão do Chrome importa seus jogos pro scoreplace, unificados no seu Histórico com os nomes reais de parceiros e adversários.</li>' +
        '<li><b>📊 Estatísticas repaginadas:</b> gráfico de <b>Forma</b> com janela temporal e filtros, e Top parceiros/adversários somando letzplay + scoreplace lado a lado.</li>' +
        '<li><b>🗂️ Análise de Inscritos anti-gato:</b> matriz Gênero × Categoria com cada nome pintado pela verificação do letzplay, criação de categorias direto da matriz, e o <b>rigor da inscrição</b> (de Casual a Oficial) — sinalizando pra subir só quem realmente domina uma categoria mais fácil.</li>' +
        '<li><b>📳 Vibração no toque</b> e <b>🔊 sons nos momentos-chave</b> (sortear, iniciar a partida, fechar game/set, vencer), com liga/desliga no perfil.</li>' +
      '</ul>' +
    '</div>';
  return html;
})();
