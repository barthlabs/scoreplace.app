/* NOME SEM LIXO DE ENCODING + FAIXA DA ESCALA COM FONTE ÚNICA
 * node tests/nome-e-escala-sem-lixo.test.js
 *
 * DOIS relatos do dono, na mesma leva:
 *
 * 1. "duvido que a pessoa tenha colocado esse + no proprio nome. como isso
 *    aconteceu." — print de "Juliana Dal+Sasso".
 *    MEDIDO no banco: o `+` está GRAVADO (displayName E displayName_lower), a conta
 *    nasceu por `apple.com`, e há um irmão do mesmo mal: "Juliana  Penha" (2 espaços).
 *    É a assinatura de `x-www-form-urlencoded`, onde ESPAÇO vira `+` — o encoding do
 *    fluxo web da Apple. A conversão acontece fora do nosso código; o que é nosso é
 *    gravar sem olhar.
 *
 * 2. "o slider do perfil esta inconsistente. ora da 130% como maximo, ora da 169%...
 *    tem que dar sempre 150% como maximo e o minimo pode ser 80%".
 *    A causa era a faixa morar em QUATRO lugares e DUAS unidades (store 0,8–1,7 ·
 *    slider 60–130 · theme.js 0,7–1,7 · base 1,3). No teto, 130% → 1,69 interno:
 *    quem dividia pela base lia "130%", quem não dividia lia "169%". Mesmo estado,
 *    contado de dois jeitos.
 *
 * O que este teste trava:
 *   • o `+` de encoding vira espaço, e o `+` LEGÍTIMO sobrevive (escopo estreito);
 *   • espaço duplo colapsa;
 *   • a faixa é declarada UMA vez, em percentual, e o resto DERIVA;
 *   • a conversão pct→escala→pct volta no mesmo número (era isso que não fechava);
 *   • ninguém volta a cravar min/max no HTML do slider nem no clamp do theme.js.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }

const raiz = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');
const store = ler('js/store.js');

// Carrega os helpers REAIS do store.js (não uma réplica: réplica já deixou suíte
// verde com o arquivo revertido — ver o cabeçalho dos test-*-core do functions/).
const sandbox = { window: {} };
function extrai(marcador, fim) {
  const a = store.indexOf(marcador);
  if (a === -1) throw new Error('não achei no store.js: ' + marcador);
  const b = store.indexOf(fim, a);
  return store.slice(a, b === -1 ? a + 4000 : b);
}
new Function('window', extrai('window._UI_PCT_MIN', 'window._getUiScale'))(sandbox.window);
const W = sandbox.window;

// ── 1. NOME: o lixo de encoding sai, o nome da pessoa fica ────────────────────
console.log('\n1. Nome de pessoa não guarda lixo de encoding');
{
  const N = W._normalizeDisplayName;
  ok(typeof N === 'function', 'o normalizador existe e é exportado');

  // O caso REAL que o dono viu, byte a byte como está no banco.
  ok(N('Juliana Dal+Sasso') === 'Juliana Dal Sasso',
     'o caso do print: "Juliana Dal+Sasso" → "Juliana Dal Sasso"');
  ok(N('Juliana  Penha') === 'Juliana Penha',
     'o irmão do mesmo mal: espaço duplo colapsa');
  ok(N('  Rodrigo Barth  ') === 'Rodrigo Barth', 'sobra nas pontas sai');

  // Acentuação e maiúsculas não podem ser tocadas — é NOME de gente.
  ok(N('Dėbora Castello') === 'Dėbora Castello',
     'caractere fora do ASCII (o ė da Dėbora) passa intacto');
  ok(N('Ana Paula dos Santos') === 'Ana Paula dos Santos', 'nome normal não é alterado');

  // ESCOPO ESTREITO: o `+` só cai quando está entre LETRAS (assinatura do encoding).
  ok(N('+55 11 98765-4321') === '+55 11 98765-4321',
     'telefone como nome sobrevive — `+` seguido de dígito NÃO é encoding');
  ok(N('Maria + João') === 'Maria + João',
     '`+` cercado de espaço é escolha da pessoa e fica');
  ok(N('C++') === 'C++', '`+` no fim fica');
  ok(N('+') === '+', '`+` sozinho fica');

  ok(N(null) === '' && N(undefined) === '', 'nulo/indefinido viram string vazia, não "null"');
}

// ── 2. O saneamento roda no CHOKE POINT, não nos call sites ───────────────────
console.log('\n2. Quem grava passa pelo saneamento');
{
  ok(/displayName:\s*\(typeof window\._normalizeDisplayName/.test(store),
     'saveUserProfileToFirestore (store.js) saneia o nome no payload');

  const db = ler('js/firebase-db.js');
  const bloco = db.slice(db.indexOf('toSave.displayName_lower') - 700, db.indexOf('toSave.displayName_lower') + 120);
  ok(/_normalizeDisplayName/.test(bloco),
     'saveUserProfile (firebase-db.js) saneia ANTES de derivar o displayName_lower');
  // Sem isto a BUSCA fica quebrada: o índice guardaria "juliana dal+sasso" e
  // ninguém acharia a pessoa digitando o nome dela.
  const iNorm = bloco.indexOf('_normalizeDisplayName');
  const iLower = bloco.indexOf('toSave.displayName_lower');
  ok(iNorm !== -1 && iNorm < iLower,
     'a ordem importa: saneia PRIMEIRO, deriva o _lower DEPOIS');
}

// ── 3. ESCALA: uma faixa só, declarada em percentual ──────────────────────────
console.log('\n3. A faixa da escala tem fonte única');
{
  ok(W._UI_PCT_MIN === 80 && W._UI_PCT_MAX === 150,
     'a faixa é 80%–150%, como o dono pediu');
  ok(Math.abs(W._UI_SCALE_MIN - 1.04) < 1e-9 && Math.abs(W._UI_SCALE_MAX - 1.95) < 1e-9,
     'os limites internos DERIVAM (1.04 e 1.95) — não são números soltos');

  // O defeito era exatamente este: o número não voltava igual.
  const voltaIgual = [80, 85, 100, 105, 125, 145, 150]
    .every(p => W._uiScaleToPct(W._uiPctToScale(p)) === p);
  ok(voltaIgual, 'pct → escala → pct devolve o MESMO número em toda a faixa');

  ok(W._uiScaleToPct(W._UI_SCALE_MAX) === 150,
     'o teto interno lido de volta dá 150% — nunca 130 nem 169');
  ok(W._uiScaleToPct(W._UI_SCALE_BASE) === 100, 'a base é o "100%" da pessoa');
}

// ── 4. Ninguém volta a cravar a faixa em outro lugar ──────────────────────────
console.log('\n4. A faixa não volta a ser duplicada');
{
  const auth = ler('js/views/auth.js');
  const slider = (auth.match(/<input type="range" id="profile-ui-scale"[^]{0,400}/) || [''])[0];
  ok(slider.length > 0, 'o slider do perfil existe');
  ok(/_UI_PCT_MIN/.test(slider) && /_UI_PCT_MAX/.test(slider),
     'o slider lê min/max das constantes');
  ok(!/min="\d+"\s+max="\d+"/.test(slider),
     'o slider NÃO tem min/max cravado no HTML (era daí que saía o 130)');

  const theme = ler('js/theme.js');
  ok(/MIN\s*=\s*1\.04/.test(theme) && /MAX\s*=\s*1\.95/.test(theme),
     'o clamp do theme.js usa a MESMA faixa (ele roda antes do store e não pode divergir)');
  ok(!/Math\.min\(1\.7,/.test(theme) && !/Math\.max\(0\.7,/.test(theme),
     'a faixa velha (0,7–1,7) saiu do theme.js — era a terceira versão do mesmo limite');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') +
  ' nome-e-escala-sem-lixo: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
