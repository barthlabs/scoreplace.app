/* QUEM NÃO ENTRA NO SORTEIO APARECE — E EM VERMELHO  (FIX.UI.P2)
 * node tests/quem-nao-entra-no-sorteio-aparece.test.js
 *
 * Pedido do dono (01/set/2026), depois de criar um sandbox e clicar em avançar fase:
 *   _"nessa tela deveria falar sobre os wo tambem que nao entrarao no sorteio. os nomes
 *    deveriam aparecer vermelhos (como nas listas em que estão)."_
 *   _"tambem precisa ter um cancelar/confirmar"_
 *   _"cancelar e seguir na tela seguinte tambem. esses botoes sempre no topo travados e visiveis"_
 *
 * A decisão é de cadastro, nunca de classificação: inativos e W.O. não entram na
 * eliminatória. O organizador decide se TODOS os nomes exibidos ficam no torneio,
 * desativados e reativáveis, ou se são removidos definitivamente.
 *
 * As duas listas saem da MESMA marca (`woDeactivatedAt`), em lados opostos — então elas não
 * podem se sobrepor nem deixar alguém de fora. Isso é medido aqui.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require('./render-harness');
const W = H.sandbox;
try { require('./headless').load('tournaments-draw-prep.js'); } catch (e) { /* medido abaixo */ }

let falhas = 0;
const ok = (n, c, x) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (x ? '\n      ' + x : '')); falhas++; } };

console.log('──── quem não entra no sorteio aparece — e em vermelho ────');

/* Captura o HTML que o painel monta: o overlay é criado por document.createElement e
 * recebe innerHTML. Não é leitura de fonte — é o markup que o navegador receberia. */
function capturaPainel(fn) {
  const criados = [];
  const orig = W.document.createElement;
  W.document.createElement = function () {
    const el = orig.apply(this, arguments);
    criados.push(el);
    return el;
  };
  try { fn(); } finally { W.document.createElement = orig; }
  return criados.map((e) => e.innerHTML || '').join('\n');
}

// ⚠️ chama a porta se ela existir; contra a árvore ANTERIOR várias não existem, e o teste
// tem que REPORTAR cada falha em vez de explodir na primeira.
const chama = (nome, ...args) => (typeof W[nome] === 'function' ? W[nome](...args) : undefined);

const ORG = { uid: 'uOrg', email: 'org@x.com', displayName: 'Org' };
function torneio() {
  return {
    id: 'tw1', name: 'T', sport: 'Beach Tennis', status: 'in_progress',
    allowSelfDeactivation: true, currentPhaseIndex: 0,
    phases: [{ name: 'Rei/Rainha' }, { name: 'Ouro/Prata' }],
    participants: [
      { uid: 'u1', displayName: 'Ativo Um', ligaActive: true },
      { uid: 'u2', displayName: 'Ativo Dois', ligaActive: true },
      // desativou por conta própria → ENTRA na escolha
      { uid: 'u3', displayName: 'Desativou Sozinho', ligaActive: false },
      { uid: 'u4', displayName: 'Desativou Também', ligaActive: false },
      // levou W.O. → NÃO entra na escolha, mas TEM que aparecer
      { uid: 'u5', displayName: 'Levou WO Um', ligaActive: false, woDeactivatedAt: '2026-08-30T10:00:00.000Z' },
      { uid: 'u6', displayName: 'Levou WO Dois', ligaActive: false, woDeactivatedAt: '2026-08-30T11:00:00.000Z' }
    ]
  };
}
const t = torneio();
W.AppStore.tournaments = [t];
W.AppStore.currentUser = ORG;
W._findTournamentById = (id) => (String(id) === t.id ? t : null);

console.log('\n── ① as duas listas saem da MESMA marca, em lados opostos ──');
ok('as portas existem', typeof W._phasePendingInactives === 'function' && typeof W._phaseWoDeactivated === 'function');
const inat = W._phasePendingInactives(t);
// ⚠️ sem `?.` de propósito: contra a árvore ANTERIOR a porta não existe, e o teste tem que
// REPORTAR as 20 falhas em vez de explodir na primeira e esconder as outras 19.
const wo = (typeof W._phaseWoDeactivated === 'function') ? W._phaseWoDeactivated(t) : [];
const nomes = (l) => l.map((p) => p.displayName).sort().join(' · ');
ok('⭐ inativos = só quem se desativou (2)', inat.length === 2 && nomes(inat) === 'Desativou Sozinho · Desativou Também', nomes(inat));
ok('⭐ W.O. = só quem levou W.O. (2)', wo.length === 2 && nomes(wo) === 'Levou WO Dois · Levou WO Um', nomes(wo));
ok('⛔ ninguém está nas DUAS listas', !inat.some((a) => wo.indexOf(a) !== -1));
const desativados = t.participants.filter((p) => p.ligaActive === false);
ok('⛔ e ninguém desativado ficou de fora das duas (' + desativados.length + ' = ' + inat.length + ' + ' + wo.length + ')',
  inat.length + wo.length === desativados.length);

console.log('\n── ② o painel FALA dos W.O. — e os nomes saem em VERMELHO ──');
const html = capturaPainel(() => W._showInactivePhasePanel(t.id, inat));
ok('o painel foi montado', html.length > 500, 'veio ' + html.length + ' bytes');
ok('⭐⭐ os W.O. aparecem pelo NOME', /Levou WO Um/.test(html) && /Levou WO Dois/.test(html));
ok('⭐⭐ e o painel diz que eles NÃO entram no sorteio', /não entram no sorteio/i.test(html));
ok('⭐ os desativados também aparecem pelo nome', /Desativou Sozinho/.test(html) && /Desativou Também/.test(html));
ok('⭐⭐ os nomes saem na tinta VERMELHA canônica (#f87171 — a mesma das listas)',
  /--sp-c-f87171,#f87171/.test(html) && /rgba\(239,68,68/.test(html));
ok('  → há a seção "W.O." e a seção "Desativados"', />⚠️ W\.O\.</.test(html) && />🔴 Desativados</.test(html));
ok('  → e o cabeçalho conta os dois grupos', /levaram W\.O\./.test(html) && /desativaram/.test(html));

console.log('\n── ③ a decisão vale para todos, sem falsa inclusão na eliminatória ──');
const opcoes = (html.match(/id="inact-opt-([a-z]+)"/g) || []);
ok('⭐⭐ existem exatamente 2 opções (manter/excluir definitivamente)',
  opcoes.length === 2 && /inact-opt-keep/.test(html) && /inact-opt-remove/.test(html), opcoes.join(', '));
ok('⛔ não existe opção de incluir na eliminatória', !/Incluir na eliminatória/.test(html));
ok('⭐ as opções vêm ANTES dos nomes', html.indexOf('inact-opt-keep') < html.indexOf('Desativou Sozinho'));
ok('⭐ o texto diz que a escolha alcança todas as pessoas abaixo', /todas as pessoas abaixo/.test(html));
const src = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-draw-prep.js'), 'utf8');
const _corpoResolve = (function () {
  const i = src.indexOf('window._resolvePhaseInactives = function');
  return i < 0 ? '' : src.slice(i, src.indexOf('\n};', i));
})();
ok('⭐⭐ o resolvedor reúne as duas listas pela porta canônica',
  _corpoResolve.indexOf('window._phaseNonEntrants(t)') !== -1);
ok('⛔ o resolvedor não reativa nem escreve _includeInactive',
  _corpoResolve.indexOf('ligaActive = true') === -1 && _corpoResolve.indexOf('_includeInactive') === -1);

console.log('\n── ④ barra Cancelar/Confirmar FIXA no topo, antes do corpo rolável ──');
const iBarra = html.indexOf('inact-confirm-btn');
const iCorpo = html.indexOf('overflow-y:auto');
ok('⭐⭐ tem Cancelar e Confirmar', /✕ Cancelar/.test(html) && /✓ Confirmar/.test(html));
ok('⭐⭐ a barra vem ANTES do corpo que rola (nunca sai da tela)', iBarra > 0 && iCorpo > 0 && iBarra < iCorpo,
  'barra em ' + iBarra + ', corpo em ' + iCorpo);
ok('⭐ e ela é flex-shrink:0 (o padrão canônico — não é cortada por scroll)',
  /flex-shrink:0;display:flex;gap:10px;padding:12px 1\.4rem/.test(html));
ok('⭐ o Confirmar nasce DESABILITADO (sem escolha, não aplica nada)', /id="inact-confirm-btn" disabled/.test(html));
/* ⛔ O Cancelar do AVANÇO não é o do SORTEIO. `_cancelDrawResolution` restaura snapshots de
 * elenco, reabre inscrições e CHAMA saveTournament — no avanço nada foi mutado ainda, então
 * gravar seria escrever por escrever. Ordem do dono: _"cancelar apenas fecha o painel e não
 * grava, não avança e não muda participantes"_. Medido no bloco ⑪. */
ok('  → Cancelar usa o cancelar do AVANÇO (só fecha, não grava)', /window\._cancelPhaseAdvance\(/.test(html));
ok('  → e NÃO o cancelar do sorteio', !/window\._cancelDrawResolution\(/.test(html));

console.log('\n── ⑤ escolher → habilita; Confirmar → aplica pela porta de sempre ──');
W._inactPanelChoice = null;
let aplicado = null;
const _origResolve = W._resolvePhaseInactives;
W._resolvePhaseInactives = (tid, choice) => { aplicado = { tid, choice }; };
chama('_inactPanelConfirm', t.id, null);
ok('⭐⭐ sem escolha, Confirmar NÃO aplica nada', aplicado === null, JSON.stringify(aplicado));
chama('_inactPanelPick', 'keep');
ok('escolher grava a escolha', W._inactPanelChoice === 'keep');
chama('_inactPanelConfirm', t.id, null);
ok('⭐⭐ Confirmar aplica a escolha pela porta de sempre', aplicado && aplicado.choice === 'keep' && aplicado.tid === t.id,
  JSON.stringify(aplicado));
W._resolvePhaseInactives = _origResolve;

console.log('\n── ⑤b excluir definitivamente remove inativos E W.O., sem alterar histórico ──');
const tExcluir = torneio();
let saveOpts = null, avancosAposSave = 0;
W.AppStore.tournaments = [tExcluir];
W._findTournamentById = (id) => (String(id) === tExcluir.id ? tExcluir : null);
W.FirestoreDB = { saveTournament: (_t, opts) => { saveOpts = opts; return Promise.resolve(); } };
W._advanceMultiPhase = () => { avancosAposSave++; };
chama('_resolvePhaseInactives', tExcluir.id, 'remove');
ok('⭐⭐ saem os 2 desativados e os 2 W.O. (sobram só os ativos)',
  tExcluir.participants.length === 2 && tExcluir.participants.every((p) => p.ligaActive !== false));
ok('⭐⭐ a remoção pede explicitamente a porta de encolhimento autorizado',
  saveOpts && saveOpts.allowRosterRemoval === true, JSON.stringify(saveOpts));
ok('⛔ não criou _includeInactive nem reativou alguém',
  !tExcluir.phases[1]._includeInactive && !tExcluir.participants.some((p) => p.uid === 'u3' || p.uid === 'u4' || p.uid === 'u5' || p.uid === 'u6'));
W.AppStore.tournaments = [t];
W._findTournamentById = (id) => (String(id) === t.id ? t : null);

console.log('\n── ⑥ a TELA SEGUINTE (promover linha) tem Cancelar e Seguir, também no topo ──');
t._phaseResInfo = { lines: [{ label: 'Ouro', dest: 'upper', size: 35 }, { label: 'Prata', dest: 'lower', size: 35 }],
                    nextIdx: 1, nextName: 'Ouro/Prata' };
const html2 = capturaPainel(() => W._showPhasePromotePanel(t.id));
ok('o painel de promoção foi montado', html2.length > 500, 'veio ' + html2.length + ' bytes');
ok('⭐⭐ tem Cancelar e Seguir', /✕ Cancelar/.test(html2) && /✓ Seguir/.test(html2));
const iBarra2 = html2.indexOf('promote-confirm-btn'), iCorpo2 = html2.indexOf('overflow-y:auto');
ok('⭐⭐ a barra vem ANTES do corpo que rola', iBarra2 > 0 && iCorpo2 > 0 && iBarra2 < iCorpo2,
  'barra em ' + iBarra2 + ', corpo em ' + iCorpo2);
ok('⭐ o Seguir nasce DESABILITADO', /id="promote-confirm-btn" disabled/.test(html2));
ok('⭐ as duas escolhas viraram opções selecionáveis', /id="promote-opt-yes"/.test(html2) && /id="promote-opt-no"/.test(html2));
ok('  → e os números da linha continuam na tela (35 → 36 / 35 → 34)', /Ouro/.test(html2) && /Prata/.test(html2) && /35/.test(html2));

console.log('\n── ⑦ Seguir despacha pras portas de sempre (regra intacta) ──');
let promoveu = null;
const _oa = W._phasePromoteApply, _os = W._phasePromoteSkip;
W._phasePromoteApply = (tid) => { promoveu = { tid, via: 'apply' }; };
W._phasePromoteSkip = (tid) => { promoveu = { tid, via: 'skip' }; };
W._promotePanelChoice = null;
chama('_promotePanelConfirm', t.id, null);
ok('⭐⭐ sem escolha, Seguir NÃO avança', promoveu === null, JSON.stringify(promoveu));
chama('_promotePanelPick', 'yes'); chama('_promotePanelConfirm', t.id, null);
ok('⭐⭐ "Promover" → _phasePromoteApply', promoveu && promoveu.via === 'apply', JSON.stringify(promoveu));
promoveu = null;
chama('_promotePanelPick', 'no'); chama('_promotePanelConfirm', t.id, null);
ok('⭐⭐ "Não promover" → _phasePromoteSkip', promoveu && promoveu.via === 'skip', JSON.stringify(promoveu));
W._phasePromoteApply = _oa; W._phasePromoteSkip = _os;

console.log('\n── ⑧ nada de regra mudou ──');
ok('_phasePromoteHelps intacta (35/35 ímpares → oferece)', W._phasePromoteHelps([{ size: 35 }, { size: 35 }]) === true);
ok('  → e 36/34 (pares) não oferece', W._phasePromoteHelps([{ size: 36 }, { size: 34 }]) === false);
ok('⛔ as listas seguem separando motivo comum e W.O.',
  /p\.ligaActive === false && !p\.woDeactivatedAt/.test(src));

console.log('\n── ⑨ SÓ W.O., sem inativo comum: o painel APARECE (não pode ser silencioso) ──');
const tSoWo = torneio();
tSoWo.participants = tSoWo.participants.filter((p) => p.ligaActive !== false || p.woDeactivatedAt);
W.AppStore.tournaments = [tSoWo];
W._findTournamentById = (id) => (String(id) === tSoWo.id ? tSoWo : null);
const inatSo = W._phasePendingInactives(tSoWo), woSo = chama('_phaseWoDeactivated', tSoWo) || [];
ok('o cenário é só-W.O. (0 inativos, 2 W.O.)', inatSo.length === 0 && woSo.length === 2);
const htmlSo = capturaPainel(() => W._showInactivePhasePanel(tSoWo.id, inatSo));
ok('⭐⭐ o painel APARECE mesmo sem inativo comum', htmlSo.length > 500, 'veio ' + htmlSo.length + ' bytes');
ok('⭐⭐ e mostra os W.O. pelo nome, em vermelho', /Levou WO Um/.test(htmlSo) && /--sp-c-f87171,#f87171/.test(htmlSo));
ok('⭐ também oferece as duas escolhas', (htmlSo.match(/id="inact-opt-/g) || []).length === 2);
ok('⭐⭐ e o botão nasce desabilitado até a decisão explícita', /id="inact-confirm-btn" disabled/.test(htmlSo));
ok('  → a opção manter explica que seguem inscritos', /Continuam inscritas, desativadas/.test(htmlSo));
// e o GATE do avanço abre o painel nesse caso (antes só olhava a lista de inativos)
const eng = fs.readFileSync(path.join(ROOT, 'js/views/phases-engine.js'), 'utf8');
ok('⭐⭐ o gate do avanço também dispara com só-W.O.', /_inatvList\.length \|\| _woList\.length/.test(eng));

console.log('\n── ⑩ SEM W.O.: a seção não aparece ──');
const tSemWo = torneio();
tSemWo.participants = tSemWo.participants.filter((p) => !p.woDeactivatedAt);
W.AppStore.tournaments = [tSemWo];
W._findTournamentById = (id) => (String(id) === tSemWo.id ? tSemWo : null);
const htmlSem = capturaPainel(() => W._showInactivePhasePanel(tSemWo.id, W._phasePendingInactives(tSemWo)));
ok('⭐⭐ nenhuma seção de W.O.', !/>⚠️ W\.O\.</.test(htmlSem));
ok('  → mas a de Desativados continua', />🔴 Desativados</.test(htmlSem));
ok('  → e as duas escolhas seguem lá', (htmlSem.match(/id="inact-opt-/g) || []).length === 2);

console.log('\n── ⑪ Cancelar SÓ FECHA: não grava, não avança, não mexe em ninguém ──');
W.AppStore.tournaments = [t];
W._findTournamentById = (id) => (String(id) === t.id ? t : null);
let gravou = 0, avancou = 0;
W.FirestoreDB = { db: true, saveTournament: () => { gravou++; return Promise.resolve(true); } };
const _origAdv = W._advanceMultiPhase; W._advanceMultiPhase = () => { avancou++; };
const antesCancel = JSON.stringify(t.participants);
chama('_cancelPhaseAdvance', t.id);
ok('⭐⭐ não gravou nada', gravou === 0, 'gravou ' + gravou + '×');
ok('⭐⭐ não avançou', avancou === 0, 'avançou ' + avancou + '×');
ok('⭐⭐ não mexeu em participante nenhum', JSON.stringify(t.participants) === antesCancel);
ok('  → e limpou a escolha em memória', W._inactPanelChoice === null && W._promotePanelChoice === null);
W._advanceMultiPhase = _origAdv;
const _srcAgora = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-draw-prep.js'), 'utf8');
const _usosCancel = (_srcAgora.match(/window\._cancelPhaseAdvance\(/g) || []).length;
ok('⛔ os dois painéis do avanço usam o cancelar que só fecha (achei ' + _usosCancel + ')',
  _usosCancel === 2);   // um botão em cada painel (a definição usa `= function`, não casa)
ok('  → e ele NÃO chama saveTournament (é o que "não grava" quer dizer)',
  (() => { const i = _srcAgora.indexOf('window._cancelPhaseAdvance = function');
           const corpo = i < 0 ? '' : _srcAgora.slice(i, _srcAgora.indexOf('\n};', i));
           return corpo.indexOf('saveTournament') === -1; })());

console.log('\n── ⑫ a barra fica no topo em 390px e no desktop ──');
// A barra é irmã do corpo num flex column: `flex-shrink:0` (não encolhe) + o corpo com
// `overflow-y:auto;flex:1` (só ele rola). Isso não depende de largura — vale nos dois.
[['390px (celular)', 390], ['desktop', 1280]].forEach(([rot, larg]) => {
  const antes = W.innerWidth; W.innerWidth = larg;
  const h = capturaPainel(() => W._showInactivePhasePanel(t.id, W._phasePendingInactives(t)));
  const iB = h.indexOf('inact-confirm-btn'), iC = h.indexOf('overflow-y:auto');
  const barraNaoEncolhe = /flex-shrink:0;display:flex;gap:10px;padding:12px 1\.4rem/.test(h);
  const soOCorpoRola = /overflow-y:auto;flex:1/.test(h);
  ok('⭐⭐ ' + rot + ': barra antes do corpo, não encolhe, e só o corpo rola',
    iB > 0 && iC > 0 && iB < iC && barraNaoEncolhe && soOCorpoRola,
    'barra=' + iB + ' corpo=' + iC + ' naoEncolhe=' + barraNaoEncolhe + ' soCorpoRola=' + soOCorpoRola);
  W.innerWidth = antes;
});

console.log('\n── ⑬ o fluxo do avanço tem DOIS painéis, não três ──');
// ⛔ O painel de pow2/BYE NÃO faz parte deste fluxo: foi removido de propósito
// ("SEM PAINEL DE AJUSTE DE CHAVEAMENTO", phases-engine). Travado pra ninguém "reintroduzir".
const _corpoAdv = (() => { const i = eng.indexOf('function advanceMultiPhase'); return i < 0 ? '' : eng.slice(i, eng.indexOf('\n  }', i)); })();
// nomes DISTINTOS: cada painel aparece 2× (o `typeof … === 'function'` e a chamada).
const _paineis = [...new Set(_corpoAdv.match(/window\._show[A-Za-z]*Panel/g) || [])].sort();
ok('⭐⭐ o avanço abre exatamente 2 painéis: inativos/W.O. e promover linha',
  _paineis.length === 2 && _paineis.indexOf('window._showInactivePhasePanel') !== -1 &&
  _paineis.indexOf('window._showPhasePromotePanel') !== -1, _paineis.join(', '));
ok('  → e o de ajuste de chaveamento segue REMOVIDO deste fluxo',
  /SEM PAINEL DE AJUSTE DE CHAVEAMENTO/.test(eng));

console.log(falhas === 0
  ? '\n✅ quem-nao-entra-no-sorteio-aparece: OK'
  : '\n❌ quem-nao-entra-no-sorteio-aparece: ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
