#!/usr/bin/env node
/* ⛔ O BACKEND FOI PUBLICADO DEPOIS DA ÚLTIMA MUDANÇA NELE?
 *
 * ⛔ POR QUE ESTA TRAVA EXISTE. `deploy-hosting.sh` publica SÓ o Hosting. Quando a leva mexe em
 * `firestore.rules` ou no codebase do sorteio, publicar só a web põe no ar uma tela que conversa
 * com uma regra e um servidor VELHOS — e o defeito aparece como "funciona no meu, não no ar", sem
 * ninguém ligar ao deploy.
 *
 * ⛔ E POR QUE NÃO PUBLICAR O BACKEND DE DENTRO DO PUBLICADOR: isso derrubaria o ensaio do
 * preflight (`tests/preflight-antes-do-push.test.js`), que roda o script com um `firebase` falso
 * para provar que o push vem ANTES do upload. Essa garantia vale mais.
 *
 * ⭐ ENTÃO É CARIMBO, o mesmo idioma de `.rules-testadas`: quem publica escreve o SHA publicado em
 * `.backend-publicado`; esta trava compara com o último commit que TOCOU o backend. Carimbo velho
 * ⇒ aborta. ⚠️ Ela não prova que o deploy funcionou — prova que ele foi FEITO depois da mudança;
 * quem prova o resto é o próprio deploy, que aborta em erro.
 *
 * Uso:  node scripts/check-backend-publicado.js            (confere)
 *       node scripts/check-backend-publicado.js --carimbar (grava o SHA atual)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { autodrawExports, checkTargetedPublication } = require('./backend-publication-core');
const RAIZ = path.join(__dirname, '..');
/* ⛔ UM CARIMBO POR ESCOPO. Um carimbo único era furado: qualquer execução do publicador de
 * Functions — inclusive `--dry-run` ou o codebase `main` — o gravava, e ele passava a "provar" que
 * as Rules e o sorteio foram publicados. Carimbo que prova o que não aconteceu é pior que nenhum.
 * Cada escopo tem o seu, e cada um só é gravado pelo deploy REAL daquele escopo. */
const ESCOPOS = {
  rules: { carimbo: '.backend-publicado-rules', caminhos: ['firestore.rules'] },
  autodraw: { carimbo: '.backend-publicado-autodraw', caminhos: ['functions-autodraw'] },
};

const git = (args) => execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8' }).trim();
const receiptPath = path.join(RAIZ, '.backend-publicado-autodraw-funcoes.json');
const manifestPath = path.join(RAIZ, '.backend-requerido-autodraw.json');
const exportsAutodraw = () => autodrawExports(fs.readFileSync(path.join(RAIZ, 'functions-autodraw/index.js'), 'utf8'));
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; } };

const iCarimbar = process.argv.indexOf('--carimbar');
const escopoPedido = iCarimbar !== -1 ? String(process.argv[iCarimbar + 1] || '') : '';
if (iCarimbar !== -1 && !ESCOPOS[escopoPedido]) {
  console.error('✗ --carimbar exige o ESCOPO: rules | autodraw');
  process.exit(1);
}

function ultimoDe(caminhos) {
  try { return git(['log', '-1', '--format=%H', '--'].concat(caminhos)); } catch (e) { return null; }
}

// O codebase autodraw não envia `test-*.js` (ver firebase.json). Um teste novo
// precisa passar na revisão, mas não altera o artefato publicado; tratá-lo como
// backend pendente obriga um redeploy caro de 100 funções e cria um carimbo que
// afirma uma necessidade inexistente. Todo arquivo que pode entrar no bundle
// continua exigindo deploy, inclusive vendor, package e firebase.json.
function ultimoAutodrawImplantavel() {
  let commits;
  try { commits = git(['log', '--format=%H', '--', 'functions-autodraw']).split('\n').filter(Boolean); }
  catch (e) { return null; }
  for (const sha of commits) {
    let changed = [];
    try { changed = git(['diff-tree', '--no-commit-id', '--name-only', '-r', sha]).split('\n').filter(Boolean); }
    catch (e) { continue; }
    if (changed.some((file) => file.startsWith('functions-autodraw/') &&
      !/^functions-autodraw\/test-[^/]+\.js$/.test(file))) return sha;
  }
  return '';
}

function ultimoDoEscopo(nome, caminhos) {
  return nome === 'autodraw' ? ultimoAutodrawImplantavel() : ultimoDe(caminhos);
}

if (iCarimbar !== -1) {
  const e = ESCOPOS[escopoPedido];
  const sha = ultimoDoEscopo(escopoPedido, e.caminhos);
  if (!sha) { console.log('⚠️ sem git/mudança aqui — nada a carimbar em ' + escopoPedido + '.'); process.exit(0); }
  fs.writeFileSync(path.join(RAIZ, e.carimbo), sha + '\n');
  console.log('✓ carimbado (' + escopoPedido + '): publicado em ' + sha.slice(0, 8));
  process.exit(0);
}

// Chamado exclusivamente após um lote --only terminar com exit 0 no publicador.
// Não escreve o carimbo integral: um recibo por função não declara que as demais
// 100 callables foram atualizadas. O arquivo é versionado antes do Hosting.
if (process.argv[2] === '--registrar-funcoes') {
  if (process.env.SP_DEPLOY_CONFIRMED !== '1') {
    console.error('✗ recibo exige lote confirmado pelo publicador'); process.exit(1);
  }
  const raw = String(process.argv[3] || '');
  const names = raw.split(',').map(target => target.replace(/^functions:/, ''));
  const exported = exportsAutodraw();
  if (!raw || new Set(names).size !== names.length || names.some(name => !exported.has(name))) {
    console.error('✗ recibo contém função inexistente ou repetida'); process.exit(1);
  }
  const sha = ultimoAutodrawImplantavel();
  if (!sha) { console.error('✗ SHA de autodraw indisponível'); process.exit(1); }
  const old = readJson(receiptPath);
  const entries = old && old.schema === 1 && old.entries && typeof old.entries === 'object' ? old.entries : {};
  const deployedAt = new Date().toISOString();
  names.forEach(name => { entries[name] = { backendCommit:sha, deployedAt, result:'success', mode:'only' }; });
  const temp = receiptPath + '.tmp-' + process.pid;
  fs.writeFileSync(temp, JSON.stringify({ schema:1, entries }, null, 2) + '\n');
  fs.renameSync(temp, receiptPath);
  console.log('✓ recibo direcionado: ' + names.join(', ') + ' (' + sha.slice(0, 8) + ')');
  process.exit(0);
}

let falhou = false;
Object.keys(ESCOPOS).forEach((nome) => {
  const e = ESCOPOS[nome];
  const ultimo = ultimoDoEscopo(nome, e.caminhos);
  if (ultimo === null) { console.log('⚠️ sem git aqui — ' + nome + ' não conferido.'); return; }
  if (!ultimo) { console.log('✓ ' + nome + ' nunca mudou neste repositório.'); return; }
  const arq = path.join(RAIZ, e.carimbo);
  const carimbado = fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').trim() : '';
  /* ⚠️ SEM CARIMBO NENHUM ela AVISA, não bloqueia: árvore recém clonada (ou o repositório de
   * mentira do ensaio do preflight) nunca teve carimbo, e reprovar ali seria acusar ausência de
   * histórico em vez de backend atrasado. A partir do primeiro carimbo ela morde. */
  /* ⛔ SEM CARIMBO, COM HISTÓRICO: ABORTA. A versão anterior desta trava apenas AVISAVA, e isso é
   * falha ABERTA — árvore sem carimbo publicaria tela nova contra backend de idade desconhecida.
   * ⚠️ O caso tolerado é o de cima (`ultimo` vazio): caminho que nunca existiu nesta árvore, que é
   * o repositório de mentira do ensaio do preflight. Aí não há o que publicar. */
  if (!carimbado) {
    console.error('\n✗ ' + nome.toUpperCase() + ': SEM CARIMBO de publicação, e o caminho tem histórico.');
    console.error('  última mudança: ' + ultimo.slice(0, 8));
    falhou = true;
    return;
  }
  if (carimbado === ultimo) { console.log('✓ ' + nome + ' publicado (' + ultimo.slice(0, 8) + ')'); return; }
  /* O carimbo pode estar num DESCENDENTE: quem publicou e depois só mexeu na web. */
  let jaContem = false;
  try { git(['merge-base', '--is-ancestor', ultimo, carimbado]); jaContem = true; } catch (e2) { jaContem = false; }
  if (jaContem) { console.log('✓ ' + nome + ' publicado (carimbo ' + carimbado.slice(0, 8) + ' já contém)'); return; }
  if (nome === 'autodraw') {
    const result = checkTargetedPublication(readJson(manifestPath), readJson(receiptPath), ultimo, exportsAutodraw());
    if (result.ok) {
      console.log('✓ autodraw direcionado — VERIFICADAS: ' + result.verified.join(', '));
      console.log('  NÃO verificadas neste corte: ' + result.unverified + ' funções do codebase');
      return;
    }
    console.error('  recibo direcionado recusado: ' + result.reason);
  }
  console.error('\n✗ ' + nome.toUpperCase() + ' MUDOU E NÃO FOI PUBLICADO.');
  console.error('  última mudança: ' + ultimo.slice(0, 8) + '   ·   carimbo: ' + carimbado.slice(0, 8));
  falhou = true;
});
if (falhou) {
  console.error('\n  Publique nesta ordem e carimbe cada escopo:');
  console.error('    scripts/deploy-rules.sh');
  console.error('    scripts/deploy-functions.sh autodraw   (carimba autodraw sozinho)\n');
  process.exit(1);
}
process.exit(0);
