/* "CO-ORGANIZADOR(A)" PARA QUEM TEM GÊNERO DECLARADO — A REGRESSÃO QUE VOLTA.
 *
 * Relato do dono (17/ago/2026, com print da Confra): _"e volta a regressão das
 * organizador(a) quando temos o gênero delas. tem como parar de regredir essa merda?"_
 * Na tela: Kelly Barth, Raquel Unger e FABIANA VIEIRA como **Co-organizador(a)**.
 *
 * MEDIDO na base: as três têm `gender:'feminino'` em `users/{uid}`, e as três estão em
 * `participants` E em `memberUids` do torneio. Ou seja: o DADO sempre esteve lá, e a regra
 * de português (`_genderWord`) sempre esteve certa. Já foi "consertado" antes — e voltou.
 *
 * A CAUSA NUNCA FOI A REGRA. É TEMPO:
 *   1. os cards da ORGANIZAÇÃO são montados como STRING, síncronos, lendo `_genderForUid`
 *      no `_userProfileCache`;
 *   2. o cache só é preenchido DEPOIS (`_preloadUserProfiles`, disparado pelo próprio
 *      render) → na abertura FRIA o gênero ainda não existe → sai a forma neutra;
 *   3. o `_softRefreshView()` que corrigiria morre no gate de assinatura do detalhe
 *      (`_tournamentDetailSig`): o TORNEIO não mudou, só o cache esquentou.
 *
 * Por isso ela "volta sozinha": quem confere numa REVISITA (cache quente) vê certo, e quem
 * abre do zero vê errado. Nenhum teste que só exercite `_genderWord` pega isso.
 *
 * O NOME nunca sofreu do mesmo mal porque não depende do render: é hidratado no DOM depois,
 * por uid. O INVARIANTE que este arquivo passa a guardar:
 *
 *   ⚠️ RÓTULO QUE DEPENDE DE PERFIL NÃO PODE SER TEXTO CONGELADO NO RENDER.
 *      Ele declara de QUEM fala (`data-uid-role`) e as duas formas (`data-role-m` /
 *      `data-role-f`), e se corrige quando o perfil chega — sem depender de re-render,
 *      de gate de assinatura ou de o cache estar quente.
 *
 * Forma nova de congelar rótulo de gênero entra NESTE arquivo.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const STORE = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const TOURN = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

console.log('\n== O rótulo de papel se cura sozinho (Co-organizadora) ==');

// ── As funções REAIS do store.js, extraídas por casamento de chaves ─────────────
// Não é réplica: o corpo vem do arquivo servido. Se ele mudar de forma, quebra aqui.
function extrairFuncao(src, assinatura) {
  const ini = src.indexOf(assinatura);
  if (ini < 0) return null;
  let i = src.indexOf('{', ini), nivel = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') nivel++;
    else if (c === '}') { nivel--; if (nivel === 0) return src.slice(ini, j + 1) + ';'; }
  }
  return null;
}

const srcGW = extrairFuncao(STORE, 'window._genderWord = function');
const srcHyd = extrairFuncao(STORE, 'window._hydrateUidNames = function');
ok(!!srcGW, '_genderWord foi extraída do store.js');
ok(!!srcHyd, '_hydrateUidNames foi extraída do store.js');

const W = {};
W.window = W; W.globalThis = W; W.console = console;
W._userProfileCache = {};
W._profileNameByUid = {};
W._preloadUserProfiles = function (uids) {
  // O preload REAL vai ao Firestore; aqui ele só "esquenta" o que o teste mandou existir.
  (uids || []).forEach(function (u) { if (W._perfisNoServidor[u]) W._userProfileCache[u] = W._perfisNoServidor[u]; });
  return Promise.resolve();
};
W._perfisNoServidor = {};
W._nameForUid = function (u) { const p = W._userProfileCache[u]; return (p && p.displayName) || ''; };
W._genderForUid = function (u) { const p = u && W._userProfileCache[u]; return (p && p.gender) || ''; };
vm.createContext(W);
vm.runInContext(srcGW, W, { filename: 'store.js:_genderWord' });
vm.runInContext(srcHyd, W, { filename: 'store.js:_hydrateUidNames' });

// ── DOM mínimo: só o que o hidratador toca ──────────────────────────────────────
function fakeEl(attrs, texto) {
  return {
    _a: attrs, textContent: texto,
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._a, k) ? this._a[k] : null; }
  };
}
function fakeRoot(els) {
  return {
    querySelectorAll(sel) {
      const chave = sel.replace(/[[\]]/g, '');
      const out = els.filter(e => Object.prototype.hasOwnProperty.call(e._a, chave));
      out.forEach = Array.prototype.forEach.bind(out);
      return out;
    }
  };
}

// ═══ 1) O CASO DO PRINT: abertura fria mostra neutro e SE CORRIGE sozinha ═══════
// ⚠️ Os cenários compartilham o cache de perfis, então rodam EM ORDEM (um `await` solto
// deixava o cenário 2 zerar o estado do 1 no meio — foi o que aconteceu na 1ª versão).
async function cenarioPrint() {
  const KELLY = 'OkQJOEkLMchgKYFZb8nLJm7nLPH2';
  const RODRIGO = 'B17n7JCXYOfqahlcLZ0fKxGGyUu1';
  W._perfisNoServidor = {
    [KELLY]: { displayName: 'Kelly Barth', gender: 'feminino' },
    [RODRIGO]: { displayName: 'Rodrigo Barth', gender: 'masculino' }
  };
  W._userProfileCache = {};   // <- ABERTURA FRIA: é este o estado do print

  // O que o render sincroniza hoje, com o cache vazio: forma neutra.
  const rotuloFrio = W._genderWord(W._genderForUid(KELLY), 'Co-organizador', 'Co-organizadora');
  ok(rotuloFrio === 'Co-organizador(a)', 'com cache frio o render produz a forma neutra (é o print do dono)');

  const elKelly = fakeEl({ 'data-uid-role': KELLY, 'data-role-m': 'Co-organizador', 'data-role-f': 'Co-organizadora' }, rotuloFrio);
  const elRodrigo = fakeEl({ 'data-uid-role': RODRIGO, 'data-role-m': 'Organizador', 'data-role-f': 'Organizadora' }, 'Organizador(a)');
  const elNome = fakeEl({ 'data-uid-name': KELLY }, '');

  await W._hydrateUidNames(fakeRoot([elKelly, elRodrigo, elNome]));

  ok(elKelly.textContent === 'Co-organizadora', 'depois que o perfil chega, o rótulo vira Co-organizadora SEM re-render (veio "' + elKelly.textContent + '")');
  ok(elRodrigo.textContent === 'Organizador', 'e o masculino vira Organizador (veio "' + elRodrigo.textContent + '")');
  ok(elNome.textContent === 'Kelly Barth', 'o nome continua hidratando no mesmo passo');
}

// ═══ 2) SEM GÊNERO CONHECIDO a neutra permanece — não inventar ══════════════════
async function cenarioSemGenero() {
  const SEMGEN = 'uid-sem-genero';
  W._perfisNoServidor = { [SEMGEN]: { displayName: 'Alguém', gender: '' } };
  W._userProfileCache = {};
  const el = fakeEl({ 'data-uid-role': SEMGEN, 'data-role-m': 'Co-organizador', 'data-role-f': 'Co-organizadora' }, 'Co-organizador(a)');
  await W._hydrateUidNames(fakeRoot([el]));
  ok(el.textContent === 'Co-organizador(a)', 'perfil sem gênero → segue neutro (o app não chuta)');
}

// ═══ 3) O ELEMENTO PRECISA DECLARAR O UID — senão nada disso alcança ════════════
// Esta é a asserção que impede a regressão de voltar por um caminho novo: não basta o
// hidratador existir, o card tem que MARCAR o rótulo.
(function () {
  const ini = TOURN.indexOf('function _buildOrgCard');
  ok(ini > 0, '_buildOrgCard existe em tournaments.js');
  const bloco = TOURN.slice(ini, ini + 6000);
  ok(/data-uid-role/.test(bloco), 'o card de organização emite data-uid-role');
  ok(/data-role-m/.test(bloco) && /data-role-f/.test(bloco), 'e emite as DUAS formas (data-role-m / data-role-f)');

  // Os dois call sites passam uid + formas — organizador principal e cada co-host.
  const chamadas = TOURN.match(/_buildOrgCard\([^;]*?\);/g) || [];
  const comPapel = chamadas.filter(c => /'Organizador'|'Co-organizador'/.test(c));
  ok(comPapel.length >= 2, 'os dois call sites (organizador e co-host) passam as formas — achei ' + comPapel.length);
  ok(comPapel.some(c => /'Co-organizador'\s*,\s*'Co-organizadora'/.test(c)), 'o co-host passa Co-organizador/Co-organizadora');
  ok(comPapel.some(c => /'Organizador'\s*,\s*'Organizadora'/.test(c)), 'o organizador passa Organizador/Organizadora');
})();

// ═══ 4) POR QUE NÃO DÁ PRA CONFIAR NO RE-RENDER (o que fez voltar 2 vezes) ══════
// O `_softRefreshView` do detalhe do torneio só re-renderiza quando a ASSINATURA do
// torneio muda. Cache de perfil esquentando não muda assinatura nenhuma — então a
// correção não pode depender dele. Esta asserção documenta o gate pra quem vier depois.
(function () {
  const i = STORE.indexOf("_currentView === 'tournaments'");
  ok(i > 0, 'o gate de assinatura do detalhe existe no store.js');
  const bloco = STORE.slice(i, i + 700);
  ok(/_tournamentDetailSig/.test(bloco) && /return;/.test(bloco),
    'e ele RETORNA sem renderizar quando a assinatura não muda — por isso o rótulo tem que se curar sozinho');
})();

(async function main() {
  await cenarioPrint();
  await cenarioSemGenero();
  console.log('\n✅ ' + pass + ' asserções ok, ' + fail + ' falha(s)');
  process.exit(fail ? 1 : 0);
})();
