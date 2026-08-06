/* Placar ao vivo em RETRATO: uma paleta só, placa que abraça o número, tudo pra cima
 * node tests/live-score-retrato.test.js
 *
 * Pedidos do dono (03/ago/2026), com print do iPhone em pé:
 *   "vejo um grande desperdício de espaço branco nas placas… vamos diminuir as placas
 *    para dar mais espaço para aumentar os games e sets proporcionalmente"
 *   "as cores dos games e sets deveriam ser as mesmas do placar, tanto em pé como deitado"
 *   "tem algum tom de azul e vermelho que dê a mesma leitura no fundo gelo e no escuro?"
 *   "a placa em pé pode ser menor MANTENDO o tamanho dos números"
 *   "pode subir tudo para as placas ficarem no meio da tela"
 */
const path = require('path'), fs = require('fs');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket-ui.js'), 'utf8');

// contraste WCAG — a mesma conta que escolheu o par
function lum(h) {
  h = h.replace('#', '');
  const f = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const [r, g, b] = [0, 2, 4].map(i => f(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

console.log('\n── uma paleta só, e ela LÊ nos dois fundos ──');
{
  const m = src.match(/var LIVE_NUM_1 = '(#[0-9A-Fa-f]{6})', LIVE_NUM_2 = '(#[0-9A-Fa-f]{6})'/);
  ok(!!m, 'existe UM par canônico de cores de número');
  const [, azul, verm] = m || [];
  const ICE = '#EAF0F6', DARK = '#0a0e1a';
  ok(cr(azul, ICE) >= 3 && cr(azul, DARK) >= 3,
     'azul ' + azul + ' passa nos dois: gelo ' + cr(azul, ICE).toFixed(2) + ':1 · escuro ' + cr(azul, DARK).toFixed(2) + ':1');
  ok(cr(verm, ICE) >= 3 && cr(verm, DARK) >= 3,
     'vermelho ' + verm + ' idem: ' + cr(verm, ICE).toFixed(2) + ':1 · ' + cr(verm, DARK).toFixed(2) + ':1');
  // a razão de existir o par: nenhuma das cores antigas servia dos dois lados
  ok(cr('#123A9E', DARK) < 3, 'o azul antigo da placa NÃO servia no fundo escuro (era por isso que havia 2 paletas)');
  ok(cr('#60a5fa', ICE) < 3, 'e o azul antigo do GAMES não servia sobre o gelo');

  const semNumeros = src.slice(src.indexOf('var LIVE_NUM_1'), src.indexOf('window._fitLivePlateText'));
  ok(!/#60A5FA|#F87171|#123A9E|#9B1414/i.test(semNumeros),
     'nenhuma cor de número solta sobrou no bloco do placar — todas saem do par');
  ok((src.match(/leftTeam === 1 \? LIVE_NUM_1 : LIVE_NUM_2/g) || []).length >= 2,
     'SETS usa o par em pé E deitado (o pedido era "tanto em pé como deitado")');
}

console.log('\n── a placa abraça o número; o número NÃO muda de tamanho ──');
{
  const fit = src.slice(src.indexOf('var baseFs = 0.96 * minW'), src.indexOf('halves.forEach(function(h) {', src.indexOf('var baseFs = 0.96 * minW')));
  ok(/var baseFs = 0\.96 \* minW/.test(fit), 'o tamanho do número continua saindo da LARGURA da metade');
  ok(/if \(_retrato\) \{/.test(fit), 'em retrato há um caminho próprio');
  ok(/_row\.style\.height = Math\.round\(_alvo\)/.test(fit),
     'e é a ALTURA DA PLACA que passa a ser calculada — não o número');
  // o `fs = minH…` que sobra é do ramo `else` (paisagem). O que importa é que ele NÃO
  // esteja no ramo do retrato: lá a placa é que segue o número, nunca o contrário.
  const ramoRetrato = fit.slice(fit.indexOf('if (_retrato) {'), fit.indexOf('} else if'));
  ok(!/fs = /.test(ramoRetrato),
     'o ramo do retrato não toca no fs — a placa é que segue o número, não o contrário');
  ok(/\} else if \(minH !== Infinity && fs \* SY > minH \* 0\.96\)/.test(fit),
     'e em paisagem a altura continua limitando o número, como antes');
  const alvo = fit.match(/var _alvo = Math\.min\(fs \* SY \* ([\d.]+), window\.innerHeight \* ([\d.]+)\)/);
  ok(!!alvo, 'a altura da placa é número + folga, com teto na tela');
  ok(alvo && parseFloat(alvo[1]) > 1, 'a folga é > 1 (a placa não fica colada no número): ' + (alvo && alvo[1]));
  ok(alvo && parseFloat(alvo[2]) <= 0.5, 'e o teto impede a placa de engolir nomes/GAMES: ' + (alvo && alvo[2]) + ' da tela');
}

// ⚠️ ASSERÇÕES REVISADAS DE PROPÓSITO (06/ago/2026, redesenho homologado)
// Duas asserções daqui defendiam o arranjo antigo do retrato: `#ls-plates-row`
// com `flex:0 0 auto` e um ESPAÇADOR depois das placas, que era como a folga ia
// pra baixo ("tudo sobe, a placa fica no meio"). Esse arranjo deixou de existir:
// agora cada dupla é uma CAIXA de METADE DA TELA e as duas somam a altura útil,
// então NÃO HÁ folga sobrando pra posicionar — o espaçador seria zona morta, que
// é justamente o que o dono mandou eliminar.
// O que aquelas asserções protegiam de verdade — a placa não estica e o conjunto
// não fica espremido contra o Desfazer — continua travado, agora pelo invariante
// novo: as caixas dividem a tela e não existe espaçador nenhum no retrato.
console.log('\n── redesenho: caixas de metade da tela, sem espaçador ──');
{
  const port = src.slice(src.indexOf('// ── EM PÉ (redesenho'), src.indexOf('_setupCourtSwapDrag', src.indexOf('// ── EM PÉ (redesenho')));
  ok(/_pBoxH\s*=\s*Math\.floor\(\(_pAvail - _pGap\) \/ 2\)/.test(port), 'cada caixa é METADE da altura útil');
  ok(/_lsTeamBox\(_pTop[\s\S]*_lsTeamBox\(_pBot/.test(port), 'as duas caixas são construídas pelo MESMO builder');
  ok(!/flex:1;min-height:0;"><\/div>/.test(port), 'não existe espaçador: a folga não vira zona morta');
  ok(/serverInfo && serverInfo\.team === rightTeam/.test(port), 'o SACADOR fica em cima');
  ok(!/flex:1;min-height:0;'\s*\)\s*\+\s*\n\s*'display:flex;flex-direction:column;align-items:center;justify-content:center;'/.test(src),
     'o bloco SETS/GAMES voltou a ter altura de conteúdo (não estica mais)');
}

console.log('\n── GAMES e SETS cresceram, e a paisagem não foi mexida ──');
{
  const g = src.match(/var _gBig\s*=\s*isLandscape \? '([^']+)' : '([^']+)'/);
  ok(!!g, 'GAMES tem tamanho por orientação');
  ok(g && g[1] === 'clamp(2rem,7vh,3.4rem)', 'paisagem intacta — lá a altura é escassa e a lógica é outra');
  const vw = g && g[2].match(/(\d+(?:\.\d+)?)vw/);
  ok(vw && parseFloat(vw[1]) > 14.4, 'retrato subiu de 14.4vw para ' + (vw && vw[1]) + 'vw');
  ok(/clamp\(2rem,9vw,3\.4rem\)/.test(src), 'e o SETS acompanhou');
}

console.log('\n── nomes maiores, foto proporcional ──');
{
  ok(/_liveAvatarHtml\(pn, 38\)/.test(src), 'a foto cresce junto com o nome (30 → 38px)');
  ok(/clamp\(0\.86rem,3\.5vw,1\.12rem\)/.test(src), 'e o nome vai a 3.5vw');
}

console.log((fail ? '✗' : '✓') + ' live-score-retrato: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
