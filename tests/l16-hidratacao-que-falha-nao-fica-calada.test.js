'use strict';
/* ⛔ "BEST-EFFORT" NÃO AUTORIZA SILÊNCIO NUMA TRANSAÇÃO DE SORTEIO.
 * L16.P0 inventariou `_hydrateMonarchGroups` chamada em OITO pontos de
 * functions-autodraw/index.js, TODOS engolindo a exceção — cinco rotulados "best-effort" e
 * três com `catch (e) {}` seco. O rótulo era otimista: a função religa `group.matches` como
 * REFERÊNCIA ao plano e MIGRA documento legado, fundindo placar que só existe na cópia do
 * grupo (js/views/bracket-model.js:474). Falhar no meio, dentro da transação, grava grupo sem
 * jogo religado — calado.
 * ⛔ Esta leva NÃO aborta sorteio: interromper é decisão de produto. Ela acaba com o silêncio.
 *
 * ③ A CHECAGEM DE ESCOPO EXISTE PORQUE EU ERREI AQUI. Ao trocar os oito pontos passei `tId`
 * também em `_formarGruposDaEspera`, que NÃO tem `tId` — ali o id vem de `doc.id`. Seria
 * ReferenceError dentro da transação, e `node --check` passa: ele vê sintaxe, não escopo.
 * [[feedback_declaracao_depois_do_uso_derruba_calado]]
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const A = fs.readFileSync(path.join(__dirname, '..', 'functions-autodraw/index.js'), 'utf8');
const linhas = A.split('\n');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

// ── ① a porta é uma só, e ela registra ──────────────────────────────────────
must(/function _hidrataGrupos\(t, onde, tId\) \{/.test(A), '① existe a porta única de hidratação');
const ini = A.indexOf('function _hidrataGrupos');
const porta = A.slice(ini, A.indexOf('\n}', ini));
must(/console\.error\('\[hidratacao\] FALHOU em ' \+ onde/.test(porta),
  '① a falha vai para o log de ERRO dizendo ONDE');
must(/torneio ' \+ \(tId \|\| \(t && t\.id\)/.test(porta), '① e com QUAL torneio');
must(/return false;/.test(porta) && /return true;/.test(porta),
  '① a porta devolve se hidratou — quem quiser decidir sobre isso já tem o sinal');
must(!/throw/.test(porta),
  '① ⛔ e NÃO propaga: abortar sorteio é decisão do dono, não de uma leva de observabilidade');

// ── ② nenhuma chamada crua sobrou ───────────────────────────────────────────
const crus = linhas.filter((l) => /drawWindow\._hydrateMonarchGroups\(/.test(l) && l.indexOf('function _hidrataGrupos') === -1);
const forapor = crus.filter((l, i) => !/_hidrataGrupos/.test(l) && A.indexOf(l) < ini || A.indexOf(l) > A.indexOf('\n}', ini));
must(forapor.length === 0,
  '② ⛔ nenhuma chamada crua a _hydrateMonarchGroups fora da porta (achei ' + forapor.length + ')');
const chamadas = [];
linhas.forEach((l, i) => { const m = /_hidrataGrupos\(t, '([^']+)', ([A-Za-z_$][\w$.]*)\)/.exec(l); if (m) chamadas.push({ n: i + 1, onde: m[1], id: m[2] }); });
must(chamadas.length === 8, '② os oito pontos passam pela porta (achei ' + chamadas.length + ')');
must(chamadas.every((c) => !/^linha \d+$/.test(c.onde)),
  '② ⛔ nenhum ponto se identifica por NÚMERO DE LINHA — número envelhece no primeiro patch');
must(new Set(chamadas.map((c) => c.onde)).size === 8, '② e cada um tem nome próprio, sem repetido');

// ── ③ o identificador do torneio EXISTE no escopo de cada chamada ───────────
function escopoDe(nLinha) {
  for (let i = nLinha - 1; i >= 0; i--) {
    const l = linhas[i];
    if (/^(async )?function [A-Za-z_$]/.test(l) || /^exports\.[A-Za-z0-9_]+ = /.test(l) || /^const [A-Za-z_$][\w$]* = (async )?\(/.test(l)) return i;
  }
  return 0;
}
chamadas.forEach((c) => {
  const ini2 = escopoDe(c.n);
  const corpo = linhas.slice(ini2, c.n - 1).join('\n');
  const raiz = c.id.split('.')[0];
  const declarado = new RegExp('(const|let|var)\\s+' + raiz + '\\b').test(corpo)
    || new RegExp('function\\s+\\w*\\s*\\([^)]*\\b' + raiz + '\\b').test(linhas[ini2])
    || new RegExp('\\([^)]*\\b' + raiz + '\\b[^)]*\\)\\s*=>').test(linhas[ini2]);
  must(declarado, '③ `' + c.id + '` existe no escopo de ' + c.onde + ' (linha ' + c.n + ')');
});

console.log('\n✅ hidratação que falha não fica calada — ' + ok + ' verificações');
