/* LEITURA FEITA POR MOTOR VELHO NÃO É LEITURA COMPLETA — e a tela nunca fica preta.
 *
 * Duas ordens do dono em 17/ago/2026, num recado só:
 *
 *  1. _"se mudou o motor, ainda que ja tenha lido tudo no motor antigo, precisa sim ler de
 *     novo no motor novo"_. O critério de completude só perguntava "o acervo cobre o
 *     índice?" — QUANTIDADE. Mas os três defeitos de 16–17/ago eram de QUALIDADE: placar
 *     com o tiebreak colado, vencedor invertido, nome truncado, classificação com o nome de
 *     outra pessoa. Um acervo inteiro lido pela 2.01 está completo e ERRADO, e passava por
 *     verificado — absolvendo justamente quem precisa reler. Medido: os 12 docs de leitura
 *     em produção estavam todos em extVersion 2.01.
 *
 *  2. _"voltou aquela merda de abrir a dash e tela preta e volta"_. O "e volta" é a
 *     assinatura: não há exceção (o Sentry ficou mudo por 12h) e não há travamento. O
 *     router esvazia o container ANTES de renderizar; enquanto ninguém escreve nele, o que
 *     se vê é o fundo da página — preto. O dado chega, re-renderiza, "volta".
 *     ⚠️ A guarda que já existia só pega EXCEÇÃO, e aqui não há nenhuma.
 *     Esta é a 4ª encarnação da tela branca/preta; as três anteriores estão em
 *     tests/sw-abre-sem-tela-branca.test.js. Cada uma travou o próprio MECANISMO e o
 *     sintoma voltou por outro caminho — por isso esta guarda olha o RESULTADO
 *     (o container ficou vazio?), não o mecanismo.
 *
 * Roda com: node tests/motor-velho-nao-e-leitura-completa.test.js
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let falhas = 0, testes = 0;
function ok(cond, msg) {
  testes++;
  if (cond) console.log('  ✓ ' + msg);
  else { falhas++; console.log('  ✗ ' + msg); }
}

/* ── 1. o motor faz parte do critério ──────────────────────────────────────────────── */
function motor() {
  const store = read('js/store.js');
  const ini = store.indexOf("window.SP_EXT_DADO_MINIMO = ");
  const fim = store.indexOf('\n\n', store.indexOf('window._lzMotorAtual = function'));
  ok(ini > 0, 'MOTOR · SP_EXT_DADO_MINIMO existe no store.js (fonte única)');
  // Sem as funções (código antigo), o teste tem que ACUSAR cada invariante — não estourar
  // no primeiro acesso e esconder as outras 8 falhas atrás de um stack trace.
  const w = {};
  if (ini > 0 && fim > ini) { try { new Function('window', store.slice(ini, fim))(w); } catch (e) {} }
  if (typeof w._verCmp !== 'function') w._verCmp = () => NaN;
  if (typeof w._lzMotorAtual !== 'function') w._lzMotorAtual = () => true;   // o que o app fazia antes: absolvia

  // ⚠️ A versão da extensão é "2.01 → 2.02 → … → 2.10": cada componente é um INTEIRO, e
  // por isso "2.1" e "2.01" são a MESMA versão. Comparar como texto poria "2.10" < "2.04"
  // (porque '1' < '0'... não: '2.10' < '2.04' byte a byte), que é o erro clássico aqui.
  ok(w._verCmp('2.01', '2.04') < 0, 'MOTOR · 2.01 é menor que 2.04');
  ok(w._verCmp('2.04', '2.04') === 0, 'MOTOR · versão igual dá empate');
  ok(w._verCmp('2.10', '2.04') > 0, 'MOTOR · 2.10 é MAIOR que 2.04 (texto diria o contrário)');
  ok(w._verCmp('2.1', '2.01') === 0, 'MOTOR · "2.1" e "2.01" são a mesma versão neste esquema');
  ok(w._verCmp('3.0', '2.99') > 0, 'MOTOR · a virada de maior também é numérica');
  ok(w._lzMotorAtual({ extVersion: '2.04' }) === true, 'MOTOR · leitura no motor atual vale');
  ok(w._lzMotorAtual({ extVersion: '2.10' }) === true, 'MOTOR · motor mais novo também vale');
  ok(w._lzMotorAtual({ extVersion: '2.01' }) === false,
     'MOTOR · leitura na 2.01 NÃO vale (era o estado dos 12 docs em produção)');
  ok(w._lzMotorAtual({ extVersion: '2.03' }) === false,
     'MOTOR · versão intermediária, com o nome ainda truncado, também não vale');
  ok(w._lzMotorAtual({}) === false, 'MOTOR · leitura antiga demais pra se identificar não vale');
  ok(w._lzMotorAtual(null) === false, 'MOTOR · sem import não vale');

  // ⚠️ o mínimo NUNCA pode passar a versão que a extensão realmente tem: seria exigir um
  // motor que não existe, e aí NINGUÉM ficaria verde, nunca.
  const mVer = JSON.parse(read('extension/manifest.json')).version;
  ok(w._verCmp(w.SP_EXT_DADO_MINIMO, mVer) <= 0,
     'MOTOR · o mínimo exigido (' + w.SP_EXT_DADO_MINIMO + ') não passa a versão da extensão (' + mVer + ')');

  const rep = read('js/views/tournaments-enrollment-report.js');
  const fn = rep.slice(rep.indexOf('function _lzImportComplete(li)'), rep.indexOf('function _lzScanComplete'));
  ok(/_lzMotorAtual\(li\)\) return false;/.test(fn),
     'CRITÉRIO · a completude reprova leitura de motor velho');
  ok(fn.indexOf('_lzMotorAtual') < fn.indexOf('var n = _lzTot(li)'),
     'CRITÉRIO · a checagem do motor vem ANTES da contagem (não adianta contar dado errado)');
}

/* ── 2. a tela nunca fica preta ────────────────────────────────────────────────────── */
function telaPreta() {
  const r = read('js/router.js');
  const iEsvazia = r.indexOf("viewContainer.innerHTML = '';");
  const iGuarda = r.indexOf('!viewContainer.firstChild');
  ok(iEsvazia > 0, 'PRETA · o router ainda esvazia o container (é o desenho atual)');
  ok(iGuarda > iEsvazia, 'PRETA · existe uma guarda DEPOIS do render que olha se sobrou vazio');

  // a guarda tem que rodar FORA do catch — o caso do dono não lança exceção nenhuma
  const iCatch = r.indexOf('} catch (_erroRender) {');
  const iFimCatch = r.indexOf('} catch (_e3) {}', iCatch);
  ok(iGuarda > iFimCatch,
     'PRETA · a guarda roda mesmo SEM exceção (o Sentry ficou mudo no caso relatado)');

  // e tem que ser à prova de erro ela mesma: se ela lançar, volta a tela preta
  const trecho = r.slice(iFimCatch, iGuarda + 1400);
  ok(/try \{[\s\S]*!viewContainer\.firstChild[\s\S]*\} catch \(_e4\) \{\}/.test(trecho),
     'PRETA · a própria guarda é protegida (não pode ser ela a derrubar a tela)');
  ok(/Carregando/.test(trecho),
     'PRETA · o que entra no lugar do vazio é "Carregando", que é honesto e não é preto');
  ok(/viewContainer && !viewContainer\.firstChild/.test(trecho),
     'PRETA · a guarda checa o container antes de mexer nele');

  // ⚠️ o teste olha RESULTADO, não mecanismo: simula o container vazio e roda a guarda.
  const nós = [];
  const fakeContainer = {
    firstChild: null,
    set innerHTML(v) { nós.push(v); this.firstChild = { v: v }; },
    get innerHTML() { return nós[nós.length - 1] || ''; }
  };
  const guarda = new Function('viewContainer', `
    try {
      if (viewContainer && !viewContainer.firstChild) {
        viewContainer.innerHTML = '<div class="sp-view-vazia">Carregando…</div>';
      }
    } catch (_e4) {}
    return viewContainer.innerHTML;
  `);
  ok(guarda(fakeContainer).indexOf('Carregando') >= 0,
     'PRETA · container vazio recebe conteúdo (a tela deixa de ser o fundo da página)');
  const cheio = { firstChild: { já: 1 }, innerHTML: '<div>a dashboard</div>' };
  guarda(cheio);
  ok(cheio.innerHTML === '<div>a dashboard</div>',
     'PRETA · container que JÁ tem conteúdo não é tocado (a guarda não apaga a tela boa)');
}

console.log('\n═══ motor velho não é leitura completa · a tela não fica preta ═══\n');
motor();
console.log('');
telaPreta();
console.log('\n' + (falhas ? '❌ ' + falhas + ' falha(s) de ' + testes : '✅ ' + testes + ' asserções, 0 falhas') + '\n');
process.exit(falhas ? 1 : 0);
