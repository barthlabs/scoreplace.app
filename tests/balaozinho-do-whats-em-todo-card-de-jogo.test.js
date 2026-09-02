/* O 💬 DE CADA PESSOA, EM TODO CARD DE JOGO (leva 2.1.99)
 *
 * Ordem do dono (02/set/2026), em duas mensagens:
 *   1. _"precisa me devolver os balõezinhos em todos os jogos para que as pessoas se
 *      encontrem pelo whats"_;
 *   2. _"balõezinhos aqui em cada novo. para os participantes do grupo (e para
 *      organizadores de todos)"_.
 *
 * O 💬 já existia na classificação, nos chips de desativados/W.O. e na lista de espera —
 * e NÃO no card da chave, que é justamente onde a pessoa está olhando quando precisa
 * combinar o jogo.
 *
 * ⛔ O QUE ESTE TESTE PROTEGE, e por que ele não é sobre o desenho:
 *
 *  · A REGRA É DE UMA PORTA SÓ. Quem decide quem vê o 💬 é `_contactPersonIconHtml`
 *    (tournaments-organizer.js): organizador vê todos, participante só onde joga, e
 *    ninguém vê o próprio. Se alguém reimplementar essa decisão no card, a chave e a
 *    classificação voltam a divergir — foi exatamente assim que o botão do WhatsApp e o
 *    de agenda divergiram em silêncio antes.
 *
 *  · O 💬 FICA DENTRO DA CAIXA, LOGO APÓS O NOME.
 *    ⚠️ ASSERÇÃO INVERTIDA DE PROPÓSITO. Ela nasceu dizendo o contrário ("irmão da caixa,
 *    nunca dentro"), por receio de mexer na geometria que o auto-fit mede. Ficou errado na
 *    tela: a caixa tem largura FIXA (mesma pra todo mundo, que é o cânone), então num nome
 *    curto o balãozinho ia parar a 231px do nome — colado no placar. Ordem do dono
 *    (02/set/2026): _"os balõezinhos devem ficar junto do nome de cada atleta e não colado
 *    no placar"_.
 *    O receio foi MEDIDO no DOM real antes de inverter: movido pra dentro, a distância vira
 *    4px tanto em "Val" quanto em "Maria Betânia Roberto Faria", o balão segue visível nos
 *    dois e NENHUM nome passa a ser cortado. A caixa já é `display:flex` e já previa ícone
 *    dentro (`.sp-mc-box svg{flex-shrink:0}`).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── 💬 em todo card de jogo ────');

const ROOT = path.join(__dirname, '..');
const bracket = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');

// ── ① a fiação no card: chama a porta única, e do lado de fora da caixa ──────
const ini = bracket.indexOf('function _teamAvatarHtml');
const fim = bracket.indexOf('\n  });', bracket.indexOf('sp-mc-side', ini));
const corpo = bracket.slice(ini, fim);

ok(/_contactPersonIconHtml\(t, _slotUid, name, \{ sameGroup: _souDoJogo, dentroDaCaixa: true \}\)/.test(corpo),
   '① ⭐ o card chama a PORTA ÚNICA com o uid do slot e "é o meu jogo?"');
ok(!/wa\.me|data-contact-uid|_contactPersonByUid/.test(corpo),
   '① ⛔ e NÃO reimplementa o balãozinho aqui — uma régua só para chave e classificação');

/* ⚠️ SEM COMENTÁRIO. Esta asserção já falhou uma vez porque o comentário que explica a
 * regra cita `.sp-mc-box`, e a busca achou o TEXTO em vez do código. É a terceira vez
 * nesta leva que uma varredura mede a prosa; por isso agora se tira o comentário antes. */
const corpoLimpo = corpo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const iBox = corpoLimpo.lastIndexOf('sp-mc-box');
const iChip = corpoLimpo.indexOf('_contactPersonIconHtml');
const entre = corpoLimpo.slice(iBox, iChip);
ok(iBox !== -1 && iChip > iBox && /<\/span>`\s*\+/.test(entre) && entre.indexOf('</div>') === -1,
   '① ⭐ o 💬 vem depois do NOME e ANTES de a caixa fechar — dentro dela, colado no nome');
ok(/dentroDaCaixa: true/.test(corpoLimpo),
   '① e avisa a porta única que está dentro da caixa (flex-shrink, pra não ser espremido)');

// ── ② os dois lados do card passam o jogo ────────────────────────────────────
const chamadas = bracket.match(/_teamAvatarHtml\([^;]*?\)\)?, m\)/g) || [];
ok(chamadas.length === 2, '② os dois lados (p1 e p2) passam o jogo — achei ' + chamadas.length);

// ── ③ a REGRA, exercitada na porta única de verdade ─────────────────────────
const org = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-organizer.js'), 'utf8');
const iFn = org.indexOf('window._contactPersonIconHtml = function');
const bloco = org.slice(iFn, org.indexOf('\n};', iFn) + 3);
const W = { window: null, _safeHtml: (x) => String(x == null ? '' : x), AppStore: {} };
W.window = W;
vm.createContext(W);
vm.runInContext(bloco, W, { filename: 'contact-icon' });

const T = { id: 'T1', creatorUid: 'u-org' };
const EU = { uid: 'u-eu' }, OUTRO = 'u-outro';
W._isUserOrgOrCoHost = (t, cu) => cu && cu.uid === 'u-org';

W.AppStore.currentUser = EU;
ok(W._contactPersonIconHtml(T, OUTRO, 'Fulano', { sameGroup: true }).indexOf('💬') !== -1,
   '③ ⭐ participante VÊ o 💬 de quem joga com ele');
ok(W._contactPersonIconHtml(T, OUTRO, 'Fulano', { sameGroup: false }) === '',
   '③ ⭐ e NÃO vê o de quem joga em outro card');
ok(W._contactPersonIconHtml(T, 'u-eu', 'Eu', { sameGroup: true }) === '',
   '③ ninguém vê o próprio balãozinho');

W.AppStore.currentUser = { uid: 'u-org' };
ok(W._contactPersonIconHtml(T, OUTRO, 'Fulano', { sameGroup: false }).indexOf('💬') !== -1,
   '③ ⭐ organizador vê em TODOS os jogos, mesmo sem jogar neles');

W.AppStore.currentUser = null;
ok(W._contactPersonIconHtml(T, OUTRO, 'Fulano', { sameGroup: true }) === '',
   '③ visitante deslogado não vê contato de ninguém');
W.AppStore.currentUser = EU;
ok(W._contactPersonIconHtml(T, '', 'Fictício', { sameGroup: true }) === '',
   '③ jogador fictício (sem uid) não tem com quem falar');

// ── ④ o 💬 do card é pré-carregado como os outros (senão o 1º toque é bloqueado) ──
ok(/data-contact-uid/.test(bloco),
   '④ o chip declara `data-contact-uid` — é por ele que `_hydrateContactPersonButtons` acha');
ok(/_hydrateContactPersonButtons\(container\)/.test(bracket),
   '④ ⭐ e a chave hidrata o container inteiro: sem perfil em cache, abrir wa.me depois de um await perde o gesto e o iOS bloqueia calado');

// ── ⑤ o clique do 💬 não vira toque no card (que lança placar) ──────────────
ok(/event\.stopPropagation\(\)/.test(bloco),
   '⑤ o 💬 para a propagação — senão tocar nele abriria o placar do jogo');

console.log(fail ? ('  ' + fail + ' FALHA(S), ' + pass + ' ok') : ('  ✓ ' + pass + ' asserções'));
process.exit(fail ? 1 : 0);
