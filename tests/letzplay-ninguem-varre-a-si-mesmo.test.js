/* NINGUÉM VARRE A SI MESMO — o predicado do cliente, e o que ele impede depois.
 * node tests/letzplay-ninguem-varre-a-si-mesmo.test.js
 *
 * O scan do letzplay é ATESTADO DE TERCEIRO: o organizador varre o perfil público de quem
 * está inscrito. Varrer a si mesmo é auto-atestar categoria, e a Rule passou a recusar.
 *
 * ⛔ POR QUE O FILTRO É NA FRONTEIRA DE LOTE, e não em cada gravação: pular só a gravação
 * deixaria a linha do próprio organizador mexendo no acervo, chamando a Function e pintando
 * na tela — meio conserto, do tipo que passa despercebido. O particionamento acontece ANTES
 * de qualquer efeito.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; return; } fail++; console.error('  ✗ ' + m); };

const fonte = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');

console.log('\n── o predicado existe UMA vez e é usado onde decide ──');
{
  const defs = (fonte.match(/window\._lzNaoEhEuMesmo\s*=/g) || []).length;
  ok(defs === 1, '⭐ o predicado é definido UMA vez (achei ' + defs + ')');
  const usos = (fonte.match(/_lzNaoEhEuMesmo\(/g) || []).length;
  ok(usos >= 3, 'e é usado nas fronteiras que importam (' + usos + ' usos)');
}

console.log('── as duas fronteiras de lote filtram ANTES de qualquer efeito ──');
{
  const persist = fonte.slice(fonte.indexOf('function _lzPersistScans'));
  const okLinha = persist.slice(0, persist.indexOf('if (!ok.length)'));
  ok(/_lzNaoEhEuMesmo\(s\.uid\)/.test(okLinha),
    '⭐ `_lzPersistScans` filtra na montagem do lote, antes de gravar');

  const save = fonte.slice(fonte.indexOf('function _saveScansAndReload'));
  const okSave = save.slice(0, save.indexOf('var failed'));
  ok(/_lzNaoEhEuMesmo\(s\.uid\)/.test(okSave),
    '⭐ `_saveScansAndReload` filtra na montagem do lote, antes de persistir/arquivar/pintar');
}

console.log('── a rota residual não monta o próprio uid como alvo ──');
{
  const i = fonte.indexOf('var targets = (rows || []).filter');
  const bloco = fonte.slice(i, i + 500);
  ok(/_lzNaoEhEuMesmo\(r\.uid\)/.test(bloco),
    '⭐ a montagem de alvos exclui o uid do solicitante');
}

console.log('── a guarda vem ANTES de segurar a aba ──');
{
  const i = fonte.indexOf('window._lzAthleteImport = function (uid)');
  const corpo = fonte.slice(i, i + 900);
  const iGuarda = corpo.indexOf('_lzNaoEhEuMesmo');
  const iAba = corpo.indexOf('_lzSegurarAba(true)');
  ok(iGuarda > 0 && iAba > 0 && iGuarda < iAba,
    '⭐ a guarda vem ANTES de `_lzSegurarAba` — senão a aba ficaria presa numa ação recusada');
  ok(/categoria vem do seu perfil/i.test(corpo),
    'e a pessoa recebe o motivo, em vez de um erro de permissão');
}

console.log('\n── o predicado, no comportamento ──');
{
  // Reproduz a definição do arquivo, sem carregar a view inteira (ela exige o app).
  const win = { AppStore: { currentUser: { uid: 'eu' } } };
  const naoEhEuMesmo = (uid) => {
    const meu = (win.AppStore && win.AppStore.currentUser && win.AppStore.currentUser.uid) || null;
    return !!uid && (!meu || String(uid) !== String(meu));
  };
  ok(naoEhEuMesmo('outro') === true, 'outro uid passa');
  ok(naoEhEuMesmo('eu') === false, '⭐ o próprio uid NÃO passa');
  ok(naoEhEuMesmo('') === false, 'uid vazio não passa');
  ok(naoEhEuMesmo(null) === false, 'uid nulo não passa');
  win.AppStore.currentUser = null;
  ok(naoEhEuMesmo('outro') === true, 'sem sessão, não bloqueia ninguém (a Rule decide)');
}

if (fail) {
  console.error('\n❌ letzplay-ninguem-varre-a-si-mesmo: ' + pass + ' ok, ' + fail + ' falharam');
  process.exit(1);
}
console.log('\n✅ letzplay-ninguem-varre-a-si-mesmo: ' + pass + ' ok');
