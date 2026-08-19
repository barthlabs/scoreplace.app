/* FORMAÇÃO DE TIMES NA PARTIDA CASUAL — O LADO É DECIDIDO UMA VEZ, POR IDENTIDADE
 * node tests/formacao-de-duplas-casual.test.js
 *
 * Fecha as fragilidades que sobraram depois da 1.9.57 (que unificou "duplas
 * formadas" em `_duplasFormadas`). O invariante guardado aqui é UM:
 *
 *   QUEM JOGA DE QUE LADO É DECIDIDO UMA VEZ, NA MONTAGEM, POR IDENTIDADE (uid) —
 *   nunca por posição de caixa, nunca refazendo a conta a partir de texto, e nunca
 *   por palpite quando a identidade é ambígua.
 *
 * ⚠️ POR QUE ISTO É CÓDIGO PERIGOSO: `state.winner` vale 1 ou 2 — um LADO, não uma
 * lista de pessoas. Trocar o lado de alguém depois que o placar começou, ou trocá-lo
 * em UM aparelho só, credita a vitória à dupla errada em silêncio. Por isso a âncora
 * roda na montagem (antes de o `players[]` ir pro Firestore) e o resultado é o mesmo
 * pra todos os aparelhos — não no desenho de cada tela.
 *
 * O QUE ESTAVA QUEBRADO NA 1.9.61 PUBLICADA (medido, não deduzido):
 *
 *  🔴 A ÂNCORA NUNCA RODOU — NEM UMA VEZ, DESDE QUE FOI CRIADA. `_ancorarUsuario`
 *     lê `_coachMode`, mas a única `var _coachMode` do arquivo mora em
 *     `_openCasualMatch`, que é escopo IRMÃO de `_openLiveScoring`. Toda chamada
 *     resultava em `ReferenceError: _coachMode is not defined`. Os dois chamadores
 *     são handlers de onclick sem try/catch (o "Jogo N" do Rei/Rainha e o "Jogar
 *     novamente" multiplayer), então o erro subia e o botão não fazia nada. Entrou
 *     na 1.8.77 — o MESMO commit que introduziu a âncora, e cujo título dizia que o
 *     3º jogo do Rei/Rainha voltava a existir.
 *     A suíte anterior ficava VERDE porque o harness dela declarava `_coachMode` por
 *     conta própria: teste verde sobre código que nunca executou.
 *
 *  🔴 A ÂNCORA NÃO EXISTIA NA MONTAGEM. Só o RE-SORTEIO a chamava. Duplas formadas
 *     arrastando iam direto de `_teamAssignments` pro placar: a 1ª partida usava uma
 *     regra e as seguintes usavam outra, e o lado do usuário invertia entre jogos.
 *
 *  🔴 IDENTIDADE RECONSTRUÍDA FATIANDO TEXTO. `p1Players` saía de quebrar
 *     "Kelly / Rodrigo" no "/" — um nome com barra vira 3 jogadores, e o roster que
 *     já tinha `team` + `uid` era ignorado.
 *
 * Ver [[project_usuario_sempre_time_azul]] e [[project_rei_rainha_concept]].
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BUI = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8');
const STORE = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');

let falhas = 0;
const ok = (c, m) => { if (c) { console.log('  ✓ ' + m); } else { falhas++; console.log('  ✗ ' + m); } };
console.log('\nFORMAÇÃO DE DUPLAS NA PARTIDA CASUAL');

// Cada bloco é isolado: contra uma versão que ainda não tem a função, a seção conta
// como falha e a suíte SEGUE — senão o controle pararia no primeiro sumiço e
// esconderia o tamanho real da regressão.
function secao(titulo, fn) {
  try { fn(); }
  catch (e) { falhas++; console.log('  ✗ [' + titulo + '] ' + e.message); }
}

// ── utilitários de extração ────────────────────────────────────────────────
function corpoDe(marcador, fim) {
  const i = BUI.indexOf(marcador);
  if (i < 0) throw new Error('não achei: ' + marcador);
  const j = BUI.indexOf(fim, i);
  if (j < 0) throw new Error('não achei o fim de: ' + marcador);
  return BUI.slice(i, j);
}
function extraiFn(src, nome) {
  const i = src.indexOf('function ' + nome + '(');
  if (i < 0) throw new Error('não achei a função ' + nome);
  let d = 0, k = src.indexOf('{', i);
  for (; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) { k++; break; } }
  }
  return src.slice(i, k);
}

// O CORPO REAL de _openLiveScoring — recortado no fecho de coluna 0, pra que a
// busca por declarações não escorregue pra funções vizinhas (foi exatamente essa
// vizinhança que escondeu o bug: `var _coachMode` existe no arquivo, só que noutro
// escopo).
const OLS = corpoDe('window._openLiveScoring = function(tId, matchId, opts) {', '\n};\n');
const CASUAL_START = corpoDe('window._casualStart = async function', '\n  };\n');

global.window = global.window || {};
eval(STORE.match(/window\._anchorUserFirst = function[\s\S]*?\n};/)[0]);
const anchor = window._anchorUserFirst;

// ═══ 1. A ÂNCORA EXISTE DE VERDADE — não só no texto ═══════════════════════
// Reconstrói o escopo REAL: pega a declaração de `_coachMode` de DENTRO do corpo de
// _openLiveScoring (se houver) e roda `_ancorarUsuario` junto dela. Sem a
// declaração, o eval reproduz o ReferenceError de produção.
secao('âncora existe', function () {
  const declCoach = (OLS.match(/^ {2}var _coachMode = [^\n]*$/m) || [])[0];
  ok(!!declCoach, '`_coachMode` é declarado DENTRO de _openLiveScoring (era o ReferenceError)');

  const ctx = `
    ${declCoach || ''}
    var _playerMeta = ${JSON.stringify({ Rodrigo: { uid: 'u1' }, Kelly: { uid: 'u2' }, Nelson: { uid: 'u3' }, Ana: { uid: 'u4' } })};
    var _nomesAmbiguos = {};
    ${extraiFn(OLS, '_ancorarUsuario')}
    return _ancorarUsuario(t1, t2);
  `;
  const rodar = (t1, t2, opts) => new Function('t1', 't2', 'opts', 'window', ctx)(t1, t2, opts || {}, global.window);

  global.window.AppStore = { currentUser: { uid: 'u1', displayName: 'Rodrigo' } };
  let jogou = null, erro = null;
  try { jogou = rodar(['Kelly', 'Nelson'], ['Rodrigo', 'Ana']); } catch (e) { erro = e; }
  ok(!erro, 'chamar `_ancorarUsuario` no escopo real NÃO lança (1.9.61: ' +
            (erro ? erro.constructor.name + ': ' + erro.message : 'ReferenceError') + ')');
  ok(jogou && jogou.t1 && jogou.t1[0] === 'Rodrigo', 'e o usuário vira o 1º do time azul');
  ok(jogou && jogou.t1.indexOf('Ana') >= 0, 'sem mudar a partição — o parceiro dele continua sendo a Ana');

  // Técnico não joga: a âncora tem que sair de cena.
  let comTecnico = null;
  try { comTecnico = rodar(['Kelly', 'Nelson'], ['Rodrigo', 'Ana'], { coachMode: true }); } catch (e) { comTecnico = null; }
  ok(comTecnico && comTecnico.t1[0] === 'Kelly', 'no modo técnico não ancora (ele não está em campo)');
});

// ═══ 2. HOMÔNIMO: NÃO ANCORAR > ANCORAR A PESSOA ERRADA ════════════════════
secao('homônimo', function () {
  const declCoach = (OLS.match(/^ {2}var _coachMode = [^\n]*$/m) || [])[0] || 'var _coachMode = false;';
  const ctx = `
    ${declCoach}
    var _playerMeta = meta; var _nomesAmbiguos = amb;
    ${extraiFn(OLS, '_ancorarUsuario')}
    return _ancorarUsuario(t1, t2);
  `;
  const rodar = (t1, t2, meta, amb) =>
    new Function('t1', 't2', 'meta', 'amb', 'opts', 'window', ctx)(t1, t2, meta, amb, {}, global.window);

  // Duas "Kelly" na mesma partida; o usuário É uma delas, e o mapa name→uid guardou
  // a OUTRA. Sem o guard, a âncora move a Kelly errada pro slot do usuário.
  global.window.AppStore = { currentUser: { uid: 'kellyA', displayName: 'Kelly' } };
  const metaAmbiguo = { Kelly: { uid: 'kellyB' }, Nelson: { uid: 'u3' }, Ana: { uid: 'u4' } };
  const r = rodar(['Nelson', 'Ana'], ['Kelly', 'Kelly'], metaAmbiguo, { Kelly: true });
  ok(r.t1[0] === 'Nelson' && r.t2[0] === 'Kelly',
     'nome ambíguo e uid não resolve → deixa como veio, não chuta um lado');

  // Mesmo cenário, mas o uid do usuário está gravado sob um nome NÃO ambíguo:
  // aí dá pra identificar e a âncora volta a agir.
  global.window.AppStore = { currentUser: { uid: 'u9', displayName: 'Rodrigo' } };
  const metaOk = { Kelly: { uid: 'kellyB' }, Rodrigo: { uid: 'u9' }, Ana: { uid: 'u4' } };
  const r2 = rodar(['Kelly', 'Kelly'], ['Rodrigo', 'Ana'], metaOk, { Kelly: true });
  ok(r2.t1[0] === 'Rodrigo', 'com o uid identificável, ancora normalmente mesmo havendo homônimo na quadra');
});

// ═══ 3. OS TIMES SAEM DO ROSTER, NÃO DE FATIAR TEXTO ═══════════════════════
secao('roster', function () {
  const ctx = `${extraiFn(OLS, '_timesDoRoster')} return _timesDoRoster();`;
  const rodar = (players) => new Function('opts', ctx)({ players });

  ok(!!BUI.match(/var _roster = _timesDoRoster\(\);/),
     '`p1Players`/`p2Players` passam pelo roster antes de qualquer fatiamento');

  const r = rodar([
    { name: 'Rodrigo', uid: 'u1', team: 1 }, { name: 'Ana', uid: 'u4', team: 1 },
    { name: 'Kelly', uid: 'u2', team: 2 },   { name: 'Nelson', uid: 'u3', team: 2 }
  ]);
  ok(r && r.t1.join() === 'Rodrigo,Ana' && r.t2.join() === 'Kelly,Nelson',
     'roster 2×2 vira os dois times exatamente como gravado');

  // O caso que o fatiamento quebrava: nome COM barra.
  const rBarra = rodar([
    { name: 'Ana C/ Silva', uid: 'u1', team: 1 }, { name: 'Bruno', uid: 'u2', team: 1 },
    { name: 'Kelly', uid: 'u3', team: 2 },        { name: 'Nelson', uid: 'u4', team: 2 }
  ]);
  ok(rBarra && rBarra.t1.length === 2 && rBarra.t1[0] === 'Ana C/ Silva',
     'nome com "/" continua sendo UMA pessoa (o fatiamento fazia dele duas)');

  // Dois nomes iguais: continuam sendo duas entradas, uma em cada lugar.
  const rHom = rodar([
    { name: 'Kelly', uid: 'kA', team: 1 }, { name: 'Kelly', uid: 'kB', team: 1 },
    { name: 'Nelson', uid: 'u3', team: 2 }, { name: 'Ana', uid: 'u4', team: 2 }
  ]);
  ok(rHom && rHom.t1.length === 2, 'dois homônimos no mesmo time seguem sendo duas pessoas');

  // Recusas: é aqui que o roster devolve `null` e o fatiamento assume.
  ok(rodar([{ name: 'A', team: 1 }, { name: 'B', team: 1 }, { name: 'C', team: 2 }]) === null,
     'recusa 2×1 (divisão inválida em duplas)');
  ok(rodar([{ name: 'A', team: 1 }, { name: 'B', team: 1 }, { name: 'C', team: 1 }, { name: 'D', team: 2 }]) === null,
     'recusa 3×1');
  ok(rodar([{ name: 'A', team: 1 }, { name: 'B', team: 1 }, { name: 'C', team: 2 }, { name: 'D' }]) === null,
     'recusa quem está SEM time (o caso do print de 18/ago) em vez de empurrar pro time 2');
  ok(rodar([{ name: 'A', team: 1 }, { name: '', team: 2 }]) === null, 'recusa entrada sem nome');
  ok(rodar([]) === null && rodar(null) === null, 'sem roster (torneio) → fatiamento assume, como antes');
  ok(rodar([{ name: 'A', team: 1 }, { name: 'B', team: 2 }]).t1.join() === 'A', 'simples 1×1 passa');
});

// ═══ 4. O RÓTULO DO LADO SEGUE O LADO ══════════════════════════════════════
// `_saveResult` anuncia o vencedor com `state.winner === 1 ? p1Name : p2Name`.
ok(/if \(_roster\) \{\s*\n\s*p1Name = p1Players\.join\(' \/ '\);/.test(BUI),
   '`p1Name` é re-derivado do roster — senão o vencedor podia ser anunciado pra dupla errada');

// ═══ 5. A ÂNCORA NA MONTAGEM (o item que o dono viu) ═══════════════════════
secao('âncora na montagem', function () {
  ok(/_ancorarTimeAzul\(\);/.test(CASUAL_START), 'a montagem da partida chama a âncora');
  const _iAnc = CASUAL_START.indexOf('_ancorarTimeAzul();');
  const _iN1 = CASUAL_START.indexOf('var n1, n2;');
  ok(_iAnc >= 0 && _iN1 >= 0 && _iAnc < _iN1,
     'e chama ANTES de montar `n1`/`n2` (que são o rótulo do lado)');
  ok(!/Ensure current user is in Team 1/.test(CASUAL_START),
     'a versão paralela que só valia pro sorteio saiu — uma regra só');

  const ctx = `
    ${extraiFn(CASUAL_START, '_ancorarTimeAzul')}
    _ancorarTimeAzul();
    return players;
  `;
  const rodar = (players, opts) => new Function('players', 'isDoubles', '_coachMode', 'window', ctx)(
    players, (opts && opts.isDoubles) !== false, !!(opts && opts.coachMode), global.window);

  global.window.AppStore = { currentUser: { uid: 'u1', displayName: 'Rodrigo' } };

  // Duplas formadas ARRASTANDO com o usuário no vermelho — o caso do relato.
  const arrastado = [
    { name: 'Kelly', uid: 'u2', team: 1, slot: 0 }, { name: 'Nelson', uid: 'u3', team: 1, slot: 1 },
    { name: 'Rodrigo', uid: 'u1', team: 2, slot: 2 }, { name: 'Ana', uid: 'u4', team: 2, slot: 3 }
  ];
  const saida = rodar(arrastado.map(p => Object.assign({}, p)));
  const t1 = saida.filter(p => p.team === 1);
  const t2 = saida.filter(p => p.team === 2);
  ok(t1.some(p => p.uid === 'u1'), 'usuário que formou dupla arrastando termina no time AZUL');
  ok(saida[0].uid === 'u1', 'e no PRIMEIRO slot da lista (é dela que sai `n1` e o doc)');
  ok(t1.map(p => p.uid).sort().join() === 'u1,u4' && t2.map(p => p.uid).sort().join() === 'u2,u3',
     '⚠️ a partição NÃO muda: ele continua com a Ana, contra Kelly e Nelson');
  ok(saida.every(p => typeof p.slot === 'number') &&
     saida.find(p => p.uid === 'u1').slot === 2,
     'o `slot` do setup de cada um sobrevive à reordenação (nome digitado / vínculo leem dele)');

  // Já ancorado: idempotente.
  const jaOk = rodar([
    { name: 'Rodrigo', uid: 'u1', team: 1, slot: 0 }, { name: 'Ana', uid: 'u4', team: 1, slot: 1 },
    { name: 'Kelly', uid: 'u2', team: 2, slot: 2 }, { name: 'Nelson', uid: 'u3', team: 2, slot: 3 }
  ]);
  ok(jaOk[0].uid === 'u1' && jaOk[1].uid === 'u4', 'rodar de novo não desarruma (idempotente)');

  // Usuário só como parceiro (2º do azul) → sobe pro 1º slot, mesma partição.
  const segundo = rodar([
    { name: 'Ana', uid: 'u4', team: 1, slot: 0 }, { name: 'Rodrigo', uid: 'u1', team: 1, slot: 1 },
    { name: 'Kelly', uid: 'u2', team: 2, slot: 2 }, { name: 'Nelson', uid: 'u3', team: 2, slot: 3 }
  ]);
  ok(segundo[0].uid === 'u1' && segundo[1].uid === 'u4', 'parceiro no azul: o usuário assume o 1º slot');

  // Técnico não joga → nada se move.
  const tecnico = rodar([
    { name: 'Kelly', uid: 'u2', team: 1, slot: 0 }, { name: 'Nelson', uid: 'u3', team: 1, slot: 1 },
    { name: 'Rodrigo', uid: 'u1', team: 2, slot: 2 }, { name: 'Ana', uid: 'u4', team: 2, slot: 3 }
  ], { coachMode: true });
  ok(tecnico[0].uid === 'u2', 'modo técnico: a âncora não mexe (o dono do celular não está jogando)');

  // Usuário fora da quadra (assistindo/organizando) → não inventa lado.
  global.window.AppStore = { currentUser: { uid: 'uZZ', displayName: 'Estranho' } };
  const fora = rodar([
    { name: 'Kelly', uid: 'u2', team: 1, slot: 0 }, { name: 'Nelson', uid: 'u3', team: 1, slot: 1 },
    { name: 'Rodrigo', uid: 'u1', team: 2, slot: 2 }, { name: 'Ana', uid: 'u4', team: 2, slot: 3 }
  ]);
  ok(fora[0].uid === 'u2', 'quem não está em campo não é ancorado');

  // Divisão inválida chegando aqui: não conserta às cegas.
  global.window.AppStore = { currentUser: { uid: 'u1', displayName: 'Rodrigo' } };
  const invalido = rodar([
    { name: 'Kelly', uid: 'u2', team: 1, slot: 0 }, { name: 'Nelson', uid: 'u3', team: 1, slot: 1 },
    { name: 'Ana', uid: 'u4', team: 1, slot: 2 }, { name: 'Rodrigo', uid: 'u1', team: 2, slot: 3 }
  ]);
  ok(invalido[0].uid === 'u2', 'divisão 3×1 não é "consertada" pela âncora — ela só recua');
});

// ═══ 6. A REGRA ACEITA IDENTIDADE, NÃO SÓ NOME ═════════════════════════════
secao('regra aceita identidade', function () {
  const p = (n, u) => ({ name: n, uid: u });
  const r = anchor([p('Kelly', 'u2'), p('Nelson', 'u3')], [p('Rodrigo', 'u1'), p('Ana', 'u4')],
                   x => x && x.uid, 'u1', 'Rodrigo');
  ok(r.t1[0].uid === 'u1', '`_anchorUserFirst` aceita objetos {name,uid} e casa por uid');
  ok(r.t1.length === 2 && r.t2.length === 2, 'e devolve os dois times íntegros');

  // Homônimos com uid distinto: o uid manda, o nome não confunde.
  const h = anchor([p('Kelly', 'kB'), p('Nelson', 'u3')], [p('Kelly', 'kA'), p('Ana', 'u4')],
                   x => x && x.uid, 'kA', 'Kelly');
  ok(h.t1[0].uid === 'kA', 'com uid em cada entrada, dois homônimos não confundem a âncora');

  // Continua funcionando com strings (o caminho do re-sorteio).
  const s = anchor(['Kelly', 'Nelson'], ['Rodrigo', 'Ana'],
                   n => ({ Rodrigo: 'u1', Kelly: 'u2', Nelson: 'u3', Ana: 'u4' })[n], 'u1', 'Rodrigo');
  ok(s.t1[0] === 'Rodrigo', 'e o formato antigo (lista de nomes) segue intacto');
});

// ═══ 7. ÍNDICE SEMEIA, NUNCA CREDITA ═══════════════════════════════════════
ok(/_SEMENTE_POR_ORDEM/.test(BUI),
   'a divisão por ordem das caixas está nomeada como SEMENTE, não como escolha de dupla');
ok(/var idx = \(typeof p\.slot === 'number'\) \? p\.slot : ordem;/.test(BUI),
   'sugestão de vínculo lê o `slot` do jogador, não a posição na lista (que os times reordenam)');
ok(/_savedPlayerNames\[_slotSv\]/.test(BUI),
   'nomes digitados voltam pela caixa em que foram digitados, não pela ordem dos times');

console.log(falhas === 0
  ? '\nformacao-de-duplas-casual: ' + 0 + ' falhas\n'
  : '\nformacao-de-duplas-casual: ' + falhas + ' FALHAS\n');
process.exit(falhas === 0 ? 0 : 1);
