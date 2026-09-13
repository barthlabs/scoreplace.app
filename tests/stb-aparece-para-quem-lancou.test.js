'use strict';
/* ⛔ O SUPER TIE-BREAK APARECE PARA QUEM LANÇOU — E A COLUNA CABE DOIS DÍGITOS.
 *
 * Relato do dono (13/set/2026, Confra, jogo 158): _"lancei os placares e o placar do STB não
 * aparece"_ e, logo depois, _"apareceu em outra instância o STB, mas quando lança deveria dar
 * o feedback pra quem lançou e não voltar o 0-0"_. E ainda: _"o campo do STB tem que ser mais
 * largo por receber 2 dígitos de um lado pelo menos. pode até terminar em 22-20"_.
 *
 * ⭐ MEDIDO NO DOCUMENTO REAL antes de mexer: o jogo tem
 *     sets[2] = { gamesP1: 7, gamesP2: 10, superTiebreak: true }
 * ou seja a GRAVAÇÃO ESTÁ CERTA. Quem marca `superTiebreak` é o servidor, ao canonizar. O
 * coletor do formulário NÃO marcava — então a cópia LOCAL, que repinta o card de quem acabou
 * de lançar, ficava com o set sem a marca, o desenho não achava a coluna do STB e mostrava 0.
 * A outra aba, que lê o gravado, mostrava certo. Otimista divergindo do servidor.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const raiz = path.join(__dirname, '..');
const UI = fs.readFileSync(path.join(raiz, 'js/views/bracket-ui.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const semComentario = (s) => s.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

// ── ① o coletor marca o último set como super tie-break ─────────────────────
const col = semComentario(UI);
must(/if \(sc && sc\.superTiebreak && i === totalSets - 1\) setData\.superTiebreak = true;/.test(col),
  '① ⭐ o coletor MARCA o último set quando o torneio tem STB — era isso que faltava na cópia local');
const iMarca = col.indexOf('setData.superTiebreak = true;');
const iPush = col.indexOf('sets.push(setData);', iMarca);
must(iMarca > 0 && iPush > iMarca,
  '① ORDEM: marca ANTES de empilhar — marcar depois seria marcar outra coisa');

// ── ② a coluna do STB nasce com dois dígitos, mesmo vazia ───────────────────
const MODEL = fs.readFileSync(path.join(raiz, 'js/views/bracket-model.js'), 'utf8');
must(/if \(k === 'stb'\) dig = Math\.max\(dig, String\(stbPts\)\.length\);/.test(semComentario(MODEL)),
  '② ⭐ a largura mínima do STB sai do ALVO do super tie-break, não de um número cravado');

// a régua, EXECUTADA: monta o plano com um torneio de melhor de 3 com STB
const sandbox = { window: {}, document: { getElementById: () => null } };
sandbox.window.window = sandbox.window;
sandbox.window._t = (k, d) => d || k;
vm.createContext(sandbox);
vm.runInContext(MODEL, sandbox, { filename: 'bracket-model.js' });
const W = sandbox.window;
must(typeof W._matchSetPlan === 'function', '② a régua do formato carregou');

const sc = { type: 'sets', setsToWin: 2, gamesPerSet: 6, superTiebreak: true, superTiebreakPoints: 10, tiebreakMargin: 2 };
const plano = W._matchSetPlan(sc, { sets: [{ gamesP1: 6, gamesP2: 4 }, { gamesP1: 3, gamesP2: 6 }] }, {});
must(plano && plano.multi, '② melhor de 3 com STB é reconhecido');
const colStb = (plano.columns || []).filter((c) => c.kind === 'stb')[0];
must(!!colStb, '② ⭐ existe a coluna do super tie-break');
const larguraStb = parseFloat(String(colStb.w || '').replace(/[^0-9.]/g, ''));
const colSet = (plano.columns || []).filter((c) => c.kind !== 'stb')[0];
const larguraSet = parseFloat(String(colSet.w || '').replace(/[^0-9.]/g, ''));
must(larguraStb > larguraSet,
  '② ⭐ a coluna do STB é MAIS LARGA que a de um set comum (' + larguraStb + ' vs ' + larguraSet + ')');

// e com 22-20 ela cresce sozinha, sem número cravado em lugar nenhum
const planoLongo = W._matchSetPlan(sc, { sets: [{ gamesP1: 6, gamesP2: 4 }, { gamesP1: 3, gamesP2: 6 },
  { gamesP1: 22, gamesP2: 20, superTiebreak: true }] }, {});
const colLonga = (planoLongo.columns || []).filter((c) => c.kind === 'stb')[0];
const larguraLonga = parseFloat(String(colLonga.w || '').replace(/[^0-9.]/g, ''));
must(larguraLonga >= larguraStb,
  '② e um 22-20 não aperta a coluna (' + larguraLonga + ' ≥ ' + larguraStb + ')');

// ── ③ a coluna alinha à DIREITA ────────────────────────────────────────────
/* Ordem do dono (13/set/2026): _"os placares parecem alinhados nas colunas pela esquerda;
 * faça o alinhamento na direita de cada coluna de placares"_. Centralizar só parece certo
 * quando os dois lados têm o mesmo número de algarismos — num 7 sobre 10, o 7 cai sobre o 1. */
const CSS = fs.readFileSync(path.join(raiz, 'css/components.css'), 'utf8');
must(/\.sp-set-col\{[^}]*text-align:right;\}/.test(CSS),
  '③ ⭐ a coluna do placar alinha à DIREITA — a unidade fica sob a unidade');
must(!/\.sp-set-col\{[^}]*text-align:center;\}/.test(CSS),
  '③ ⛔ e não sobrou o centralizado, que desalinha quando um lado tem dois algarismos');

console.log('\n✅ STB aparece para quem lançou e a coluna cabe — ' + ok + ' verificações');
