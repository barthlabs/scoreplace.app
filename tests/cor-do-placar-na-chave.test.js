/* A COR DO PLACAR NA CHAVE — regra ditada pelo dono em 21/ago/2026, na letra:
 *
 *   _"num jogo sem resultado é tudo cinza; com resultado é tarja verde e numero
 *   verde para o vencedor e tarja cinza com numero vermelho pro perdedor.
 *   enquanto o resultado for pendente a tarja é ambar para ambos com numero
 *   verde (V) e vermelho (D)."_
 *
 *   sem resultado ....... TUDO CINZA (tarja e número)
 *   com resultado ....... vencedor: tarja VERDE  + número VERDE
 *                         perdedor: tarja CINZA  + número VERMELHO
 *   pendente ............ tarja ÂMBAR nos DOIS lados
 *                         número VERDE no V e VERMELHO no D
 *
 * ⛔ A TARJA RESPONDE UMA PERGUNTA SÓ: "isto já está confirmado?" — verde
 * confirmado, âmbar proposto, cinza sem resultado. Quem ganhou e quem perdeu quem
 * diz é o NÚMERO. O defeito que gerou a ordem foi as duas perguntas dividirem a
 * mesma cor: num jogo SEM placar a tarja saía verde em cima e vermelha embaixo —
 * por POSIÇÃO —, e aí o verde significava duas coisas na mesma tela. Pergunta do
 * dono, olhando a chave: "por que os vencedores não estão todos verdes?".
 *
 * As cores, uma vez: verde #10b981/#4ade80 · vermelho #f87171 · âmbar #fbbf24.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── a cor do placar na chave ────');

// ── a TARJA (rowStyle) ─────────────────────────────────────────────────────
const iRow = src.indexOf('const rowStyle = (isWinner, side) =>');
ok(iRow > 0, 'rowStyle existe');
const row = src.slice(iRow, src.indexOf('\n  };', iRow));

ok(/if \(isWinner\) return base \+ '[^']*border-left:3px solid #10b981;'/.test(row),
   'VENCEDOR: tarja verde');
ok(/if \(isDecided\) return base \+ '[^']*border-left:3px solid rgba\(255,255,255,0\.18\);'/.test(row),
   'PERDEDOR (jogo decidido): tarja CINZA — nunca vermelha');
ok(/if \(hasPending\) return base \+ '[^']*border-left:3px solid #fbbf24;'/.test(row),
   'PENDENTE: tarja âmbar — e a MESMA pros dois lados (uma linha só, sem ramo por lado)');
ok(!/_isPropWin/.test(row),
   '⛔ o pendente não distingue mais lado na TARJA: quem diz V/D ali é o número');
ok(/return base \+ 'background:rgba\(0,0,0,0\.25\);border-left:3px solid rgba\(255,255,255,0\.14\);'/.test(row),
   'SEM RESULTADO: tarja cinza nos dois lados');
ok(!/rgba\(16,185,129,0\.4\)/.test(row) && !/rgba\(239,68,68,0\.4\)/.test(row),
   '⛔ o verde/vermelho POR POSIÇÃO (p1/p2) não existe mais — era ele que fazia o verde mentir');
ok(!/opacity:0\.55/.test(row),
   '⛔ o perdedor não é mais apagado a 55% — a 55% o vermelho do número fica lavado');

// ── o NÚMERO ───────────────────────────────────────────────────────────────
const iNum = src.indexOf('var _corDoNumero');
ok(iNum > 0, 'a cor do número é decidida num lugar só');
const num = src.slice(iNum, src.indexOf(';', src.indexOf("'var(--text-muted)'", iNum)));
ok(/isWinner \? '#4ade80'/.test(num), 'VENCEDOR: número verde');
ok(/isDecided \? '#f87171'/.test(num), 'PERDEDOR: número vermelho');
ok(/val === 0 \? 'rgba\(255,255,255,0\.3\)' : 'var\(--text-muted\)'/.test(num),
   'SEM RESULTADO: número cinza (o zero de "não lançado" fica ainda mais apagado)');

// ── o número no PENDENTE ───────────────────────────────────────────────────
const iPend = src.indexOf('const _scorePendingStyle');
ok(iPend > 0, 'o estilo do número pendente existe');
const pend = src.slice(iPend, src.indexOf('};', iPend));
ok(/isWin \? '#4ade80' : '#f87171'/.test(pend),
   'PENDENTE: número VERDE no V e VERMELHO no D — já dá pra ler quem ganhou');
ok(!/#fbbf24/.test(pend) && !/rgba\(251,191,36/.test(pend),
   '⛔ o número pendente não é mais âmbar dos dois lados (ninguém sabia quem tinha ganho)');
ok(/font-style:italic/.test(pend),
   'e o itálico fica: junto com a tarja âmbar, é o que marca "ainda não confirmado"');

console.log(`\n  ${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
