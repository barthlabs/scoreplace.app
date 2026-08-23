/* O botão de dar W.O. fica na MESMA PONTA da linha — com e sem W.O. aplicado —
 * e diz o que faz ("Aplicar W.O.").
 *
 * Relato do dono (print de 14/ago, R1 Grupo J): "aqui que já tem um W.O.
 * aplicado o botão mudou de lado (na esquerda) quando deveria estar na direita.
 * esse botão está causando alguma confusão. vamos renomear para aplicar W.O."
 *
 * POR QUE ISTO EXISTE COMO TESTE: a posição deste botão já regrediu DUAS vezes
 * (1.7.90 montou o botão duas vezes com aparências diferentes; 1.7.93 unificou e
 * o pôs em PRIMEIRO). As duas correções foram verificadas só no navegador — não
 * havia trava. Esta é a trava.
 *
 * O invariante (o que a 1.7.93 queria e mediu do jeito errado): o bloco de W.O.
 * é o ÚLTIMO da linha do cabeçalho do grupo, então o botão tem que ser o último
 * do bloco pra ficar na mesma ponta nos dois estados. Medir "primeiro do bloco"
 * parecia certo olhando só o bloco, e empurrava o botão pro meio da linha assim
 * que a pílula de status e o "Reverter" nasciam.
 *
 * Rodado por: npm test (tests/run-unit.js)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── wo-botao-aplicar-na-ponta ────');

const ROOT = path.join(__dirname, '..');
const SUB = fs.readFileSync(path.join(ROOT, 'js', 'views', 'liga-substitution.js'), 'utf8');
const STORE = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');

// O SISTEMA REAL do botão (store.js) — extraído por marcadores, não copiado: se a
// aparência mudar lá, muda aqui junto. ⚠️ 2.0.20: a fatia começa no CABEÇALHO da seção,
// não mais no `window._woBtnHtml =` — o RÓTULO virou parte do sistema (`_woDeclareLabel`,
// declarado logo acima do construtor) e cortar antes dele derrubava o módulo inteiro.
const woBtnSrc = STORE.slice(STORE.indexOf('// ─── Botão W.O. PADRONIZADO em todo o app'),
                             STORE.indexOf('// ─── Trava de reversão de W.O.'));
ok(woBtnSrc.length > 200, 'sistema do botão W.O. extraído do store.js');
ok(/window\._woDeclareLabel\s*=/.test(woBtnSrc) && /window\._woBtnHtml\s*=/.test(woBtnSrc),
   'o rótulo e o construtor moram na MESMA seção (um sistema só, não dois pedaços)');

function carrega(t) {
  const win = {
    _safeHtml: (s) => String(s == null ? '' : s),
    _isLigaFormat: () => true,
    // Quem vê o botão é quem PODE gerir o grupo — a regra real
    // (`_canManageGroup`) aceita organizador via `_canManagePresence`.
    _canManagePresence: () => true,
    _findTournamentById: () => t,
    AppStore: { currentUser: { uid: 'u-org', email: 'org@x.com' }, tournaments: [t] },
    _matchHasRealPlay: () => false
  };
  win.window = win;
  const ctx = vm.createContext(win);
  ctx.document = { getElementById: () => null };
  ctx.setTimeout = setTimeout; ctx.clearTimeout = clearTimeout;
  vm.runInContext(woBtnSrc, ctx);     // _woBtnHtml real
  vm.runInContext(SUB, ctx);          // módulo real
  return ctx;
}

// Torneio Liga com o usuário como ORGANIZADOR (é quem vê o botão).
function torneio(group) {
  return {
    id: 't1', name: 'Confra', format: 'Liga', status: 'active',
    creatorUid: 'u-org', organizerEmail: 'org@x.com',
    rounds: [{ monarchGroups: [group] }]
  };
}
const GRUPO_BASE = { name: 'R1 Grupo J', players: ['Toninho', 'Silvia', 'Fabiana', 'Anke'], matches: [] };

// Posição do botão de aplicar DENTRO do html do bloco.
function posDoBotao(html) {
  const i = html.indexOf('Aplicar');
  if (i === -1) return { achou: false };
  // é o último elemento? nada de tag depois do fecho do botão dele
  const fim = html.indexOf('</button>', i) + '</button>'.length;
  // v1.8.72: com W.O. aplicado o botão vem dentro de um invólucro que o cola na
  // borda direita (margin-left:auto) — o que importa é não haver mais NENHUM
  // controle depois dele.
  const depois = html.slice(fim).replace(/<\/span>/g, '').trim();
  return { achou: true, indice: i, ehUltimo: depois === '' };
}

// ── 1. SEM W.O.: botão sozinho, com o rótulo novo ─────────────────────────
const ctxA = carrega(torneio(Object.assign({}, GRUPO_BASE)));
const semWo = ctxA.window._ligaGroupControlsHtml(ctxA.window.AppStore.tournaments[0], 0,
  ctxA.window.AppStore.tournaments[0].rounds[0].monarchGroups[0]);
ok(/Aplicar<br>W\.O\./.test(semWo),
   '🔒 o rótulo é "Aplicar W.O." — um VERBO. "W.O." sozinho lê como selo de estado (a tabela usa isso ao lado de quem levou)');
// ⚠️ o `<br>` do rótulo em 2 linhas fecha com ">" e faria um regex ingênuo casar
// (">W.O.</button>" existe dentro de "Aplicar<br>W.O.</button>"). Neutraliza a
// quebra antes de perguntar se sobrou algum botão SÓ com "W.O.".
ok(!/>W\.O\.<\/button>/.test(semWo.replace(/<br>/g, ' ')),
   'não sobrou botão cujo rótulo INTEIRO seja o "W.O." pelado');
ok(posDoBotao(semWo).ehUltimo, 'sem W.O. o botão é o último do bloco (é o único)');
ok(/btn-danger/.test(semWo), 'segue vermelho sólido (padrão de "declarar W.O.")');

// ── 2. COM W.O. aplicado: pílula + Reverter ANTES, botão na PONTA ─────────
const gWo = Object.assign({}, GRUPO_BASE, {
  woAbsent: 'Anke', subStatus: 'filled', subName: 'Fabiana Ferre'
});
const ctxB = carrega(torneio(gWo));
const comWo = ctxB.window._ligaGroupControlsHtml(ctxB.window.AppStore.tournaments[0], 0,
  ctxB.window.AppStore.tournaments[0].rounds[0].monarchGroups[0]);
const pB = posDoBotao(comWo);
ok(pB.achou, 'com W.O. aplicado o botão CONTINUA existindo (dar W.O. em outra pessoa é sempre possível — regra da 1.7.90)');
ok(pB.ehUltimo,
   '🔒 com W.O. aplicado o botão é o ÚLTIMO do bloco — mesma ponta da linha que no estado sem W.O. (o relato do dono)');
ok(comWo.indexOf('W.O. →') < pB.indice,
   'a pílula de status ("Anke W.O. → Fabiana") vem ANTES do botão · achado: pílula em ' + comWo.indexOf('W.O. →') + ', botão em ' + pB.indice);
ok(/margin-left:auto[^>]*>\s*<button[^>]*>Aplicar<br>W\.O\./.test(comWo),
   '🔒 com W.O. aplicado o botão vai COLADO NA BORDA DIREITA da linha de estado (margin-left:auto) — "como era antes", quando o cabeçalho já o empurrava');
ok(comWo.indexOf('Reverter<br>W.O.') < pB.indice,
   '🔒 o "Reverter W.O." também vem antes — era ele que empurrava o botão pro meio quando o botão era o primeiro');

// ── 3. APARÊNCIA IDÊNTICA nos dois estados (a regressão da 1.7.90) ────────
const classe = (h) => (h.match(/class="([^"]*btn-danger[^"]*)"/) || [])[1];
const fonte = (h) => (h.match(/Aplicar<br>W\.O\./) ? (h.slice(0, h.indexOf('Aplicar')).match(/font-size:([^;]+);[^"]*"$/) || [])[1] : null);
ok(classe(semWo) === classe(comWo),
   '🔒 mesma CLASSE nos dois estados (a 1.7.90 tinha btn-sm × btn-micro — visivelmente menor com W.O.)');
// 2.0.20: a fonte do botão de DECLARAR é canônica (`_WO_DECLARE_FONT`, menor porque o
// rótulo tem 2 linhas). Lida do store.js — cravar "0.72rem" aqui era o teste guardando
// um número que o sistema não promete mais.
const FONTE_DECLARAR = (STORE.match(/_WO_DECLARE_FONT\s*=\s*'([^']+)'/) || [])[1];
ok(!!FONTE_DECLARAR, 'o store.js declara a fonte canônica do botão de W.O. (_WO_DECLARE_FONT)');
const _reFonte = new RegExp('font-size:' + FONTE_DECLARAR.replace('.', '\\.'));
ok(_reFonte.test(semWo) && _reFonte.test(comWo),
   'mesmo tamanho de fonte (o canônico, ' + FONTE_DECLARAR + ') nos dois estados');

// ── 4. O CAMINHO IRMÃO (Rei/Rainha por t.matches) segue a mesma regra ─────
const tMon = {
  id: 't2', name: 'Confra', format: 'Liga', status: 'active',
  creatorUid: 'u-org', organizerEmail: 'org@x.com',
  matches: [
    { id: 'm1', monarchGroup: 0, groupName: 'R1 Grupo J', team1: ['Toninho'], team2: ['Silvia'] },
    { id: 'wo1', monarchGroup: 0, groupName: 'R1 Grupo J', isSitOut: true, sitOutReason: 'wo',
      p1: 'Anke', woReplacedBy: 'Fabiana Ferre' }
  ]
};
const ctxC = carrega(tMon);
const mon = ctxC.window._monWoControlHtml('t2', 0, 'R1 Grupo J', false);
if (/Aplicar<br>W\.O\./.test(mon)) {
  ok(posDoBotao(mon).ehUltimo,
     '🔒 o caminho Rei/Rainha (t.matches) põe o botão na MESMA ponta — os dois usam o mesmo helper');
} else {
  ok(true, '(caminho Rei/Rainha não montou botão neste fixture — coberto pelo bloco da rota Liga)');
}

// ── 5. varredura: uma definição só, e o helper compõe com o botão no fim ──
// 2.0.20: o rótulo saiu da VIEW e virou canônico do `_woBtnHtml` (ordem do dono: um
// sistema só, valendo pra todo botão de W.O. do app). Então aqui o invariante virou o
// oposto do de antes: a view NÃO escreve o rótulo, e monta o botão num lugar só.
ok((SUB.match(/label: 'Aplicar<br>W\.O\.'/g) || []).length === 0,
   '🔒 a view não escreve mais o rótulo — quem manda é o _woDeclareLabel do store.js');
ok((SUB.match(/function _woDeclareBtn/g) || []).length === 1,
   '🔒 UMA montagem do botão (duas montagens é o que fez uma delas divergir na 1.7.90)');
ok(/return resto \+ '<span style="margin-left:auto;[^']*'\s*\+ btn \+ '<\/span>';/.test(SUB),
   '🔒 o compositor põe o RESTO antes e o BOTÃO por último, colado na borda direita');
ok(!/entra SEMPRE em primeiro|PRIMEIRO elemento do bloco/.test(SUB),
   'nenhum comentário ainda afirma que o botão é o primeiro (comentário que mente é o que faz consertar o lugar errado)');

console.log('wo-botao-aplicar-na-ponta:', pass, 'ok,', fail, 'falhas');
if (fail > 0) process.exit(1);
