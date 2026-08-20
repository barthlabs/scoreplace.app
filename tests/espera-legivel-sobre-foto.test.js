/* ⏳ LISTA DE ESPERA — a caixa tem que dar leitura, inclusive sobre a foto do local
 *   node tests/espera-legivel-sobre-foto.test.js
 *
 * RELATO DO DONO (15/ago/2026, com print do card do Confra):
 *   "essa lista de espera não está dando leitura, especialmente quando há foto no torneio."
 *
 * O QUE A LEITURA DO CÓDIGO MOSTROU — o defeito não era a cor, era a DIVERGÊNCIA:
 * a caixa "Lista de Espera" existia DUAS vezes, montada em dois lugares diferentes:
 *
 *   (1) no template do card (`renderTournamentCard`), que aplicava a tarja de leitura
 *       (`_photoReadBox()` + `backdrop-filter:blur`) quando o torneio tem foto do local;
 *   (2) à mão dentro de `_updateStatBoxes`, o caminho que INSERE a caixa quando a fila
 *       deixa de estar vazia — e esse NÃO aplicava tarja nenhuma:
 *       `background: rgba(251,191,36,0.12)`, ou seja quase transparente, com número
 *       âmbar por cima da foto.
 *
 * Como a caixa nasce e some conforme a fila enche/esvazia, quem aparecia na tela na
 * prática era quase sempre a versão (2), a SEM tarja. Por isso o sintoma era
 * intermitente e "especialmente com foto".
 *
 * INVARIANTES CONGELADOS AQUI:
 *   A. existe UMA fonte só do markup da caixa (`_waitlistStatBoxHtml`/`_waitlistStatBoxStyle`);
 *   B. com foto, a caixa recebe a tarja opaca + blur — nunca o fundo quase transparente;
 *   C. com foto, o âmbar CLAREIA e ganha sombra (o #fbbf24 é calibrado pra fundo escuro);
 *   D. sem foto, nada muda em relação ao que já estava no ar (zero regressão);
 *   E. o caminho DINÂMICO e o ESTÁTICO produzem markup IDÊNTICO — é a volta do bug.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments.js'), 'utf8');

// Carrega os helpers REAIS extraídos do arquivo (não uma réplica).
const W = {};
['_waitlistStatBoxHtml', '_waitlistStatBoxStyle', '_statRowPhoto'].forEach(function (nome) {
  const marca = 'window.' + nome + ' = function';
  const i = SRC.indexOf(marca);
  if (i < 0) throw new Error(nome + ' não encontrada em tournaments.js');
  const fim = SRC.indexOf('\n};', i);
  if (fim < 0) throw new Error('fim de ' + nome + ' não encontrado');
  new Function('window', SRC.slice(i, fim + 3))(W);
});

// A tarja que `_photoReadBox()` devolve no tema escuro (o valor real do app).
const FOTO = { bg: 'rgba(0,0,0,0.60)', fg: '#e2e8f0', border: 'rgba(255,255,255,0.12)' };

// ═══════════════════════════════════════════════════════════════════════════
// A. UMA FONTE SÓ
// ═══════════════════════════════════════════════════════════════════════════
ok(SRC.indexOf('window._waitlistStatBoxHtml = function') !== -1,
  'A1. o markup da caixa mora num helper único');
// o texto do rótulo só pode ser escrito UMA vez no arquivo inteiro — se voltar a
// aparecer duas vezes, alguém recriou a segunda cópia e o bug volta com ela.
const nRotulo = (SRC.match(/>Lista de Espera</g) || []).length;
ok(nRotulo === 1,
  'A2. "Lista de Espera" é escrito UMA vez no arquivo (a 2ª cópia era o bug) — vi ' + nRotulo);
// ...e o caminho DINÂMICO (o que inseria a caixa sem tarja) tem que passar pelo helper.
// ⚠️ Sonda estreita de propósito: `rgba(251,191,36,0.12)` também aparece num CTA sem
// relação (`visitor-closed-cta`) e no comentário acima — contar o arquivo inteiro
// mediria outra coisa.
const iUpd = SRC.indexOf('window._updateStatBoxes = function');
const corpoUpd = SRC.slice(iUpd, SRC.indexOf('\n};', iUpd));
ok(corpoUpd.indexOf('window._waitlistStatBoxHtml(') !== -1 &&
   corpoUpd.indexOf('window._waitlistStatBoxStyle(') !== -1,
  'A3. o caminho dinâmico monta a caixa PELO helper — era ele que a inseria sem tarja');
ok(corpoUpd.indexOf('Lista de Espera') === -1 && corpoUpd.indexOf('rgba(251,191,36,0.12)') === -1,
  'A4. o caminho dinâmico não tem mais markup próprio da caixa');

// ═══════════════════════════════════════════════════════════════════════════
// B/C. COM FOTO — tarja opaca + âmbar mais claro
// ═══════════════════════════════════════════════════════════════════════════
const estiloFoto = W._waitlistStatBoxStyle(FOTO);
const htmlFoto = W._waitlistStatBoxHtml(3, FOTO);
ok(estiloFoto.indexOf('rgba(0,0,0,0.60)') !== -1,
  'B1. com foto, a caixa usa a tarja opaca de leitura');
// 1.9.83 — A ASSERÇÃO VIROU O CONTRÁRIO, e o motivo é medição: `backdrop-filter`
// no WKWebView re-desfoca a região a CADA QUADRO e tira a rolagem da GPU. No
// iPhone do dono isso apareceu como travadas de ~1s por quadro com NENHUM JS
// rodando (builds 78-82 já tinham eliminado timers, snapshots e renders pelo
// rastro nomeado) — "scroll morto e travando no começo". O desfoque saiu de TODAS
// as telas; quem garante a leitura sobre a foto é a TARJA (rgba(0,0,0,0.60)),
// cuja cor NÃO muda (outros seletores do CSS casam por ela).
ok(estiloFoto.indexOf('backdrop-filter') === -1,
  'B2. com foto, a caixa NÃO usa backdrop-filter (mata o scroll no iOS) — a tarja basta');
ok(estiloFoto.indexOf('rgba(251,191,36,0.12)') === -1,
  'B3. O BUG DO RELATO: com foto, o fundo quase transparente NÃO é usado');
ok(htmlFoto.indexOf('#fcd34d') !== -1 && htmlFoto.indexOf('#fbbf24') === -1,
  'C1. com foto o âmbar clareia (#fcd34d) — o #fbbf24 é calibrado pra fundo escuro');
ok((htmlFoto.match(/text-shadow/g) || []).length === 3,
  'C2. com foto, ícone, número e rótulo ganham sombra (os três, senão um deles some)');
ok(htmlFoto.indexOf('>3<') !== -1, 'C3. a contagem aparece');

// ═══════════════════════════════════════════════════════════════════════════
// D. SEM FOTO — nada muda
// ═══════════════════════════════════════════════════════════════════════════
const estiloSem = W._waitlistStatBoxStyle(null);
const htmlSem = W._waitlistStatBoxHtml(3, null);
ok(estiloSem.indexOf('rgba(251,191,36,0.12)') !== -1,
  'D1. sem foto, o fundo âmbar translúcido de sempre');
ok(estiloSem.indexOf('backdrop-filter') === -1,
  'D2. sem foto não há o que embaçar');
ok(htmlSem.indexOf('#fbbf24') !== -1 && htmlSem.indexOf('#fcd34d') === -1,
  'D3. sem foto o âmbar original — zero regressão pra quem não tem foto de local');
ok(htmlSem.indexOf('text-shadow') === -1,
  'D4. sem foto não há sombra (seria sujeira sobre fundo chapado)');

// ═══════════════════════════════════════════════════════════════════════════
// E. OS DOIS CAMINHOS PRODUZEM O MESMO — a volta do bug
// ═══════════════════════════════════════════════════════════════════════════
// O caminho dinâmico lê a tarja do DOM (data-* na linha das caixas); o estático usa a
// variável do render. Alimentados com a MESMA tarja, têm que sair idênticos.
const rowFake = {
  _a: { 'data-photo-bg': FOTO.bg, 'data-photo-fg': FOTO.fg, 'data-photo-bd': FOTO.border },
  getAttribute: function (k) { return this._a[k] || null; }
};
const doDom = W._statRowPhoto(rowFake);
ok(doDom && doDom.bg === FOTO.bg,
  'E1. o caminho dinâmico recupera a tarja gravada na linha das caixas');
ok(W._waitlistStatBoxStyle(doDom) === estiloFoto && W._waitlistStatBoxHtml(3, doDom) === htmlFoto,
  'E2. dinâmico e estático produzem markup IDÊNTICO (a divergência ERA o bug)');
const rowSemFoto = { getAttribute: function () { return null; } };
ok(W._statRowPhoto(rowSemFoto) === null,
  'E3. sem foto no torneio, o caminho dinâmico não inventa tarja');
ok(W._statRowPhoto(null) === null,
  'E4. sem a linha no DOM, devolve null em vez de estourar');

// e o render tem que GRAVAR a tarja na linha — sem isso o dinâmico nunca a acha
ok(/id="stat-boxes-row"[^>]*data-photo-bg=/.test(SRC),
  'E5. o render grava a tarja na própria linha das caixas (é daí que o dinâmico lê)');

console.log('\n⏳ LISTA DE ESPERA — legível sobre a foto do local');
console.log('   ' + pass + ' ok, ' + fail + ' falhas');
if (fail) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
console.log('   ✅ tudo verde');
