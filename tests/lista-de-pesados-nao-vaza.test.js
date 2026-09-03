/* ENTRAR NA LISTA DE PESADOS NÃO TIRA NADA DO DOCUMENTO  (2.0.121)
 * node tests/lista-de-pesados-nao-vaza.test.js
 *
 * `PESADOS` diz o que PODE morar fora do documento. Quem decide o que REALMENTE mora fora é
 * o `_semPesados` de cada torneio. `dividir` extrai tudo que é pesado POR NATUREZA, e os dois
 * escritores devolvem pro documento aquilo que o marcador daquele torneio não pediu.
 *
 * ⛔ POR QUE ISTO É PERIGOSO O BASTANTE PRA TER SUÍTE PRÓPRIA: o passo entre "extraiu" e
 * "devolveu" é onde o dado some. Se o escritor esquecer de devolver, `dividir` já esvaziou o
 * campo e a gravação persiste o vazio — sem erro, sem log. Já aconteceu quatro vezes neste
 * projeto com lista escrita à mão, e a última custou o elenco de 39 torneios.
 *
 * Na 2.0.121 entraram `checkedIn`, `woClaims`, `woLog` e `categoryNotifications`. Nenhum
 * torneio os pediu no marcador ainda — todos são mutados NO CLIENTE, e o cliente não tem
 * permissão de escrever subcoleção. Enquanto não houver porta no servidor pra eles, esta
 * suíte é o que garante que a lista maior não roubou nada de ninguém.
 * [[project_dividir_exige_todo_escritor_ciente]]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const S = require(path.join(ROOT, 'js/views/tournament-split-core.js'));
let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

console.log('──── a lista de pesados não vaza ────');

const NOVOS = ['checkedIn', 'woClaims', 'woLog', 'categoryNotifications'];
NOVOS.forEach((c) => ok('`' + c + '` está na lista de pesados', S.PESADOS.indexOf(c) !== -1));

// um torneio com TODOS os campos preenchidos, dividido só nos jogos
function torneio() {
  return {
    id: 't1', name: 'T', _semPesados: ['matches'],
    rounds: [{ matches: [{ id: 'm1', p1: 'A', p2: 'B', winner: 'A' }] }],
    participants: [{ uid: 'uA', name: 'Ana' }, { uid: 'uB', name: 'Bruno' }],
    history: [{ date: '2026-08-01T00:00:00.000Z', message: 'começou' }],
    opponentHistory: [{ uid: 'uA', vs: ['uB'] }],
    checkedIn: { uA: 1786639096223, uB: 1786639096999 },
    woClaims: [{ absentName: 'Carla', absentUids: ['uC'], createdAt: '2026-08-03T01:32:54.338Z', scope: 'grupo' }],
    woLog: [{ id: 'wo-0-G-uC-0', roundIndex: 0, groupName: 'G', absentUid: 'uC' }],
    categoryNotifications: [{ source: 'perfil', category: 'D', targetUid: 'uA', timestamp: 1781215679148, read: true }]
  };
}

// ── ① a ida e volta continua idêntica ─────────────────────────────────────────
const t0 = torneio();
const volta = S.remontar(S.dividir(JSON.parse(JSON.stringify(t0))));
ok('⭐ remontar(dividir(t)) === t com todos os campos novos',
  S.iguais(S.canonico(t0), S.canonico(volta)),
  NOVOS.filter(c => JSON.stringify(t0[c]) !== JSON.stringify(volta[c])).join(', ') + ' diferiram');
ok('  → e o mapa `checkedIn` volta como MAPA, chaveado por uid',
  volta.checkedIn && volta.checkedIn.uA === 1786639096223 && !Array.isArray(volta.checkedIn));

// ── ② a chave é de CONTEÚDO, nunca de posição ────────────────────────────────
const p = S.dividir(JSON.parse(JSON.stringify(t0)));
NOVOS.concat(['history', 'participants']).forEach((c) => {
  const regs = p[c] || [];
  if (!regs.length) { ok('`' + c + '` produziu registro', false); return; }
  const semK = regs.filter((r) => !r._k);
  if (c === 'checkedIn') {
    // mapa: o `_idx` É o uid — identidade de verdade, não posição
    ok('`checkedIn` é chaveado pelo uid (o _idx é a identidade)',
      regs.every((r) => typeof r._idx === 'string' && /^[A-Za-z]/.test(r._idx)));
  } else {
    ok('⛔ `' + c + '` tem chave de CONTEÚDO em todos os registros (nenhum cai na posição)',
      semK.length === 0, semK.length + ' de ' + regs.length + ' sem `_k`');
  }
});
const dois = S.dividir({ woLog: [{ id: 'wo-A' }, { id: 'wo-B' }] }).woLog;
ok('  → e dois registros diferentes não colidem', dois[0]._k !== dois[1]._k);
const iguaisK = S.dividir({ woClaims: [{ x: 1 }, { x: 1 }] }).woClaims;
ok('  ⚠️ conteúdo idêntico COLIDE (limite conhecido, mesmo do histórico)', iguaisK[0]._k === iguaisK[1]._k);

// ── ③ ESCREVER não pode esvaziar o que o marcador não pediu ──────────────────
// É o passo perigoso: `dividir` já esvaziou; se o escritor não devolver, grava o vazio.
function simulaEscritor(t) {                       // a MESMA lógica dos dois escritores
  const fora = t._semPesados;
  const parts = S.dividir(JSON.parse(JSON.stringify(t)));
  (S.PESADOS || []).forEach((k) => {
    if (fora.indexOf(k) === -1 && t[k] !== undefined) parts.config[k] = t[k];
  });
  return parts.config;
}
const cfg = simulaEscritor(torneio());
NOVOS.concat(['participants', 'history', 'opponentHistory']).forEach((c) => {
  const orig = torneio()[c];
  ok('⛔ `' + c + '` NÃO está no marcador ⇒ segue INTEIRO no documento',
    JSON.stringify(cfg[c]) === JSON.stringify(orig),
    'gravaria ' + JSON.stringify(cfg[c]).slice(0, 60) + ' no lugar de ' + JSON.stringify(orig).slice(0, 60));
});
ok('⭐ e o que ESTÁ no marcador sai mesmo (os jogos)', (cfg.rounds[0].matches || []).length === 0);

// ── ④ os dois escritores derivam da lista, nenhum cita nome à mão ────────────
const cli = fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8');
/* ⛔ ESTA ASSERÇÃO TRAVAVA O DEFEITO (corrigida na 2.1.42). Ela exigia o texto literal
 * `(S.PESADOS || [...]).forEach` — e esse `S` não existe naquele escopo: é declarado
 * ~1.100 linhas abaixo, dentro de OUTRA função. O ramo só roda em torneio com
 * `_semPesados`, então a linha nunca era executada pela suíte; o teste lia o fonte e
 * dava verde enquanto a criação de todo torneio dividido morria com
 * `ReferenceError: S is not defined` (6× no Sentry, 14 min depois do deploy da 2.1.32).
 * ⭐ O que importa é a DERIVAÇÃO da lista, não o nome da variável que a segura. Quem
 * garante que a linha RODA é gravar-torneio-dividido-roda-de-verdade.test.js, que a
 * executa. Asserção de texto não substitui execução. */
ok('⛔ o cliente devolve derivando de PESADOS (não de lista à mão)',
   /PESADOS\)?\s*\|\|\s*\[[^\]]*\]\)\.forEach/.test(cli));
ok('   e sem alcançar símbolo de outro escopo', !/\(S\.PESADOS/.test(cli));
/* ⚠️ 2.2 — O GRAVADOR MUDOU DE ENDEREÇO, NÃO DE COMPORTAMENTO. O que era um bloco dentro
 * de `_gravaTorneio` virou um planejador puro em `functions-autodraw/write-plan.js`
 * (`planWrites`) mais um executor (`applyPlan`), por ordem do revisor: a checagem de teto e
 * a escrita real precisam consumir o MESMO plano, senão o teto mede uma coisa e o banco
 * recebe outra. Estas asserções continuam valendo palavra por palavra — só que o CAMINHO DE
 * ESCRITA da CF agora são dois arquivos. Varrer só o index.js daria vermelho por endereço
 * errado, que é o pior tipo de falso negativo: some a cobertura e parece regressão. */
const _cfIdx = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'index.js'), 'utf8');
const _cfPlan = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'write-plan.js'), 'utf8');
const cf = _cfIdx + '\n/* ── write-plan.js (mesmo caminho de escrita) ── */\n' + _cfPlan;
ok('⛔ o servidor idem', /\((?:_tSplit|split)\.PESADOS \|\| \[[^\]]*\]\)\.forEach/.test(cf));
const iG = cf.indexOf('function _gravaTorneio(');
  /* 2.2: o gravador virou planejador puro (`planWrites`) + executor (`applyPlan`) em
   * write-plan.js. Mesma invariante, endereço novo — a âncora acompanha o código. */
const iPlan = cf.indexOf('function planWrites(');
const grava = cf.slice(iG, cf.indexOf('\nfunction ', iG + 10)) +
              cf.slice(iPlan, cf.indexOf('\nfunction _fecha(', iPlan));
ok('⛔ e o servidor grava TODA parte do marcador, não só `matches`',
  /fora\.forEach\(/.test(grava),
  'era só o ramo de matches: qualquer outra parte era esvaziada do doc e nunca escrita');

// ── ⑤ o que ainda NÃO pode sair, e por quê ───────────────────────────────────
// Estes quatro são mutados NO CLIENTE (presence/wo-claim/wo-log/categories) e o cliente não
// tem permissão de escrever subcoleção. Pôr um deles no marcador antes de existir porta no
// servidor repetiria, quatro vezes, o buraco da inscrição.
NOVOS.forEach((c) => {
  const usados = ['js/store.js', 'js/views/tournaments-draw.js', 'js/views/wo-claim.js',
                  'js/views/wo-log.js', 'js/views/tournaments-categories.js']
    .filter((f) => new RegExp('\\.' + c + '\\s*=').test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  if (!usados.length) return;
  ok('⚠️ `' + c + '` ainda é escrito pelo CLIENTE (' + usados.length + ' arquivo) — ' +
     'não pode entrar num marcador antes de ter porta no servidor', true);
});

console.log(falhas === 0 ? '\n✅ lista-de-pesados-nao-vaza: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
