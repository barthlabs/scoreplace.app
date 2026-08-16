/* DUAS REGRAS QUE O DONO CRAVOU EM 16/ago/2026, e as duas são sobre a MESMA armadilha:
 * decidir por TIPO/RÓTULO quando o que importa é o ESTADO.
 *
 * ── A) NOTIFICAÇÃO MARCA COMO LIDA POR PERMANÊNCIA ──────────────────────────────
 * Relato: "as notificacoes nao estao sendo marcadas como lidas depois de 5s de tela
 * porra" — sobre avisos que o próprio card anunciava como "✅ Resultado já confirmado".
 * E a régua dele: "nesses já foi aprovado pelo outro time entao nao tem acao necessaria
 * alguma aqui."
 *
 * A exclusão da v1.8.78 era por TIPO: `match-pending-approval` e os convites nunca
 * marcavam por permanência, porque "quem marca lida é a ação aplicada". Isso vale
 * enquanto a ação EXISTE. Resolvido o placar, não há ação a aplicar — e a notificação
 * ficava não lida PARA SEMPRE, com o sininho nunca zerando. O oposto do que a regra
 * queria proteger.
 *
 * INVARIANTE: um aviso marca sozinho quando NÃO HÁ MAIS NADA A DECIDIR nele; um aviso
 * que ainda mostra botão de decisão NUNCA marca sozinho. Os dois lados saem do MESMO
 * cálculo que decide os botões — se divergissem, existiria card oferecendo "Confirmar"
 * e sumindo dos não lidos sozinho.
 *
 * ── B) O BOTÃO DE BAIXAR SÓ EXISTE QUANDO LEVA A ALGUM LUGAR ────────────────────
 * Ordem, em três mensagens: "vamos tirar esse instalar app" → "a menos que ele possa
 * apontar e ir direto para a loja com o scoreplace.app na tela da loja" → "e ele só deve
 * aparecer entao na versao web" → "nas versoes nativas o botao nao deve sequer aparecer".
 *
 * INVARIANTE: nativo nunca mostra; e só aparece quando existe ficha PUBLICADA pro
 * aparelho. `on` é MEDIÇÃO (Apple 200, Play 404 em 16/ago) — mandar pra 404 é pior que
 * não oferecer nada, e no convite IMPRESSO não há correção depois.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const notif = fs.readFileSync(path.join(ROOT, 'js', 'views', 'notifications-view.js'), 'utf8');
const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const sharing = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-sharing.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

console.log('\n== Notificação lida por permanência + botão da loja ==');

// ═══ A) a decisão real de auto-leitura, extraída do arquivo ═══════════════════
(function () {
  const ini = notif.indexOf('      var _pedeDecisao;');
  const fim = notif.indexOf('\n', notif.indexOf('var _autoRead = isUnread && !_pedeDecisao;'));
  ok(ini > 0 && fim > ini, 'o bloco que decide a leitura automática existe no arquivo');
  if (ini < 0 || fim < ini) return;
  const cod = notif.slice(ini, fim);

  const mLista = notif.match(/window\._NOTIF_ACTION_TYPES\s*=\s*\[[\s\S]*?\];/);
  ok(!!mLista, 'a lista _NOTIF_ACTION_TYPES existe');
  if (!mLista) return;
  const win = {};
  eval(mLista[0].replace('window.', 'win.'));
  const _AUTOREAD_TYPES_OK = t => win._NOTIF_ACTION_TYPES.indexOf(t) === -1;

  function decide(o) {
    const n = { type: o.type };
    const isUnread = o.isUnread !== false;
    const _pendRes = o._pendRes, _pend = o._pend, _sentPend = o._sentPend;
    const _isInvite = (n.type === 'host_transfer_invite' || n.type === 'cohost_invite');
    const _isSent = (n.type === 'host_transfer_sent' || n.type === 'cohost_invite_sent');
    return eval('(function(){' + cod + '\nreturn _autoRead;})()');
  }

  // o caso do relato
  ok(decide({ type: 'match-pending-approval', _pendRes: false }) === true,
    'placar JÁ RESOLVIDO marca sozinho (o card diz "Resultado já confirmado")');
  // e o que a regra existia pra proteger segue protegido
  ok(decide({ type: 'match-pending-approval', _pendRes: true }) === false,
    'placar AINDA PENDENTE nunca marca sozinho (o card ainda oferece Confirmar/Contestar)');
  ok(decide({ type: 'match-pending-approval', _pendRes: null }) === false,
    'estado DESCONHECIDO (torneio não carregado) não marca — mesmo default conservador dos botões');
  ok(decide({ type: 'match-pending-approval', _pendRes: undefined }) === false,
    'sem cálculo nenhum (o ramo do card nem rodou) também não marca');

  ok(decide({ type: 'cohost_invite', _pend: true }) === false, 'convite de co-organização PENDENTE não marca');
  ok(decide({ type: 'cohost_invite', _pend: false }) === true, 'convite JÁ RESPONDIDO marca (não há o que aceitar)');
  ok(decide({ type: 'cohost_invite', _pend: null }) === false, 'convite de estado desconhecido não marca');
  ok(decide({ type: 'host_transfer_invite', _pend: true }) === false, 'transferência pendente não marca');
  ok(decide({ type: 'cohost_invite_sent', _sentPend: true }) === false, 'convite que EU enviei e segue pendente não marca (o Cancelar ainda vale)');
  ok(decide({ type: 'cohost_invite_sent', _sentPend: false }) === true, 'convite que eu enviei e já foi respondido marca');

  // sem cálculo de "já resolvido" → seguem de fora, de propósito
  ok(decide({ type: 'friend_request' }) === false, 'pedido de amizade nunca marca sozinho');
  ok(decide({ type: 'casual_link_request' }) === false, 'pedido de vínculo em casual nunca marca sozinho');

  // avisos comuns seguem marcando
  ok(decide({ type: 'draw' }) === true, 'aviso de sorteio marca por permanência');
  ok(decide({ type: 'result' }) === true, 'aviso de resultado marca por permanência');
  ok(decide({ type: 'tournament_reminder' }) === true, 'lembrete de torneio marca por permanência');
  ok(decide({ type: 'draw', isUnread: false }) === false, 'notificação já lida não entra na vigilância');

  // CONTROLE: o conserto NÃO foi tirar o tipo da lista (isso liberaria os pendentes)
  ok(_AUTOREAD_TYPES_OK('match-pending-approval') === false,
    'o tipo do relato SEGUE na lista de ação — quem decide é o estado, não a remoção da lista');

  // fiação do observador
  ok(/window\._NOTIF_DWELL_MS\s*=\s*5000/.test(notif), 'a permanência exigida continua sendo 5s');
  ok(/data-notif-autoread="1"/.test(notif), 'o cartão marcável é etiquetado pro observador');
  ok(/new IntersectionObserver/.test(notif), 'a vigilância é por visibilidade real, não por abrir a tela');
  ok(/_NOTIF_DWELL_RATIO\s*=\s*0\.5/.test(notif),
    'metade do cartão precisa estar à vista (cartão espiando na borda durante a rolagem não conta)');
})();

// ═══ B) o botão da loja ══════════════════════════════════════════════════════
(function () {
  const m = main.match(/window\._storeButtonHtml = function[\s\S]*?\n\};/);
  ok(!!m, '_storeButtonHtml existe (main.js)');
  const mLojas = store.match(/window\.SP_LOJAS\s*=\s*\{[\s\S]*?\n\};/);
  ok(!!mLojas, 'window.SP_LOJAS existe (store.js) — a fonte única das fichas');
  if (!m || !mLojas) return;

  function chama(ambiente, opts) {
    const win = {};
    eval(mLojas[0].replace('window.', 'win.'));
    if (ambiente.lojas) win.SP_LOJAS = ambiente.lojas;
    win.Capacitor = ambiente.nativo ? { isNativePlatform: () => true } : undefined;
    const navigator = { userAgent: ambiente.ua || '', platform: ambiente.platform || '', maxTouchPoints: ambiente.touch || 0 };
    const window_ = win;
    eval(m[0].replace('window._storeButtonHtml', 'win._storeButtonHtml').replace(/\bwindow\./g, 'win.'));
    return win._storeButtonHtml(opts || {});
  }

  const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
  const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';
  const UA_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

  // 1. NATIVO NUNCA MOSTRA — ordem literal: "nas versoes nativas o botao nao deve
  //    sequer aparecer". Testado nos dois sistemas, senão um deles passaria batido.
  ok(chama({ nativo: true, ua: UA_IOS }) === '', 'app NATIVO iOS não mostra o botão');
  ok(chama({ nativo: true, ua: UA_ANDROID }) === '', 'app NATIVO Android não mostra o botão');

  // 2. web no iPhone: a ficha da Apple está publicada → aparece, apontando pra ela
  const iosHtml = chama({ ua: UA_IOS });
  ok(iosHtml.indexOf('apps.apple.com') !== -1, 'web no iPhone aponta pra ficha da App Store');
  ok(/App Store/.test(iosHtml), 'o rótulo nomeia a loja de destino');
  ok(/target="_blank"/.test(iosHtml) && /rel="noopener"/.test(iosHtml),
    'abre em aba nova com rel=noopener (a ficha é outro domínio)');

  // iPad moderno se declara Mac — o toque é o que o denuncia
  ok(chama({ ua: UA_DESKTOP, platform: 'MacIntel', touch: 5 }).indexOf('apps.apple.com') !== -1,
    'iPad (que se declara MacIntel) é reconhecido pelo toque');

  // 3. Android com a Play em 404 NÃO mostra — mandar pra página inexistente é pior
  ok(chama({ ua: UA_ANDROID }) === '', 'web no Android NÃO mostra enquanto a Play estiver desligada (404)');
  // e volta sozinho quando a ficha sair — é a "uma linha"
  const comPlay = chama({
    ua: UA_ANDROID,
    lojas: { apple: { on: true, nome: 'App Store', url: 'https://apps.apple.com/x' },
             play: { on: true, nome: 'Google Play', url: 'https://play.google.com/y' } }
  });
  ok(comPlay.indexOf('play.google.com') !== -1,
    'ligando play.on o Android passa a apontar pra Play — sem tocar em mais nada');

  // 4. desktop fica de fora: não há app de loja pra rodar ali
  ok(chama({ ua: UA_DESKTOP }) === '', 'desktop não mostra (a ficha no navegador do computador não instala nada)');

  // 5. a medição de hoje, travada: Play desligada
  ok(/play:\s*\{\s*on:\s*false/.test(mLojas[0]),
    'a Play está DESLIGADA em SP_LOJAS (medido: 404 em 16/ago). Ligar exige conferir o 200 antes');
  ok(/apple:\s*\{\s*on:\s*true/.test(mLojas[0]), 'a Apple está ligada (medido: 200)');

  // 6. fonte ÚNICA: o convite impresso lê a MESMA lista
  ok(/var _LOJAS = window\.SP_LOJAS \|\|/.test(sharing),
    'o selo do convite IMPRESSO lê window.SP_LOJAS — duas listas divergiriam na primeira mudança');

  // 7. a tela inicial usa o botão da LOJA, não o de atalho PWA
  const dash = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
  ok(/window\._storeButtonHtml\(/.test(dash), 'a tela inicial chama _storeButtonHtml');
  ok(!/_installButtonHtml\([^)]*Instalar app/.test(dash),
    'o botão "📲 Instalar app" (atalho PWA) saiu da tela inicial');
  // mas o atalho PWA continua existindo onde faz sentido (landing/manual)
  ok(/window\._installButtonHtml = function/.test(main),
    '_installButtonHtml continua vivo — a landing e o manual ainda oferecem o atalho');
})();

// ═══ C) NENHUMA NÃO LIDA PODE FICAR INALCANÇÁVEL ═════════════════════════════
// Relato: "nao há nenhuma notificacao nao lida. nao tem que ter o ponto vermelho no
// sino." O sino estava CERTO — medido na conta do dono: 466 notificações, 60 não lidas,
// TODAS de 11–15/jul, enquanto as 50 mais recentes (agosto) estavam todas lidas.
//
// O defeito é a assimetria: a tela pedia as 50 MAIS RECENTES, o sino contava TODAS as
// não lidas. Quando a não lida é mais antiga que a 50ª, o ponto aponta pra algo que a
// tela não mostra — e não existe gesto que resolva. Aumentar o limite não conserta,
// só empurra: o que a tela tem que garantir é o INVARIANTE.
(function () {
  const db = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');

  ok(/async getUnreadNotifications\(uid, limit\)/.test(db),
    'existe uma busca dedicada pelas NÃO LIDAS (independente da posição)');
  const bloco = db.slice(db.indexOf('async getUnreadNotifications'), db.indexOf('async getUnreadNotificationCount'));
  ok(/\.where\('read', '==', false\)/.test(bloco), 'ela filtra por read == false');
  ok(!/orderBy/.test(bloco),
    'ela NÃO usa orderBy — combinar where com orderBy num campo opcional exclui quem não tem o campo (o bug da Liga sumida, v0.16.62)');
  ok(/return \[\];/.test(bloco),
    'falha devolve [] — a tela funde com as recentes, então degrada pro comportamento anterior em vez de quebrar');

  ok(/async markAllNotificationsRead\(uid\)/.test(db), 'existe "marcar todas como lidas"');
  const blocoAll = db.slice(db.indexOf('async markAllNotificationsRead'), db.indexOf('async getUnreadNotificationCount'));
  ok(/i \+= 400/.test(blocoAll), 'marca em lotes de 400 (o teto do batch do Firestore é 500)');

  // a tela funde as duas buscas, sem duplicar
  ok(/Promise\.all\(\[\s*\n\s*window\.FirestoreDB\.getNotifications\(uid, window\._notifLimit\)/.test(notif),
    'a tela pede as recentes E as não lidas juntas');
  ok(/getUnreadNotifications\(uid\)/.test(notif), 'a tela consome a busca das não lidas');
  ok(/vistos\[n\._id\]/.test(notif), 'a fusão deduplica por id — a não lida que já está entre as recentes aparece uma vez só');

  // não lidas no topo (ordem do dono: "as nao lidas devem ficar no topo sempre")
  const iU = notif.indexOf("_t('notif.unread')");
  const iR = notif.indexOf("_t('notif.read')");
  ok(iU > 0 && iR > 0 && iU < iR, 'a seção "Não lidas" é montada ANTES da de "Lidas" — não lida fica no topo');

  // "carregar mais" no fim, e o gate certo
  ok(/window\._notifLoadMore\(\)/.test(notif), 'existe o "Carregar mais" no fim da lista');
  ok(/if \(recentes\.length >= window\._NOTIF_PAGE\)/.test(notif),
    'o botão aparece contando as RECENTES, não a lista fundida — a fusão traz não lidas antigas que inflariam o total');
  ok(/window\._notifKeepLimit/.test(notif),
    'o limite volta ao padrão ao reabrir a tela (só o botão o mantém) — quem rolou muito uma vez não paga em toda visita');
})();


// ═══ D) PARTIDA EM RAJADA NÃO CONTA ══════════════════════════════════════════
// Ordem do dono: "pode descatar todos as partidas casuais em rajada e desconsidere
// estatisticas de qualquer jogo em rajada" · "mesmo as que nao forem minhas" · e o
// motivo, que faz disto REGRA e não faxina: "assim evitamos manipulacoes nos dados".
//
// Um 6-0 em 12 segundos é teste do sistema — ou inflação de aproveitamento. A regra
// mora na LEITURA porque são quatro consumidores do histórico; copiá-la em quatro
// lugares é como o contador do sino e o "encerrado na lista" sobreviveram.
(function () {
  const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
  const db = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');

  const m = store.match(/window\._isPartidaEmRajada = function[\s\S]*?\n\};/);
  ok(!!m, 'o critério canônico _isPartidaEmRajada existe (store.js)');
  ok(/window\.SP_RAJADA_MS = 2 \* 60 \* 1000/.test(store), 'a régua é 2 minutos, como o dono definiu');
  if (m) {
    const win = { SP_RAJADA_MS: 2 * 60 * 1000 };
    eval(m[0].replace('window._isPartidaEmRajada', 'win._isPartidaEmRajada').replace(/window\./g, 'win.'));
    const f = win._isPartidaEmRajada;
    ok(f({ durationMs: 12000, scoreSummary: '6-0' }) === true, '6-0 em 12 segundos é rajada');
    ok(f({ durationMs: 119000 }) === true, '1min59 é rajada');
    ok(f({ durationMs: 120000 }) === false, '2min exatos NÃO é rajada (o corte é abaixo de 2min)');
    ok(f({ durationMs: 1500000, scoreSummary: '6-4' }) === false, 'partida de 25 min conta normalmente');
    ok(f({ scoreSummary: '0-0' }) === true, '0-0 não é jogo realizado — não teve ponto');
    ok(f({ scoreSummary: '0 - 0' }) === true, 'o 0-0 é reconhecido com espaços');
    // ⚠️ o caso que protege histórico verdadeiro: SEM duração não se descarta
    ok(f({ scoreSummary: '6-4' }) === false,
      'registro SEM duração (dado legado) NÃO é descartado — ausência de medida não é prova de rajada');
    ok(f({ durationMs: 0, scoreSummary: '6-3' }) === false, 'duração zero/inválida também não descarta');
    ok(f(null) === false, 'entrada nula não quebra');
  }

  // e a regra é aplicada NA LEITURA, alcançando todos os consumidores
  const bloco = db.slice(db.indexOf('async loadUserMatchHistory'), db.indexOf('async loadUserMatchHistory') + 1800);
  ok(/_rajada\(d\)\) return;/.test(bloco),
    'loadUserMatchHistory descarta as rajadas na origem — os 4 consumidores herdam de graça');
  const dash = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
  ok(/_v2\.filter\(function \(r\) \{ return !window\._isPartidaEmRajada\(r\); \}\)/.test(dash),
    'o cache local também filtra — senão o primeiro desenho da tela mostraria o número contaminado');
})();


// ═══ E) V/D É UMA CONTA SÓ (v1.8.95) ═════════════════════════════════════════
// Relato do dono: "v/d ainda nao bate com o que consta da dashboard".
// MEDIDO na conta dele: o pill somava o histórico INTEIRO (casual 9V/3D + torneio
// 4V/2D = 13V/5D) + letzplay (39V/48D) = 52V/53D em 105 jogos; a ficha do atleta
// somava o letzplay com apenas 1V/2D — o recorte que o cliente por acaso carregou —
// e mostrava 40V/50D em 90 jogos. Duas contas para a mesma pergunta.
(function () {
  const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
  const dash = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
  const ana = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-analytics.js'), 'utf8');

  const m = store.match(/window\._totaisVD = function[\s\S]*?\n\};/);
  ok(!!m, 'a conta canônica window._totaisVD existe (store.js)');
  if (m) {
    const win = {};
    eval(m[0].replace('window._totaisVD', 'win._totaisVD'));
    const f = win._totaisVD;
    const EU = 'U1';
    const rec = (team, venc, uid) => ({ players: [{ uid: uid || EU, team }, { uid: 'X', team: team === 1 ? 2 : 1 }], winnerTeam: venc });

    // os números REAIS do dono, do histórico dele
    const hist = [];
    for (let i = 0; i < 9; i++) hist.push(rec(1, 1));   // 9 vitórias
    for (let i = 0; i < 3; i++) hist.push(rec(1, 2));   // 3 derrotas
    for (let i = 0; i < 4; i++) hist.push(rec(2, 2));   // +4 vitórias (do outro lado)
    for (let i = 0; i < 2; i++) hist.push(rec(2, 1));   // +2 derrotas
    const r = f(hist, EU, 'Rodrigo');
    ok(r.wins === 13 && r.losses === 5,
      'soma casual + torneio do histórico real: 13V/5D — deu ' + r.wins + 'V/' + r.losses + 'D');

    // o lado sai do UID, não da posição
    ok(f([rec(2, 2)], EU).wins === 1, 'quem joga no time 2 e vence conta VITÓRIA (o lado sai do uid)');
    // jogo sem vencedor não conta
    ok(f([rec(1, 0)], EU).wins === 0 && f([rec(1, 0)], EU).losses === 0,
      'jogo sem vencedor não conta pra nenhum lado');
    ok(f([{ players: [{ uid: 'OUTRO', team: 1 }], winnerTeam: 1 }], EU).wins === 0,
      'jogo de terceiro não entra na minha conta');
    // nome como reserva, pra registro sem uid
    ok(f([{ players: [{ name: 'Rodrigo', team: 1 }], winnerTeam: 1 }], EU, 'Rodrigo').wins === 1,
      'sem uid no slot, o nome serve de reserva');
    ok(f(null, EU).wins === 0, 'entrada nula não quebra');
  }

  // os DOIS consumidores usam a mesma conta — é isso que impede a divergência
  ok(/window\._totaisVD\(records, myUid, myDn\)/.test(dash),
    'o pill da tela inicial DELEGA pra conta canônica');
  ok(!/var team = null;[\s\S]{0,400}?r\.winnerTeam === team/.test(dash),
    'o pill não tem mais a própria implementação de V/D');
  ok(/window\._totaisVD\(merged, resolvedUid, playerName\)/.test(ana),
    'a ficha do atleta recalcula com a MESMA conta quando o histórico completo chega');
  ok(/getElementById\('letzplay-card-stats-slot'\)/.test(ana),
    'ela redesenha no slot que EXISTE (o id foi conferido no arquivo, não inventado)');
})();


// ── ...E A MESMA ENTRADA, NÃO SÓ A MESMA CONTA (v1.8.96) ────────────────────
// Relato do dono depois da 1.8.95: "ainda divergente 54/54 contra 52/53".
// Unificar o CÁLCULO não bastou — os dois lados calculavam igual sobre entradas
// DIFERENTES: a ficha funde o cache local de casuais (partida que ainda não subiu
// pro Firestore), o pill usava esse cache só na 1ª pintura e depois o descartava.
// E o cache local NÃO passa por `loadUserMatchHistory`, então escapava do filtro de
// rajada: as partidas de teste apagadas do banco ressuscitavam ali.
(function () {
  const dash = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
  const ana = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-analytics.js'), 'utf8');

  ok(/_loc = JSON\.parse\(localStorage\.getItem\('scoreplace_casual_history_v2'/.test(dash),
    'o pill funde o cache local de casuais — a MESMA entrada da ficha');
  ok(/_vistos\[r\.matchId\]/.test(dash),
    'a fusão do pill deduplica por matchId (o que já está no Firestore não conta duas vezes)');
  // os DOIS pontos onde registro local entra têm que filtrar rajada
  const trechoDash = dash.slice(dash.indexOf('_loc.forEach'), dash.indexOf('_loc.forEach') + 400);
  ok(/_isPartidaEmRajada\(r\)/.test(trechoDash),
    'no pill, o registro local passa pelo filtro de rajada');
  const iMerge = ana.indexOf('function _mergeLocalCasualV2');
  const trechoAna = ana.slice(iMerge, iMerge + 2600);
  ok(/_isPartidaEmRajada\(r\)\) continue;/.test(trechoAna),
    'na ficha, o registro local também passa pelo filtro de rajada (era por onde as apagadas voltavam)');
})();

console.log('\n' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
