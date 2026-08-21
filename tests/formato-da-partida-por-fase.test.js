/* FORMATO DA PARTIDA POR FASE — a classificatória e a eliminatória podem jogar formatos
 * DIFERENTES, e é o formato da FASE que vale no jogo.
 *
 * Pedido do dono (21/ago/2026), com a Confra de exemplo: "vamos fazer rei/rainha com disputa
 * de 1 set na fase classificatoria e na fase eliminatoria vamos adotar as duplas fixas que se
 * formaram na classificatoria disputando melhor de 3 com super tie break… isso precisa
 * funcionar e nao ficar apenas no desenho."
 *
 * O QUE ESTE TESTE COBRE — o caminho INTEIRO, não o desenho:
 *   config (cfg.eliminatoria.scoring) → compileToPhases → phases[elim].scoring →
 *   window._effectiveScoring(t, match), que é a função que o placar ao vivo, o card do
 *   jogo e a entrada de resultado consultam. Se qualquer elo cair, o teste falha.
 *
 * FALHA NO CÓDIGO ANTIGO: _phaseBase() carimbava `scoring: null` em TODA fase e nada
 * escrevia por cima → toda fase herdava t.scoring e a eliminatória jogava, na marra, o
 * mesmo formato da classificatória.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const H = require('./render-harness');   // traz store.js → window._effectiveScoring REAL
const W = H.sandbox;
// format2.js não é carregado pelo harness de render (é o compilador da criação).
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/views/format2.js'), 'utf8'), W, { filename: 'format2.js' });
const F = W.FORMAT2;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const eq = (a, b, m) => ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')');

console.log('──── formato-da-partida-por-fase ────');
ok(typeof F.compileToPhases === 'function', 'FORMAT2.compileToPhases existe');
ok(typeof W._effectiveScoring === 'function', 'window._effectiveScoring existe (store.js)');

// 1 SET: o formato da classificatória da Confra (t.scoring, do bloco do form).
const UM_SET = {
  type: 'sets', setsToWin: 1, gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7,
  tiebreakMargin: 2, superTiebreak: false, superTiebreakPoints: 10, countingType: 'tennis',
  advantageRule: false, fixedSet: false, fixedSetGames: 6
};
// MELHOR DE 3 com super tie-break no 3º set: o "segundo botão" do Formato da Partida.
const MELHOR_DE_3 = {
  type: 'sets', setsToWin: 2, gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7,
  tiebreakMargin: 2, superTiebreak: true, superTiebreakPoints: 10, countingType: 'tennis',
  advantageRule: false, fixedSet: false, fixedSetGames: 6
};

// A Confra: Rei/Rainha na classificatória (1 grupo, parceria rotativa) + eliminatória.
function confraCfg() {
  const c = F.defaultConfig('Beach Tennis');
  c.disputa = 'dupla';
  c.grupos = 1;
  c.parceria = 'rei_rainha';
  c.classifAtiva = true;
  c.eliminatoria.ativa = true;
  c.eliminatoria.openReiRainha = false;
  return c;
}

// ── 1. DEFAULT não muda nada: sem formato próprio, a elim herda o do torneio ──
(function () {
  const out = F.compileToPhases(confraCfg(), { sport: 'Beach Tennis' });
  const elim = out.phases[out.phases.length - 1];
  eq(elim.name, 'Eliminatória', 'última fase é a Eliminatória');
  eq(elim.scoring, null, 'sem formato próprio → phases[elim].scoring = null (herda t.scoring)');
  const t = { id: 't1', scoring: UM_SET, phases: out.phases };
  eq(W._effectiveScoring(t, { phaseIndex: 1 }).setsToWin, 1,
    'herdando: o jogo da eliminatória usa 1 set, como a classificatória');
})();

// ── 2. O CASO DO DONO: 1 set na classificatória, melhor de 3 na eliminatória ──
(function () {
  const c = confraCfg();
  c.eliminatoria.scoring = MELHOR_DE_3;
  const out = F.compileToPhases(c, { sport: 'Beach Tennis' });
  const elim = out.phases[out.phases.length - 1];

  eq(out.phases[0].scoring, null, 'classificatória continua com scoring null (usa t.scoring)');
  ok(elim.scoring && elim.scoring.type, 'eliminatória tem scoring PRÓPRIO com type (senão _effectiveScoring ignora)');
  // sem `|| {}` um scoring null (o bug antigo) derrubaria o teste com stack trace em vez
  // de apontar o assert — quero o RELATÓRIO da falha, não o crash.
  eq((elim.scoring || {}).setsToWin, 2, 'eliminatória: 2 sets para vencer (melhor de 3)');
  eq((elim.scoring || {}).superTiebreak, true, 'eliminatória: super tie-break ligado');
  eq((elim.scoring || {}).superTiebreakPoints, 10, 'eliminatória: super tie-break de 10 pontos');

  // O que o JOGO lê — a prova de que não ficou no desenho.
  const t = { id: 't2', scoring: UM_SET, phases: out.phases };
  eq(W._effectiveScoring(t, { phaseIndex: 0 }).setsToWin, 1, 'jogo da FASE 0 → 1 set');
  eq(W._effectiveScoring(t, { phaseIndex: 1 }).setsToWin, 2, 'jogo da FASE 1 (elim) → melhor de 3');
  eq(W._effectiveScoring(t, { phaseIndex: 1 }).superTiebreak, true, 'jogo da elim → super tie-break');
  // match sem phaseIndex cai na fase 0 (comportamento antigo preservado).
  eq(W._effectiveScoring(t, {}).setsToWin, 1, 'match sem phaseIndex → fase 0 (1 set)');
})();

// ── 3. Sobrevive ao round-trip pelo t.fmt2 (editar o torneio depois) ──
(function () {
  const c = confraCfg();
  c.eliminatoria.scoring = MELHOR_DE_3;
  const salvo = JSON.parse(JSON.stringify(F.normalize(c, 'Beach Tennis')));  // = t.fmt2 no doc
  const relido = F.normalize(salvo, 'Beach Tennis');
  eq((relido.eliminatoria.scoring || {}).setsToWin, 2, 'normalize preserva o formato da elim (round-trip)');
  const out = F.compileToPhases(relido, { sport: 'Beach Tennis' });
  eq((out.phases[out.phases.length - 1].scoring || {}).setsToWin, 2, 'recompilar do fmt2 mantém melhor de 3');
})();

// ── 4. Normalização defensiva: meio-objeto vindo de config antiga não passa sem `type` ──
(function () {
  const c = confraCfg();
  c.eliminatoria.scoring = { setsToWin: 2, gamesPerSet: 6 };   // SEM type
  const n = F.normalize(c, 'Beach Tennis');
  eq((n.eliminatoria.scoring || {}).type, 'sets', 'scoring sem type é normalizado para "sets"');
  const t = { id: 't4', scoring: UM_SET, phases: F.compileToPhases(n, { sport: 'Beach Tennis' }).phases };
  eq(W._effectiveScoring(t, { phaseIndex: 1 }).setsToWin, 2,
    'com type normalizado, _effectiveScoring PASSA a enxergar a fase (sem type era ignorado)');
  // lixo → null (herda), nunca objeto quebrado
  const c2 = confraCfg(); c2.eliminatoria.scoring = 'melhor de 3';
  eq(F.normalize(c2, 'Beach Tennis').eliminatoria.scoring, null, 'scoring inválido → null (herda)');
})();

// ── 5. Eliminação DIRETA: a elim É a fase inicial → um formato só (o do torneio) ──
// Não pode haver duas fontes para o mesmo jogo: lá o bloco "🎾 Formato da Partida" do form
// é relocado para dentro da própria eliminatória.
(function () {
  const c = confraCfg();
  c.classifAtiva = false;
  c.eliminatoria.scoring = MELHOR_DE_3;
  const n = F.normalize(c, 'Beach Tennis');
  eq(n.eliminatoria.scoring, null, 'eliminação direta: scoring próprio é zerado (a elim é a fase inicial)');
  const out = F.compileToPhases(n, { sport: 'Beach Tennis' });
  eq(out.phases[0].scoring, null, 'fase 0 da eliminação direta usa t.scoring');
})();

// ── 6. Abertura por Rei/Rainha: a FORMAÇÃO herda; quem muda é a disputa eliminatória ──
(function () {
  const c = confraCfg();
  c.eliminatoria.openReiRainha = true;
  c.eliminatoria.scoring = MELHOR_DE_3;
  const out = F.compileToPhases(c, { sport: 'Beach Tennis' });
  eq(out.phases.length, 3, 'classificatória + formação Rei/Rainha + eliminatória');
  eq(out.phases[1].name, 'Rei/Rainha', 'fase do meio é a de formação');
  eq(out.phases[1].scoring, null, 'a rodada de FORMAÇÃO herda o formato da classificatória');
  eq((out.phases[2].scoring || {}).setsToWin, 2, 'a eliminatória em si joga melhor de 3');

  const t = { id: 't6', scoring: UM_SET, phases: out.phases };
  eq(W._effectiveScoring(t, { phaseIndex: 1 }).setsToWin, 1, 'jogo da formação → 1 set');
  eq(W._effectiveScoring(t, { phaseIndex: 2 }).setsToWin, 2, 'jogo da eliminatória → melhor de 3');
})();

// ── 7. A TELA DE REGRAS conta o formato de cada fase ─────────────────────────
// Sem isto a tela se contradiz: diz "1 set" (t.scoring) enquanto a eliminatória joga
// melhor de 3. Quem manda no jogo é _effectiveScoring; as Regras só precisam NÃO mentir.
(function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/views/rules.js'), 'utf8');
  ok(/fasesFormatoHtml/.test(src), 'rules.js monta o bloco de formato POR FASE');
  ok(/p\.scoring && p\.scoring\.type|x\.p\.scoring/.test(src), 'lê phases[i].scoring (não só t.scoring)');
  ok(/\$\{fasesFormatoHtml\}/.test(src), 'e o bloco é REALMENTE injetado na tela (não só calculado)');
  ok(/As demais fases/.test(src), 'diz quais fases seguem o formato de cima (não deixa dúvida)');
})();

// ── 8. A UI da fase eliminatória existe e está ligada ao cfg ─────────────────
(function () {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'js/views/format2-ui.js'), 'utf8');
  ok(/_gsmElimBlock/.test(ui), 'format2-ui tem a seção Formato da Partida da eliminatória');
  ok(/if \(cfg\.classifAtiva\) eb \+= .*_gsmElimBlock\(e\)/.test(ui),
    'a seção só aparece quando a elim é fase POSTERIOR (na direta, o bloco do form vai pra lá)');
  ok(/_EXT_IDS = \[[^\]]*'gsm-section'[^\]]*\]/.test(ui),
    'o bloco do form (#gsm-section) é realocado pra dentro da FASE INICIAL');
  ok(/window\._f2ElimScoringPreset/.test(ui) && /window\._f2ElimScoringOwn/.test(ui),
    'handlers do preset e do toggle existem');
  ok(/window\._openGSMConfig\('elim'\)/.test(ui), '"Personalizado" abre o modal com alvo na eliminatória');
  const ct = fs.readFileSync(path.join(__dirname, '..', 'js/views/create-tournament.js'), 'utf8');
  ok(/window\._gsmConfigTarget === 'elim'/.test(ct),
    'o modal Personalizado grava na ELIMINATÓRIA quando foi aberto por ela (não nos campos do form)');
  ok(/window\._gsmCloseConfig = function/.test(ct) && /window\._gsmConfigTarget = null/.test(ct),
    'e o alvo é ZERADO ao fechar (senão o próximo Personalizado gravaria no lugar errado)');
})();

// ── 9. UMA PONTA SÓ posiciona o "🎾 Formato da Partida" ──────────────────────
// 🔴 O BUG QUE A TELA MOSTRAVA (relato do dono, 21/ago): "o formato da partida está
// unificado para todo o torneio" — apesar de tudo acima estar verde. Motivo: DUAS pontas
// mexiam no MESMO nó.
//   • format2-ui  → _EXT_IDS/_placeExt colocam #gsm-section DENTRO da fase (#f2-classif-extra);
//   • create-tournament → _f2MountInEditForm o puxava pra FORA (insertBefore no pai do
//     #fase1-box) e, quando o mount JÁ existia, retornava ali mesmo sem recolocar.
// Como renderCreateTournamentPage chama _f2MountInEditForm no render E DE NOVO no setTimeout
// logo depois, quem escrevia por último era sempre a 2ª chamada → o bloco terminava solto
// acima das fases, com cara de formato único do torneio. Medido em DOM real (playwright):
// gsmPaiDireto = 'form-create-tournament' antes, '#f2-classif-extra' depois.
// Prova de tela: tests/e2e/formato-por-fase.spec.js.
(function () {
  const ct = fs.readFileSync(path.join(__dirname, '..', 'js/views/create-tournament.js'), 'utf8');
  const i = ct.indexOf('window._f2MountInEditForm = function');
  ok(i > 0, '_f2MountInEditForm existe');
  const corpo = ct.slice(i, ct.indexOf('window._setPhaseField', i));
  ok(!/insertBefore\(\s*_gsm\b/.test(corpo) && !/getElementById\('gsm-section'\)/.test(corpo),
    'o mount NÃO reposiciona #gsm-section — quem posiciona é o format2-ui (_EXT_IDS)');
  ok(/data-f2-editid'\) === editId\) \{[\s\S]{0,600}?_f2PlaceExtSections/.test(corpo),
    'e o caminho de "mesmo contexto → mantém" REAFIRMA as seções dentro da fase antes de sair');
})();

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ formato-da-partida-por-fase FALHOU'); process.exit(1); }
console.log('✅ formato-da-partida-por-fase: OK');
