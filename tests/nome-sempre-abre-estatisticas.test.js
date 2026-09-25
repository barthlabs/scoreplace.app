/* Todo participante identificado por UID abre a própria ficha/estatísticas em qualquer render.
 * O clique é delegado no store para não depender de cada tela lembrar um onclick diferente. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }

console.log('──── nomes sempre abrem estatísticas ────');
const store = read('js/store.js');
const css = read('css/components.css');
const style = read('css/style.css');
const bracket = read('js/views/bracket.js');
const dashboard = read('js/views/dashboard.js');
const participants = read('js/views/participants.js');

ok(/window\._personProfileLinkHtml = function/.test(store), 'há um wrapper canônico de ficha por UID');
ok(/data-player-profile-uid=/.test(store), 'o wrapper carrega a identidade por UID');
ok(/sp-person-name-link[\s\S]{0,120}role="button" tabindex="0"/.test(store),
  'o wrapper já nasce acessível, sem depender da hidratação posterior');
ok(/window\._personNameHtml = function \(uid, name, css, cls, extraAttrs\)/.test(store), 'o helper público preserva sua assinatura');
ok(/window\._personNameHtml[\s\S]{0,900}window\._personProfileLinkHtml/.test(store), 'todo nome emitido pelo helper vira acesso à ficha');
ok(/document\.addEventListener\('click',[\s\S]{0,600}true\)/.test(store), 'o clique é delegado na captura, antes da ação do card');
ok(/document\.addEventListener\('keydown'/.test(store) && /ev\.key !== 'Enter' && ev\.key !== ' '/.test(store), 'Enter e Espaço também abrem a ficha');
ok(/_editParticipantName/.test(store), 'o atalho de edição administrativa continua protegido');
ok(/botão dentro de outro para leitor de tela/.test(store), 'o marcador interno de hidratação não vira um segundo botão');
ok(/\.sp-person-name-link,[\s\S]{0,240}\[data-uid-name\]/.test(css), 'o sublinhado pontilhado vale para helper e renders legados');
ok(/\[data-theme="light"\] \.sp-person-name-link,[\s\S]{0,180}text-decoration-color: var\(--primary-color, #007aff\)/.test(css) && /\[data-theme="light"\][\s\S]{0,1200}--primary-color: #007aff/.test(style),
  'no tema claro o sublinhado usa a tinta primária com contraste');
ok(/window\._personProfileLinkHtml\(s\.uid, s\.name, _txt/.test(bracket), 'a classificação de cada grupo usa o wrapper canônico');
ok(/window\._personNameHtml\(_slotUid, name\)/.test(bracket), 'os nomes dos cards de jogo também usam o helper');
ok(/A faixa interna delimita somente o nome[\s\S]{0,480}sp-person-name-content/.test(bracket), 'o card documenta a faixa do nome separada do balão de contato');
const recentIni = dashboard.indexOf('// ── Últimos resultados confirmados');
const recentFim = dashboard.indexOf('// Agrupa por (grupo + torneio)', recentIni);
const recent = dashboard.slice(recentIni, recentFim);
ok(recent.includes('window.renderMatchCard(m2') && /window\._personNameHtml\(_slotUid, name\)/.test(bracket),
  'Últimos Resultados delega os dois lados ao card canônico, que usa a ficha por UID');
ok((participants.match(/_contactPersonIconHtml\(t,/g) || []).length >= 2, 'cards de inscritos exibem o balão ao lado do nome');
/* ⛔⛔ A ASSERÇÃO ANTERIOR DAVA FALSO VERDE (24/set/2026).
 * Ela dizia cobrir "a lista administrativa" casando um comentário que mora no CARD de
 * inscrito (_inscritoIndividualCard). A lista administrativa é outra função, em
 * renderParticipants, e o defeito estava LÁ: o nome carregava o onclick de editar e a
 * ficha o recusava. O teste ficou verde enquanto o dono via a tela quebrada.
 * ⛔ Regra: olhar o bloco PELO NOME DELE, recortado por casamento de chaves/crases —
 * nunca por um comentário vizinho, nunca por fatia de tamanho fixo.
 * [[feedback_medir_com_dado_real_antes_de_teorizar]] */
function _blocoDaLinha(src, marcador) {
  const i = src.indexOf(marcador);
  if (i === -1) return '';
  let j = src.indexOf('`', i);
  if (j === -1) return '';
  let k = j + 1;
  while (k < src.length) {
    if (src[k] === '\\') { k += 2; continue; }
    if (src[k] === '`') return src.slice(j, k + 1);
    k++;
  }
  return '';
}
const _nameRowAdmin = _blocoDaLinha(participants, 'const _nameRow = ');
ok(_nameRowAdmin.length > 0, 'a linha do nome da lista administrativa foi localizada pelo próprio identificador');
ok(/\$\{_niNomeHtml\}/.test(_nameRowAdmin), 'a lista administrativa emite o nome pelo helper canônico da ficha');
ok(/\$\{_niContato\}/.test(_nameRowAdmin), 'a lista administrativa mostra o balão de contato ao lado do nome');
ok(/\$\{_niEditBtn\}/.test(_nameRowAdmin), 'a edição da lista administrativa é um botão próprio, não o nome');
/* ⛔ E o botão só existe para quem foi digitado À MÃO (25/set/2026). Pergunta do dono: "onde
 * renomeia conta que não no perfil do usuário?" — em lugar nenhum. */
ok(/const _niEditBtn = \(isOrg && !_niUid\)/.test(participants),
  '⛔ o lápis não aparece para quem tem conta — conta se renomeia no perfil dela');
ok(/var _pEditBtn = \(isOrg && !_pUid\)/.test(participants) && /var _mEditBtn = \(isOrg && !_mUid\)/.test(participants),
  'e o mesmo vale no card do inscrito e no membro de dupla — os TRÊS pontos');
ok(/if \(targetUid\) \{[\s\S]{0,260}O nome é da pessoa/.test(participants),
  '⛔ e a própria porta RECUSA conta, como segunda linha — caminho futuro não reabre isso');
ok(!/onclick=/.test(_nameRowAdmin), 'nenhum onclick sobrou dentro da linha do nome');
ok(/_personNameHtml\(_niUid, _niShown/.test(participants), 'o nome entregue ao helper é o vivo e CRU, não o já escapado');
ok(/_editParticipantName\('\$\{tId\}','\$\{safeName\}'/.test(participants),
  'o botão leva o nome GRAVADO como oldName — é por ele que a Function acha a pessoa');

/* ── A VARREDURA: onclick dentro de um span de nome desliga a ficha em silêncio ──
 * Este é o padrão exato que produziu o defeito de 24/set/2026. Sem exceções. */
function _spansDeNome(src) {
  const achados = [];
  let i = 0;
  while (true) {
    const a = src.indexOf('<span', i);
    if (a === -1) break;
    const b = src.indexOf('>', a);
    if (b === -1) break;
    achados.push({ pos: a, txt: src.slice(a, b + 1) });
    i = b + 1;
  }
  return achados.filter(x => /data-uid-name=|data-player-profile-uid=/.test(x.txt));
}
const ARQUIVOS_DE_TELA = ['js/store.js', 'js/views/participants.js', 'js/views/bracket.js',
  'js/views/dashboard.js', 'js/views/tournaments.js', 'js/views/tournaments-organizer.js',
  'js/views/bracket-ui.js', 'js/views/explore.js', 'js/views/match-history.js'];
let comOnclick = [];
ARQUIVOS_DE_TELA.forEach(f => {
  _spansDeNome(read(f)).forEach(x => { if (/onclick=/.test(x.txt)) comOnclick.push(f + ' :: ' + x.txt.slice(0, 90)); });
});
ok(comOnclick.length === 0,
  'nenhum span de nome carrega onclick próprio — o nome é a porta da ficha' +
  (comOnclick.length ? '\n      ' + comOnclick.join('\n      ') : ''));

// Caso de REGRESSÃO nomeado: o HTML que a lista administrativa produzia antes.
const _regressao = `<div><span data-uid-name="u-ana" onclick="window._editParticipantName('t','Ana','u-ana')">Ana</span></div>`;
ok(_spansDeNome(_regressao).filter(x => /onclick=/.test(x.txt)).length === 1,
  'a varredura reprova o HTML exato que causou o defeito relatado');

/* ── O ALVO DA EDIÇÃO É PASSADO, NUNCA ADIVINHADO ──
 * `event.target` fazia o próprio botão ✏️ virar o campo editável e gravava "✏️" como nome
 * da pessoa no elenco e em todos os jogos. */
function _corpoDaFuncao(src, assinatura) {
  const i = src.indexOf(assinatura);
  if (i === -1) return '';
  let k = src.indexOf('{', i), nivel = 0;
  for (let j = k; j < src.length; j++) {
    if (src[j] === '{') nivel++;
    else if (src[j] === '}') { nivel--; if (nivel === 0) return src.slice(k, j + 1); }
  }
  return '';
}
const _corpoEdit = _corpoDaFuncao(participants, 'window._editParticipantName = function');
ok(_corpoEdit.length > 0, 'o corpo da edição de nome foi recortado por casamento de chaves');
ok(!/event\.target/.test(_corpoEdit), 'a edição não adivinha o alvo por event.target');
ok(/_resolveEditNameTarget\(btn/.test(_corpoEdit), 'o alvo vem do botão que foi clicado');
ok(/cancelado/.test(_corpoEdit) && /if \(cancelado\) return;/.test(_corpoEdit),
  'Escape marca cancelamento e o blur seguinte não chama a Cloud Function');
ok(/nomeVivoInicial/.test(_corpoEdit) && !/span\.textContent = oldName/.test(_corpoEdit),
  'o rollback devolve o nome VIVO que estava na tela, não o nome gravado');
ok((_corpoEdit.match(/_cleanup\(/g) || []).length >= 5, 'todas as saídas passam pela limpeza única');
/* ⛔ O AVISO ESPECÍFICO DE CONTA SAIU (25/set/2026), com o próprio caso: a edição de quem tem
 * conta foi eliminada — "onde renomeia conta que não no perfil do usuário?". Aquele aviso
 * existia para explicar por que a tela não mudava depois de renomear; agora isso nem acontece. */
ok(!/Nome atualizado neste torneio/.test(_corpoEdit),
  'o aviso que explicava a renomeação invisível saiu junto com o caso que o exigia');
ok(/O nome é da pessoa/.test(_corpoEdit),
  '⛔ e no lugar há a RECUSA: quem tem conta muda o nome no perfil dela');
/* ⛔ E o organizador tem de CONSEGUIR CONFERIR o que mudou: o rótulo do torneio aparece
 * na linha quando diverge do nome do perfil. Não é troca de precedência — o nome segue
 * sendo o do perfil; isto é informação secundária, e some quando os dois são iguais. */
ok(/_niRotuloTorneio/.test(_nameRowAdmin), 'a linha mostra o rótulo deste torneio quando ele diverge do perfil');
ok(/neste torneio: /.test(participants) && /!== String\(_niShown\)\.trim\(\)/.test(participants),
  'o rótulo só aparece quando diverge do nome vivo, e nunca substitui o nome');
ok(/wrapper\.setAttribute\('data-player-profile-disabled'/.test(_corpoEdit) &&
   /wrapper\.removeAttribute\('data-player-profile-disabled'/.test(_corpoEdit),
  'a trava da ficha entra e sai também no wrapper, não só no marcador interno');
const _chamadasEdit = participants.match(/_editParticipantName\([^)]*\)/g) || [];
const _emHtml = _chamadasEdit.filter(c => /tId|t\.id/.test(c) && !/= function/.test(c));
ok(_emHtml.length >= 3 && _emHtml.every(c => /,\s*this\)$/.test(c)),
  'todo botão de edição passa a si mesmo como alvo (' + _emHtml.length + ' pontos)');
const _resolvedor = _corpoDaFuncao(participants, 'window._resolveEditNameTarget = function');
ok(!/querySelector\('\[data-edit-key="' *\+/.test(_resolvedor) && /getAttribute\('data-edit-key'\) === chave/.test(_resolvedor),
  'a chave do escopo é comparada por igualdade — nome bruto nunca entra num seletor CSS');
ok(/\[data-edit-name-target\]/.test(_resolvedor),
  'convidado sem uid também tem alvo de edição, mesmo sem marcador de hidratação');

// A hidratação não pode escrever por cima de quem está digitando.
ok(/contenteditable'\) === 'true'\) return;/.test(store.slice(store.indexOf('window._hydrateUidNames'), store.indexOf('window._hydrateUidNames') + 3000)),
  'o hidratador pula o campo que está em edição');
ok((participants.match(/aria-label="Editar /g) || []).length >= 2,
  'o organizador mantém um controle de edição explícito para pessoa e dupla');
ok(/_contactPersonByUid[\s\S]{0,1200}c\.useWhatsApp[\s\S]{0,1000}mailto:/.test(read('js/views/tournaments-organizer.js')),
  'o balão mantém WhatsApp como prioridade e e-mail como fallback');

// Fixture mínima do card de jogo: o listener delegado roda na captura e interrompe o
// evento antes do onclick do card. Assim, tocar no nome nunca abre placar/edição junto.
const vm = require('vm');
const listeners = {};
const documentFixture = {
  addEventListener(type, fn, capture) { listeners[type] = { fn, capture }; },
  querySelectorAll() { return []; }
};
const W = { window: null, document: documentFixture };
W.window = W;
const activationStart = store.indexOf('window._activatePlayerProfileLinks = function');
const activationEnd = store.indexOf('\n\nwindow._openPlayerProfileFromNameElement', activationStart);
vm.createContext(W);
vm.runInContext(store.slice(activationStart, activationEnd), W, { filename: 'player-profile-activation' });
function fixtureElement(attributes, parent) {
  const attrs = Object.assign({}, attributes);
  const classes = {};
  return {
    parentNode: parent,
    textContent: 'Ana',
    getAttribute(key) { return attrs[key] || ''; },
    setAttribute(key, value) { attrs[key] = String(value); },
    removeAttribute(key) { delete attrs[key]; },
    classList: { add(key) { classes[key] = true; }, remove(key) { delete classes[key]; } },
    attrs,
    classes
  };
}
const activationRoot = { querySelectorAll() { return [profileWrapper, nameMarker]; } };
const profileWrapper = fixtureElement({ 'data-player-profile-uid': 'u-ana' }, activationRoot);
const nameMarker = fixtureElement({ 'data-uid-name': 'u-ana' }, profileWrapper);
W._activatePlayerProfileLinks(activationRoot);
ok(profileWrapper.attrs.role === 'button' && profileWrapper.attrs.tabindex === '0' &&
  !nameMarker.attrs.role && !nameMarker.attrs.tabindex,
  'o wrapper é o único botão; o marcador interno continua só para hidratação');
const start = store.indexOf('window._openPlayerProfileFromNameElement = function');
const end = store.indexOf('\nwindow._profileAvatarUrl', start);
vm.runInContext(store.slice(start, end), W, { filename: 'player-profile-delegation' });
let opened = 0, cardOpened = 0;
W._openPlayerProfile = function (name, opts) { if (name === 'Ana' && opts.uid === 'u-ana') opened++; };
const card = { parentNode: documentFixture };
const name = {
  parentNode: card,
  getAttribute(key) { return ({ 'data-player-profile-uid': 'u-ana', 'data-player-profile-name': 'Ana' })[key] || ''; }
};
const click = { target: name, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
listeners.click.fn(click);
if (!click.stopped) cardOpened++;
ok(listeners.click.capture === true && opened === 1 && click.prevented && click.stopped && cardOpened === 0,
  'no card de jogo, tocar no nome abre só a ficha e não abre o placar');

/* ── FIXTURE DE COMPORTAMENTO: abrir o lápis e fechar sem digitar NÃO chama a Function ──
 * ⛔ O campo mostra o nome VIVO do perfil; o `oldName` do pacote é o GRAVADO. Comparar só
 * com o gravado fazia o blur sozinho disparar a renomeação de quem tem perfil — que é
 * todo mundo com conta. [[feedback_a_defesa_vaza_pela_borda]] */
{
  const corpoEdit = _corpoDaFuncao(participants, 'window._editParticipantName = function');
  const corpoResolve = _corpoDaFuncao(participants, 'window._resolveEditNameTarget = function');
  const W2 = {};
  W2.window = W2;
  let chamouCF = 0, avisos = [];
  const ouvintes = {};
  const marcador = {
    _attrs: { 'data-uid-name': 'u-ana' },
    _estilo: {},
    parentNode: null,
    textContent: 'Ana Perfil',
    style: {},
    getAttribute(k) { return this._attrs[k] || ''; },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    removeAttribute(k) { delete this._attrs[k]; },
    focus() {},
    blur() { if (ouvintes.blur) { const f = ouvintes.blur; delete ouvintes.blur; f(); } },
    addEventListener(tipo, fn) { ouvintes[tipo] = fn; }
  };
  const escopo = {
    _attrs: { 'data-edit-name-scope': '', 'data-edit-key': 't1|u-ana' },
    getAttribute(k) { return this._attrs[k] || ''; },
    querySelector(sel) { return sel.indexOf('data-uid-name') !== -1 ? marcador : null; }
  };
  marcador.parentNode = escopo;
  const botao = { closest() { return escopo; } };
  W2.document = {
    createRange() { return { selectNodeContents() {} }; },
    querySelectorAll() { return []; }
  };
  W2.getSelection = function () { return { removeAllRanges() {}, addRange() {} }; };
  W2.showNotification = function (t2, m2) { avisos.push(String(t2) + '|' + String(m2)); };
  W2._callCF = function () { chamouCF++; return Promise.resolve({}); };
  W2._hydrateUidNames = function () {};
  W2._reRenderParticipants = function () {};
  W2._t = function (k) { return k; };
  vm.createContext(W2);
  vm.runInContext('window._resolveEditNameTarget = function (btn, chave) ' + corpoResolve, W2, { filename: 'resolve-alvo' });
  vm.runInContext('var showNotification = window.showNotification; var _t = window._t;' +
    'var _reRenderParticipants = window._reRenderParticipants;' +
    'window._editParticipantName = function(tId, oldName, targetUid, btn) ' + corpoEdit, W2, { filename: 'editar-nome' });

  /* ⛔ A FIXTURE PASSOU A EDITAR QUEM NÃO TEM CONTA. A edição de conta foi eliminada, então
   * exercitá-la aqui testaria um caminho que já não existe. Sem uid, o nome gravado É a
   * identidade — e é esse o caso legítimo do lápis. */
  W2._editParticipantName('t1', 'Ana Gravada', '', botao);
  ok(marcador._attrs['contenteditable'] === 'true', 'o lápis abriu a edição no span do nome, não no botão');
  ok(marcador._attrs['data-player-profile-disabled'] === '1', 'durante a edição a ficha fica travada');
  marcador.blur();
  ok(chamouCF === 0, 'abrir e fechar sem digitar NÃO chama a Cloud Function (nome vivo ≠ nome gravado)');
  ok(marcador.textContent === 'Ana Perfil', 'o campo continua com o nome VIVO, não com o gravado');
  ok(!marcador._attrs['data-player-profile-disabled'], 'a trava da ficha sai ao terminar');

  // Escape depois de digitar: também não chama, e devolve o nome vivo.
  W2._editParticipantName('t1', 'Ana Gravada', '', botao);
  marcador.textContent = 'Ana Nova';
  ouvintes.keydown({ key: 'Escape', preventDefault() {} });
  ok(chamouCF === 0 && marcador.textContent === 'Ana Perfil',
    'Escape descarta o que foi digitado e não dispara a renomeação');

  // Digitar de verdade e sair: aí sim chama, com o nome GRAVADO como referência.
  W2._editParticipantName('t1', 'Ana Gravada', '', botao);
  marcador.textContent = 'Ana Souza';
  let pacote = null;
  W2._callCF = function (fn, p2) { chamouCF++; pacote = p2; return { then(f) { f(); return { catch() { return { finally() {} }; } }; } }; };
  marcador.blur();
  ok(chamouCF === 1 && pacote && pacote.oldName === 'Ana Gravada' && pacote.newName === 'Ana Souza',
    'editar de verdade manda o nome GRAVADO como oldName e o digitado como novo');

  /* ⛔ E COM CONTA, RECUSA — sem abrir nada e sem chamar servidor. */
  marcador._attrs['contenteditable'] = 'false';
  const antesDaRecusa = chamouCF;
  W2._editParticipantName('t1', 'Ana Gravada', 'uid-conta-real-01', botao);
  ok(marcador._attrs['contenteditable'] === 'false' && chamouCF === antesDaRecusa,
    '⛔ com conta não abre edição nem chama o servidor — o nome é da pessoa');
  ok(avisos.some((a) => /O nome é da pessoa/.test(a)),
    'e diz por quê, em vez de falhar calado');
}

console.log(fail ? `❌ nome-sempre-abre-estatisticas: ${fail} falha(s), ${pass} ok` : `✅ nome-sempre-abre-estatisticas: ${pass} ok`);
process.exit(fail ? 1 : 0);
