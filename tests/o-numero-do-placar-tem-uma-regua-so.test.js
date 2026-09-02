/* O NÚMERO DO PLACAR TEM UMA RÉGUA SÓ — EM 1 SET, MELHOR DE 3 E MELHOR DE 5 (leva 2.1.101)
 *
 * Relato do dono (02/set/2026): _"havíamos aumentado os números do placar na rodada
 * passada. isso deve ser canônico e vejo que voltou a ficar pequeno (número e campo).
 * tínhamos fechado 1 set / melhor de 3 / melhor de 5 tudo de forma canônica. regressão
 * clara aqui."_
 *
 * ⛔ O QUE ELE VIU NÃO ERA IMPRESSÃO, E NÃO ERA REGRESSÃO NOVA: o cânone da 2.0.47
 * (_"aumente esse box e o 0 dentro dele para ficar no tamanho do número com resultado
 * lançado, em todos os cards de jogos, em qualquer fase"_) tinha sido aplicado SÓ no
 * caminho de UM SET — `.sp-mc-num`/`.sp-mc-inp`, que leem `--sp-num-fs` (1,45rem). O
 * caminho de SETS (melhor de 3/5) tinha três tamanhos independentes:
 *     · o número lançado    → `--sp-num-fs-set`, da escada `_SET_COL_ESCALA`
 *     · o "0" pendente      → 1rem CRAVADO
 *     · o campo de digitar  → 0,9rem CRAVADO
 * A Fase 1 do torneio dele era 1 set; a Fase 2 é melhor de 3. Avançar de fase fez o número
 * cair de 1,45rem para 1,00rem — daí "voltou a ficar pequeno".
 *
 * ⚠️ O QUE ESTE TESTE GUARDA, e por que ele não é sobre um número bonito:
 *   ① os três (número, box pendente e campo) leem UMA régua — três literais soltos foi
 *     exatamente o que produziu o defeito;
 *   ② a escada continua CABENDO: o limite é dois dígitos (o tie-break passa de 9) dentro
 *     da largura da coluna, que NÃO muda — a largura é o que divide espaço com o nome.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── o número do placar tem uma régua só ────');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'css', 'components.css'), 'utf8');
const model = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-model.js'), 'utf8');

/* ── ① UMA RÉGUA: ninguém cravado ─────────────────────────────────────────── */
const regra = (sel) => {
  const i = css.indexOf(sel + '{');
  return i === -1 ? '' : css.slice(i, css.indexOf('}', i));
};
const num = regra('.sp-set-num'), zero = regra('.sp-set-zero'), inp = regra('.sp-set-inp');
ok(/font-size:var\(--sp-num-fs-set/.test(num), '① o NÚMERO lançado lê a régua');
ok(/font-size:var\(--sp-num-fs-set/.test(zero),
   '① ⭐ o "0" PENDENTE lê a régua — era 1rem cravado, menor que o número ao lado dele');
ok(/font-size:var\(--sp-num-fs-set/.test(inp),
   '① ⭐ o CAMPO de digitar lê a régua — era 0,9rem cravado');
ok(/font-size:var\(--sp-num-fs/.test(regra('.sp-mc-num')) && /font-size:var\(--sp-num-fs/.test(regra('.sp-mc-inp')),
   '① e o caminho de UM SET segue lendo a régua dele (`--sp-num-fs`)');

/* ── ② a escada: quem decide o degrau, e se ele cabe ──────────────────────── */
const W = { window: null };
W.window = W;
vm.createContext(W);
const iEsc = model.indexOf('window._SET_COL_ESCALA = [');
vm.runInContext(model.slice(iEsc, model.indexOf('];', iEsc) + 2), W, { filename: 'escala' });
const iFn = model.indexOf('window._setColEscala = function');
vm.runInContext(model.slice(iFn, model.indexOf('\n  };', iFn) + 4), W, { filename: 'setColEscala' });

const E = W._SET_COL_ESCALA;
ok(E.length === 3, '② a escada tem os três degraus (1 set/2 · melhor de 3 · melhor de 5)');

/* Régua de referência do próprio CSS: "dois dígitos a 1,45rem ≈ 36px" → ~12,4px por
 * dígito por rem. O número tem de caber DOIS dígitos dentro da coluna. */
const PX_POR_DIGITO_POR_REM = 36 / 2 / 1.45;
E.forEach(function (d, i) {
  const largura2Digitos = 2 * PX_POR_DIGITO_POR_REM * d.fs;
  ok(largura2Digitos <= d.set + 0.5,
     '② ⭐ degrau ' + (i + 1) + ' (até ' + d.ate + ' colunas): 2 dígitos a ' + d.fs +
     'rem ≈ ' + largura2Digitos.toFixed(1) + 'px cabem na coluna de ' + d.set + 'px');
});

/* ── ③ o degrau sai do FORMATO e cresce quando há menos colunas ───────────── */
ok(W._setColEscala(1).fs === W._setColEscala(2).fs, '③ 1 e 2 colunas usam o mesmo degrau');
ok(W._setColEscala(3).fs < W._setColEscala(2).fs, '③ melhor de 3 é menor que 1-2 colunas');
ok(W._setColEscala(5).fs < W._setColEscala(3).fs, '③ e melhor de 5 é o mais apertado');
ok(W._setColEscala(9).fs === W._setColEscala(5).fs, '③ acima de 5 não encolhe mais (não há degrau)');

/* ── ④ ⛔ A LARGURA DA COLUNA NÃO SE MEXE SEM DECISÃO ────────────────────────
 * É ela que divide espaço com a caixa do nome. Subir a FONTE é de graça; alargar a
 * COLUNA é tirar do nome — e o cânone da caixa invisível diz que nome não é cortado. */
ok(E[0].set === 35 && E[1].set === 31 && E[2].set === 25,
   '④ ⭐ as larguras seguem 35/31/25px — mexer nelas é roubar do nome, e isso é decisão do dono');
ok(E.every(function (d) { return d.stb > d.set; }),
   '④ a coluna do super tie-break é mais larga (o número passa de 9)');

console.log(fail ? ('  ' + fail + ' FALHA(S), ' + pass + ' ok') : ('  ✓ ' + pass + ' asserções'));
process.exit(fail ? 1 : 0);
