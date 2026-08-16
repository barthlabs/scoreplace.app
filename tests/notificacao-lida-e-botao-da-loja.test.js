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

console.log('\n' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
