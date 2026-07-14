/* Cronômetro regressivo da busca letzplay — node tests/letzplay-eta.test.js
 *
 * Regra do dono: "coloque uma estimativa de tempo regressiva pra concluir e pode ir
 * ajustando, aumentando ou diminuindo se necessário, desde que quando chegar em 100%
 * chegue a 0 segundos." Vale nos TRÊS botões (essencial / completa / autoimport), que
 * compartilham o mesmo overlay.
 *
 * O que este teste congela:
 *  • 100% ⇔ 0s — os dois saem da MESMA contagem, então não podem divergir NUNCA.
 *  • Nunca 0s com trabalho pendente (senão o número mente e o usuário fecha a aba).
 *  • Ajusta pra CIMA e pra BAIXO conforme o tempo real medido (não repete a semente).
 *  • Espera imposta pelo letzplay AUMENTA a estimativa em vez de deixá-la cair.
 *  • A contagem nunca anda pra trás.
 * Ver project_letzplay_scan_stability.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// Carrega só o módulo do ETA (o arquivo inteiro toca DOM; isolamos o trecho canônico).
function loadEta() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'letzplay-onboarding.js'), 'utf8');
  const ini = src.indexOf('var _eta = null;');
  const fim = src.indexOf('// Fases do import do próprio usuário');
  if (ini < 0 || fim < 0 || fim <= ini) throw new Error('bloco do ETA não encontrado — o teste precisa ser reapontado');
  const sandbox = { console, Date, Math, String };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src.slice(ini, fim), sandbox, { filename: 'eta.js' });
  return sandbox;
}
// Avança o relógio sem esperar de verdade.
function comRelogio(w, fn) {
  const real = Date.now; let t = real.call(Date);
  w.Date = { now: () => t };
  const r = fn((ms) => { t += ms; });
  w.Date = Date;
  return r;
}

// ── 1. A GARANTIA: 100% ⇒ 0s ──
{
  const w = loadEta();
  w._spEtaBegin(4, 9000);
  for (let i = 0; i < 4; i++) w._spEtaUnit();
  ok(w._spEtaPct() === 99 || w._spEtaMs() === 0, 'sanidade');
  ok(w._spEtaMs() === 0, 'com todas as unidades feitas, o tempo tem que ser 0s (veio ' + w._spEtaMs() + ')');
  ok(w._spEtaText() === 'concluído', 'texto final = concluído (veio "' + w._spEtaText() + '")');
}

// ── 2. NUNCA 0s com trabalho pendente ──
{
  const w = loadEta();
  w._spEtaBegin(10, 9000);
  w._spEtaUnit(); w._spEtaUnit();
  ok(w._spEtaMs() >= 3000, 'com 8 de 10 pendentes o tempo não pode ser ~0 (veio ' + w._spEtaMs() + 'ms)');
  ok(w._spEtaPct() < 100, 'com trabalho pendente o pct não pode ser 100 (veio ' + w._spEtaPct() + ')');
}
// nem depois de estourar MUITO a média (pessoa lenta): floor, e o pct segue < 100
{
  const w = loadEta();
  comRelogio(w, (avanca) => {
    w._spEtaBegin(5, 9000);
    w._spEtaUnit();
    avanca(600000);                 // 10min presos na pessoa atual
    ok(w._spEtaMs() >= 3000, 'estourando a média, o tempo NÃO pode zerar com gente na fila (veio ' + w._spEtaMs() + ')');
    ok(w._spEtaPct() < 100, 'pct segue < 100 enquanto houver pendente');
  });
}

// ── 3. Ajusta pra CIMA quando a realidade é mais lenta que a semente ──
{
  const w = loadEta();
  comRelogio(w, (avanca) => {
    w._spEtaBegin(10, 5000);        // semente otimista: 5s por pessoa
    const antes = w._spEtaMs();
    avanca(40000); w._spEtaUnit();  // na real levou 40s
    const depois = w._spEtaMs();
    ok(depois > antes, 'medindo 40s contra semente de 5s, a estimativa tem que SUBIR (' + antes + ' → ' + depois + ')');
  });
}
// ── 4. …e pra BAIXO quando é mais rápida ──
{
  const w = loadEta();
  comRelogio(w, (avanca) => {
    w._spEtaBegin(10, 60000);       // semente pessimista: 60s
    const antes = w._spEtaMs();
    avanca(3000); w._spEtaUnit();   // na real 3s
    const depois = w._spEtaMs();
    ok(depois < antes, 'medindo 3s contra semente de 60s, a estimativa tem que DESCER (' + antes + ' → ' + depois + ')');
  });
}

// ── 5. Espera do letzplay AUMENTA o tempo (não deixa cair durante a pausa) ──
{
  const w = loadEta();
  w._spEtaBegin(10, 9000);
  const antes = w._spEtaMs();
  w._spEtaDelay(60000);             // letzplay pediu 60s
  ok(w._spEtaMs() > antes + 50000, 'a espera imposta tem que entrar na conta (' + antes + ' → ' + w._spEtaMs() + ')');
}

// ── 6. Sync absoluto (autoimport reporta "42 de 152", não "+1") e nunca anda pra trás ──
{
  const w = loadEta();
  comRelogio(w, (avanca) => {
    w._spEtaBegin(152, 320);
    avanca(4000); w._spEtaSync(20);           // 1ª página: 20 jogos em 4s
    const pct20 = w._spEtaPct();
    w._spEtaSync(10);                          // relatório atrasado/fora de ordem
    ok(w._spEtaPct() === pct20, 'contagem NUNCA anda pra trás (era ' + pct20 + ', virou ' + w._spEtaPct() + ')');
    w._spEtaSync(152);
    ok(w._spEtaMs() === 0, 'sync até o total ⇒ 0s (veio ' + w._spEtaMs() + ')');
  });
}

// ── 7. O pct nunca passa de 99 antes do fim (não existe "100% e ainda rodando") ──
{
  const w = loadEta();
  w._spEtaBegin(3, 9000);
  w._spEtaUnit(); w._spEtaUnit();
  w._spEtaFrac(0.94);
  ok(w._spEtaPct() <= 99, 'com fração alta na última unidade o pct para em 99 (veio ' + w._spEtaPct() + ')');
  ok(w._spEtaMs() > 0, 'e o tempo ainda é > 0');
}

// ── 8. Texto legível nas três escalas ──
{
  const w = loadEta();
  w._spEtaBegin(100, 8500);
  ok(/faltam ~\d+min \d\ds/.test(w._spEtaText()), 'essencial de 100 pessoas mostra minutos E segundos (senão parece travado) (veio "' + w._spEtaText() + '")');
  const w2 = loadEta();
  w2._spEtaBegin(100, 120000);   // completa de 100 = ~3h
  ok(/faltam ~\dh\d\dmin/.test(w2._spEtaText()), 'completa de 100 mostra horas (veio "' + w2._spEtaText() + '")');
  const w3 = loadEta();
  w3._spEtaBegin(2, 9000);
  ok(/faltam ~\d+s/.test(w3._spEtaText()), 'restos curtos em segundos (veio "' + w3._spEtaText() + '")');
}

console.log((fail ? '✗' : '✓') + ' letzplay-eta: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
