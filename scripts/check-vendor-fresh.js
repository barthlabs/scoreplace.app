#!/usr/bin/env node
/* check-vendor-fresh.js — trava de teste: o `vendor/` do autoDraw tem que ser BYTE A BYTE
 * igual ao `js/views/` do app.
 *
 * POR QUE ISTO EXISTE (23/ago/2026, medido):
 * `functions-autodraw/vendor/` é cópia de `js/views/*` feita por `copy-vendor.js`, e quem
 * roda o copy é o PREDEPLOY (`scripts/deploy-functions.sh autodraw`). Entre um deploy e
 * outro o vendor fica velho — e 52 arquivos de teste carregam o servidor por `draw-core.js`,
 * que dá `require()` no VENDOR, não no fonte. Ou seja: a suíte exercita a cópia congelada.
 *
 * O que aconteceu: mudei identity-core.js/bracket-logic.js/bracket-ui.js, rodei `npm test`
 * → 435/435 VERDE. Rodei o deploy da CF (que re-sincroniza o vendor) e, com o vendor
 * fresco, 12 suítes quebraram NA HORA — entre elas late-entry-idempotent,
 * late-dupla-pow2-grow, e2e-form-pair, classificatory-phase-sweep e
 * functions-autodraw/test-integrate-late. O gate estava verde sobre código que o servidor
 * nem tinha.
 *
 * A escala do problema, medida no histórico: nos últimos 45 dias, 737 de 1296 commits
 * (57%) tinham vendor velho, e um dia ativo típico mexe em 4-5 dos 19 arquivos da lista.
 * Ou seja, o estado NORMAL do repo era testar a cópia errada. Por isso é trava, não aviso:
 * aviso que não barra é aviso que se ignora — foi assim que as 12 suítes passaram.
 *
 * O custo diário disso é ZERO porque o `pre-commit` (scripts/hooks/pre-commit) roda o
 * copy-vendor sozinho e põe o vendor DENTRO do commit — mesmo padrão do prerender.
 *
 * Uso:  node scripts/check-vendor-fresh.js
 *       node scripts/check-vendor-fresh.js --root /caminho/de/uma/arvore   (usado no teste)
 * Sai 1 (e diz quais arquivos) se algo divergir.
 */
const fs = require('fs');
const path = require('path');

const argRoot = process.argv.indexOf('--root');
const root = path.resolve(argRoot !== -1 && process.argv[argRoot + 1]
  ? process.argv[argRoot + 1]
  : path.join(__dirname, '..'));

const COPY_VENDOR = path.join(root, 'functions-autodraw', 'copy-vendor.js');
const SRC_DIR = path.join(root, 'js', 'views');
const VENDOR_DIR = path.join(root, 'functions-autodraw', 'vendor');
const RECEITA = 'node functions-autodraw/copy-vendor.js';

const fail = [];

// ── A lista sai do PRÓPRIO copy-vendor.js ────────────────────────────────────────────
// Nunca duplicar a lista aqui: lista duplicada envelhece e a trava passa a conferir um
// conjunto que não é o que sobe pro servidor — que é o mesmo tipo de mentira que ela
// existe pra impedir.
//
// ⚠️ Ler por TEXTO, não por `require()`: dar require no copy-vendor.js EXECUTA a cópia.
// A trava "consertaria" a divergência sozinha, sairia verde, e ninguém saberia que o
// vendor commitado está velho.
function lerFilesDoCopyVendor(fonte) {
  const bloco = fonte.match(/const\s+FILES\s*=\s*\[([\s\S]*?)^\];/m);
  if (!bloco) return null;
  const nomes = [];
  for (const linha of bloco[1].split('\n')) {
    const semComentario = linha.replace(/\/\/.*$/, '');
    for (const m of semComentario.matchAll(/'([^']+)'|"([^"]+)"/g)) nomes.push(m[1] || m[2]);
  }
  return nomes;
}

if (!fs.existsSync(COPY_VENDOR)) {
  console.error('\n✗ check-vendor-fresh FALHOU:\n');
  console.error('  • não achei ' + path.relative(root, COPY_VENDOR) + ' — é ele que define a lista.\n');
  process.exit(1);
}

const FILES = lerFilesDoCopyVendor(fs.readFileSync(COPY_VENDOR, 'utf8'));

/* ⭐ A SEGUNDA FONTE DO VENDOR (2.1.30): ele não vem só de `js/views/`.
 * `match-roster.js` viaja de `functions/` — é ele que monta o subdoc
 * `tournaments/{id}/results/{matchId}`, e agora as DUAS pontas de servidor gravam esse
 * subdoc. Reescrevê-lo no autoDraw seria a segunda cópia de um formato, que é
 * exatamente o defeito que esta trava existe pra impedir.
 * ⚠️ Sem lê-la, o arquivo cai como ÓRFÃO e a trava reprova um vendor CORRETO — e trava
 * que reprova sem defeito ensina a ignorar trava. */
function lerListaNomeada(fonte, nome) {
  const bloco = fonte.match(new RegExp('const\\s+' + nome + '\\s*=\\s*\\[([^\\]]*)\\]'));
  if (!bloco) return [];
  const nomes = [];
  for (const m of bloco[1].matchAll(/'([^']+)'|"([^"]+)"/g)) nomes.push(m[1] || m[2]);
  return nomes;
}
const DE_FUNCTIONS = lerListaNomeada(fs.readFileSync(COPY_VENDOR, 'utf8'), 'DE_FUNCTIONS');

// Sanidade da própria trava: renomear/reformatar o `const FILES` no copy-vendor.js faria a
// leitura voltar vazia e a trava passar a conferir NADA — verde sobre zero arquivo. Uma
// trava que não sabe o que confere é decoração.
if (!FILES || FILES.length === 0) {
  console.error('\n✗ check-vendor-fresh FALHOU:\n');
  console.error('  • não consegui ler a lista `const FILES = [...]` de functions-autodraw/copy-vendor.js.\n' +
    '    Sem a lista eu não confiro NADA — e sair verde aqui seria pior que falhar.\n' +
    '    Se o formato da lista mudou, ajuste lerFilesDoCopyVendor() neste arquivo.\n');
  process.exit(1);
}

// ── A comparação ─────────────────────────────────────────────────────────────────────
function primeiraLinhaDiferente(a, b) {
  const la = a.split('\n'), lb = b.split('\n');
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) if (la[i] !== lb[i]) return i + 1;
  return null;
}

const divergentes = [];
for (const f of FILES) {
  const src = path.join(SRC_DIR, f);
  const dst = path.join(VENDOR_DIR, f);
  if (!fs.existsSync(src)) {
    fail.push('js/views/' + f + ': FONTE AUSENTE — está na lista do copy-vendor.js e não existe.');
    continue;
  }
  if (!fs.existsSync(dst)) {
    divergentes.push({ f, motivo: 'não existe no vendor/ (nunca foi copiado)' });
    continue;
  }
  const a = fs.readFileSync(src);
  const b = fs.readFileSync(dst);
  if (a.equals(b)) continue;
  const linha = primeiraLinhaDiferente(a.toString('utf8'), b.toString('utf8'));
  divergentes.push({
    f,
    motivo: 'diverge' + (linha ? ' a partir da linha ' + linha : '') +
      ' (fonte ' + a.length + ' bytes, vendor ' + b.length + ' bytes)'
  });
}

// Arquivo que saiu da lista mas continua no vendor/: o copy-vendor só COPIA, nunca apaga.
// Se o draw-core.js ainda der require nele, o servidor roda um arquivo que o app já não
// tem — drift na direção contrária, e igualmente silencioso.
if (fs.existsSync(VENDOR_DIR)) {
  const naLista = new Set(FILES.concat(DE_FUNCTIONS));
  // E o que vem de `functions/` também é conferido byte a byte — divergir ali é ter
  // duas cópias do formato do subdoc, que é o defeito que essa lista veio evitar.
  for (const f of DE_FUNCTIONS) {
    const src = path.join(root, 'functions', f);
    const dst = path.join(VENDOR_DIR, f);
    /* ⚠️ Fonte E cópia ausentes = árvore que simplesmente não usa este arquivo, e isso
     * NÃO é defeito: o meta-teste desta trava monta um `js/views/` + `vendor/` de mentira,
     * sem `functions/`, e reprovar ali faria a trava acusar defeito onde não há. Defeito é
     * uma existir sem a outra. */
    const temSrc = fs.existsSync(src), temDst = fs.existsSync(dst);
    if (!temSrc && !temDst) continue;
    if (!temSrc) { fail.push('functions/' + f + ': FONTE AUSENTE, mas o vendor/ ainda tem a cópia.'); continue; }
    if (!temDst) { divergentes.push({ f: f, motivo: 'ausente no vendor/ (roda `node functions-autodraw/copy-vendor.js`)' }); continue; }
    if (fs.readFileSync(src, 'utf8') !== fs.readFileSync(dst, 'utf8')) {
      divergentes.push({ f: f, motivo: 'vendor/ diverge de functions/' + f });
    }
  }
  for (const nome of fs.readdirSync(VENDOR_DIR)) {
    if (!nome.endsWith('.js')) continue;
    if (naLista.has(nome)) continue;
    fail.push('functions-autodraw/vendor/' + nome + ': ÓRFÃO — não está mais na lista do\n' +
      '    copy-vendor.js, mas segue no vendor/. O copy só copia, nunca apaga. Se o\n' +
      '    draw-core.js ainda carrega esse arquivo, o servidor roda uma versão que o app\n' +
      '    já não tem. Apague o arquivo do vendor/ ou devolva o nome à lista.');
  }
}

if (divergentes.length) {
  fail.push('VENDOR VELHO — ' + divergentes.length + ' de ' + FILES.length + ' arquivo(s):\n' +
    divergentes.map((d) => '      · ' + d.f + ' — ' + d.motivo).join('\n') + '\n\n' +
    '    O `functions-autodraw/vendor/` é a cópia que o autoDraw (servidor) roda de\n' +
    '    verdade, e 52 suítes carregam ELA por draw-core.js — não o fonte. Com o vendor\n' +
    '    velho, o teste passa sem exercitar o código do servidor.\n\n' +
    '    RODE:  ' + RECEITA + '\n' +
    '    E commite o diff de functions-autodraw/vendor/ junto com a mudança.\n' +
    '    (Com os hooks ligados — scripts/install-hooks.sh — o pre-commit faz isso sozinho.)');
}

if (fail.length) {
  console.error('\n✗ check-vendor-fresh FALHOU:\n');
  fail.forEach((f) => console.error('  • ' + f + '\n'));
  process.exit(1);
}
console.log('✓ vendor do autoDraw em dia (' + FILES.length + ' arquivos idênticos a js/views/)');
