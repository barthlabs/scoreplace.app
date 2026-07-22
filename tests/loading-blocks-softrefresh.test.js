// REPRODUZ o bug do dono (jul/2026): "em momentos do sorteio, está voltando para a tela de detalhes
// do torneio, mostrando os cards dos jogadores (ind/duplas) cedo demais. em 2 momentos. logo que
// clica em sortear e logo antes de montar as chaves propriamente ditas."
//
// CAUSA-RAIZ: a tela de processamento global (#sp-global-loading — o "🎾 Sorteando…" do _showLoading)
// NÃO estava na safe-list do _softRefreshView. O próprio sorteio ESCREVE no doc antes de montar a
// chave (salvar decisões; restaurar o roster original antes de despachar pra CF); cada escrita ECOA
// um snapshot do Firestore → _softRefreshView → initRouter → re-render do DETALHE (cards de
// inscritos) POR BAIXO do loader → "voltou sozinho / parece que não funcionou".
//
// REGRA TRAVADA AQUI: enquanto houver tela de processamento bloqueante, NADA re-renderiza por baixo
// — o refresh é ADIADO (retry) e só roda quando o loader sai.
// Ver [[project_overlay_softrefresh_detection]].
const H = require('./render-harness');
const W = H.sandbox;

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// DOM mínimo: controla quais ids "existem".
let present = {};
const el = () => ({ style: {}, classList: { contains: () => false, add() {}, remove() {} }, querySelector: () => null, querySelectorAll: () => [], getAttribute: () => null, setAttribute() {}, remove() {} });
W.document.getElementById = (id) => (present[id] ? el() : null);
W.document.querySelector = () => null;
W.document.querySelectorAll = () => [];
W.document.activeElement = null;
W.document.body = Object.assign(el(), { classList: { contains: () => false, add() {}, remove() {} } });

// estamos NO DETALHE do torneio (#tournaments/:id) — a tela que o dono viu voltar sozinha.
// (hash vazio cai no ramo da dashboard, que tem caminho próprio e não usa initRouter.)
W.location = W.location || {};
W.location.hash = '#tournaments/T1';

let routed = 0;
W.initRouter = function () { routed++; };
// setTimeout no harness é noop → o retry adiado NÃO dispara sozinho; medimos só o efeito imediato.

function run(label, ids) {
  present = ids; routed = 0;
  W._lastSoftRefresh = 0;            // zera o debounce entre casos
  W._pendingSoftRefresh = null;
  W._suppressSoftRefresh = false;    // o guard 0 é de outro fluxo (presença)
  try { W._softRefreshView(); } catch (e) { return 'throw:' + e.message; }
  return routed;
}

console.log('── tela de processamento bloqueia o re-render por baixo ──');

// (1) sem nada aberto → refresca normalmente (não pode travar o app)
ok(run('livre', {}) === 1, 'sem overlay: _softRefreshView RE-RENDERIZA normalmente (não quebrei o caminho comum)');

// (2) "🎾 Sorteando…" na tela → NÃO pode re-renderizar o detalhe por baixo  ← o bug do dono
ok(run('loading', { 'sp-global-loading': 1 }) === 0,
   '✅ com "Sorteando…" (#sp-global-loading) NA TELA: NÃO re-renderiza — sem isto o detalhe voltava com os cards no meio do sorteio');

// (3) o loader saiu → volta a refrescar (o refresh é ADIADO, não perdido)
ok(run('depois', {}) === 1, 'loader fechou: volta a re-renderizar (adiado, não cancelado)');

// (4) regressão: os painéis do sorteio que já estavam protegidos seguem protegidos
['unified-resolution-panel', 'solo-resolution-panel', 'gender-draw-overlay', 'final-review-panel', 'custom-confirm-dialog'].forEach(id => {
  ok(run(id, { [id]: 1 }) === 0, 'segue protegido: #' + id + ' bloqueia o re-render');
});

console.log('\n' + (fail === 0 ? '✅ loading-blocks-softrefresh: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
