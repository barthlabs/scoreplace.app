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

  // ⚠️ ÂNCORA REVISADA (v1.7.72): o recorte começava em `var LIVE_NUM_1`, que SAIU do
  // render e foi pro TOPO do arquivo — o par precisava ser visível também pelo diálogo
  // de empate, que roda em outro escopo (usá-lo de lá dava `ReferenceError` e TRAVAVA a
  // partida). Com a declaração no topo, o recorte varria o arquivo quase inteiro e
  // acusava cores de outras telas. O invariante NÃO mudou — "no bloco do placar nenhuma
  // cor de número é solta" —, só o marco de início: agora `_lsNumClr`, o resolvedor de
  // cor do placar, que é o começo real do bloco (recorte de ~10k chars). Âncoras mais
  // acima varriam metade do arquivo e acusavam cores de OUTRAS telas — o vermelho do
  // botão "Encerrar" da tela de fim de partida, por exemplo, que não é cor de número.
  const semNumeros = src.slice(src.indexOf('var _lsNumClr = function'), src.indexOf('window._fitLivePlateText'));
  ok(!/#60A5FA|#F87171|#123A9E|#9B1414/i.test(semNumeros),
     'nenhuma cor de número solta sobrou no bloco do placar — todas saem do par');
  // ⚠️ ASSERÇÃO REVISADA DE PROPÓSITO (v1.7.59, limpeza dos órfãos do redesenho)
  // Ela contava 2+ ocorrências de `leftTeam === 1 ? LIVE_NUM_1 : LIVE_NUM_2` — uma no
  // SETS do retrato (`_setsLine`) e outra no SETS do cabeçalho da paisagem. As duas
  // eram CÓPIAS da mesma decisão, e as duas morreram no redesenho da v1.7.58: o SETS
  // deixou de ser pílula solta e passou a viver dentro da placa de games da caixa do
  // time. Contar cópias virou impossível porque não sobrou cópia nenhuma.
  // O que a asserção protegia — a cor do número sai do par canônico NAS DUAS
  // ORIENTAÇÕES — segue travado, e mais forte: existe UM resolvedor (`_lsNumClr`) e UM
  // construtor (`_lsTeamBox`), chamado nos dois ramos. Duas cópias não divergem quando
  // não há duas cópias.
  ok(/_lsNumClr = function\([^)]*\) \{ return \w+ === 1 \? LIVE_NUM_1 : LIVE_NUM_2/.test(src),
     'a cor do número tem UM resolvedor, e ele sai do par canônico');
  ok(/var c = _lsNumClr\(team\)/.test(src),
     'e é ele que pinta games, sets e ponto dentro da caixa do time');
  ok((src.match(/_lsTeamBox\(/g) || []).length >= 5,
     'o MESMO construtor serve em pé E deitado (1 declaração + 2 chamadas em cada ramo)');
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

// ⚠️ BLOCO REVISADO DE PROPÓSITO (v1.7.59, limpeza dos órfãos do redesenho)
// As quatro asserções liam `_gBig`/`_gDash` — dois clamps CSS cravados à mão, um por
// orientação — e o clamp do SETS. Os três viviam em `_topBlock`/`_setsLine`/`_lsGames`,
// construtores que o redesenho da v1.7.58 aposentou e que ficaram órfãos no arquivo.
// O redesenho trocou tamanho CRAVADO por tamanho DERIVADO DA ÁREA (cânone de escala por
// área): `_lsSizes(innerW, innerH, k, orient)` calcula tudo a partir do espaço real da
// caixa. Cada asserção antiga foi remapeada pro invariante que ela defendia:
//   (a) "GAMES tem tamanho por orientação"      → o parâmetro `orient`
//   (b) "retrato subiu de 14.4vw"               → o corpo cresce até o teto de largura
//   (c) "paisagem intacta, lógica é outra"      → banda fixa de 40% só no 'land'
//   (d) "e o SETS acompanhou"                   → setPx sai de gamePx, não de um 2º clamp
console.log('\n── GAMES/SETS: tamanho derivado da ÁREA, por orientação ──');
{
  const sz = src.slice(src.indexOf('function _lsSizes('), src.indexOf('var _lsTint'));
  ok(sz.length > 200, 'existe UM cálculo de tamanhos do placar');
  ok(/function _lsSizes\(innerW, innerH, k, orient\)/.test(sz),
     '(a) o tamanho é função da ÁREA disponível + orientação — nada de px cravado');
  ok(/orient === 'land' \? Math\.round\(innerH \* 0\.40\) : 0/.test(sz),
     '(c) só o deitado reserva banda fixa — lá a altura é escassa e a lógica é outra');
  ok(/while \(gamePx < 2000 && cabe\(gamePx \+ 1\)\) gamePx\+\+/.test(sz),
     '(b) o GAMES cresce até o maior corpo que ainda cabe');
  ok(/var gamesH = Math\.round\(_lsInk\('0', gamePx\) \/ 0\.90\)/.test(sz),
     'e a placa ABRAÇA o número (90% de tinta) — era esse o desperdício que o dono cobrou');
  ok(/var setPx = Math\.round\(gamePx \* 0\.33\)/.test(sz),
     '(d) o SETS acompanha o GAMES por construção, não por um segundo clamp');
}

// ⚠️ BLOCO REVISADO DE PROPÓSITO (v1.7.59, limpeza dos órfãos do redesenho)
// As duas asserções liam `_liveAvatarHtml(pn, 38)` e o clamp `0.86rem/3.5vw/1.12rem`,
// os dois dentro de `_buildNameStack` — construtor aposentado pela v1.7.58 e órfão no
// arquivo desde então. Eram dois números mágicos calibrados pra casar no 390px; o que o
// dono pediu era a RELAÇÃO ("a foto acompanha a fonte, senão o nome cresce e o ícone
// fica um botão perdido do lado"). Agora a relação é estrutural — o avatar é uma fração
// do corpo do nome, calculada no mesmo ponto —, então não há dois números pra sair de
// sincronia. Também trava a regra que a v1.6.88 pagou caro pra descobrir: o nome CEDE
// FONTE antes de truncar.
console.log('\n── nome e foto: uma medida só, proporcional ──');
{
  const sz = src.slice(src.indexOf('function _lsSizes('), src.indexOf('var _lsTint'));
  ok(/av = Math\.round\(fs \* 0\.85\)/.test(sz),
     'a foto é uma FRAÇÃO do corpo do nome — proporcional por construção');
  ok(/_liveAvatarHtml\(pn, av\)/.test(src),
     'e é esse valor calculado que chega no avatar');
  ok(!/_liveAvatarHtml\(pn, \d/.test(src),
     'nenhum tamanho de foto cravado sobrou no placar ao vivo');
  // ⚠️ ASSERÇÃO REVISADA DE PROPÓSITO (v1.7.72). Ela travava o texto EXATO do laço
  // (`var f = sz.fs; while (...) f--;`). O laço ganhou uma primeira metade — o nome
  // agora CRESCE até encher a largura livre, porque desde a v1.7.72 ele mostra só o
  // primeiro nome e sobrava espaço à toa — e passou a medir `pnCurto`, que é o rótulo
  // realmente desenhado. O INVARIANTE que ela defende é o mesmo e segue travado: o
  // nome cede fonte até caber, nunca trunca. Por isso o teste agora exige o `f--`
  // medindo o texto que vai pra tela, não uma linha literal que envelhece.
  ok(/while \(f > 10 && _lsW\(pnCurto, f, 700\) > util\) f--;/.test(src),
     'e o nome CEDE FONTE até caber em vez de truncar (a regra que salva "Kelly Barth")');
  ok(/while \(f < fTeto && _lsW\(pnCurto, f \+ 1, 700\) <= util\) f\+\+;/.test(src),
     'e CRESCE até encher a largura livre — com só o primeiro nome, sobrava espaço');
}

console.log((fail ? '✗' : '✓') + ' live-score-retrato: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
