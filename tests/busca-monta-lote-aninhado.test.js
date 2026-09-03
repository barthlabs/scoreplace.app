/* A BUSCA DA CHAVE PRECISA MONTAR OS LOTES DE DENTRO, NÃO SÓ OS DE FORA.
 *   node tests/busca-monta-lote-aninhado.test.js
 *
 * ⛔ O BUG (relato do dono, produção 2.1.108): _"a barra de buscas ainda não funciona nas
 * chaves (detalhes). funciona direito nos inscritos"_ — digitar "ana" apagava a chave
 * inteira, sem sequer o "Nenhum jogo encontrado".
 *
 * A CAUSA: `_chaveMontaTudo` varria UMA vez um NodeList capturado ANTES de montar. Mas a
 * chave adia em CAMADAS — o lote de fora desenha os grupos e cada grupo adia os próprios
 * jogos. Os marcadores nascidos DENTRO do HTML recém-montado não estavam na lista original e
 * ficavam por montar: os cards nunca entravam no DOM, nada casava com a busca, e o filtro
 * então escondia todo container sem acerto → tela em branco.
 * É por isso que a MESMA barra funcionava nos inscritos: lá não há lote adiado.
 *
 * ⛔ ESTE TESTE EXERCITA O CÓDIGO REAL num navegador, com um lote DENTRO de outro — que é a
 * forma que a passada única não vencia. Um teste com lote de um nível só passa com o bug.
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

(async () => {
  console.log('\n──── a busca monta o lote de dentro ────');
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.route('**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await p.goto('http://sp.teste/x');
  await p.addScriptTag({ content: ler('js/store.js') });
  await p.addScriptTag({ content: ler('js/views/bracket.js') });

  const r = await p.evaluate(() => {
    var loteInterno = function () {
      return '<div data-group-box="1"><div id="alvo" data-players="ANDREYA NOVAZZI / Ana Ribeiro | Ana Ribeiro">JOGO E2</div></div>';
    };
    var loteExterno = function () { return '<div>' + window._chaveGuardaLote(loteInterno) + '</div>'; };
    document.body.innerHTML =
      '<div id="view-container">' + window._bracketBar(true) +
      '<div id="inline-bracket-container">' +
        '<div data-group-box="1"><div id="outro" data-players="Livia Morais / Rodrigo Barth">JOGO 169</div></div>' +
        window._chaveGuardaLote(loteExterno) +
      '</div></div>';
    var antes = { noDom: !!document.getElementById('alvo'), marcadores: document.querySelectorAll('[data-chave-lote]').length };
    var inp = document.getElementById('bracket-search');
    inp.value = 'ana';
    window._bracketApplyFilter();
    var alvo = document.getElementById('alvo'), outro = document.getElementById('outro');
    var emp = document.getElementById('bracket-search-empty');
    return {
      antes: antes,
      entrouNoDom: !!alvo,
      visivel: !!(alvo && alvo.style.display !== 'none'),
      outroOculto: !!(outro && outro.style.display === 'none'),
      marcadoresRestantes: document.querySelectorAll('[data-chave-lote]').length,
      disseNadaEncontrado: !!(emp && emp.style.display !== 'none')
    };
  });
  await b.close();

  ok(r.antes.noDom === false && r.antes.marcadores === 1,
    'setup: o card mora num lote DENTRO de outro — não está no DOM antes de buscar');
  ok(r.entrouNoDom, '⭐ buscar montou a camada de DENTRO e o card entrou no DOM');
  ok(r.visivel, '⭐ e ele aparece — era isto que sumia');
  ok(r.outroOculto, '⛔ e o filtro segue filtrando: quem não casa continua oculto');
  ok(r.marcadoresRestantes === 0, '⛔ não sobra marcador por montar');
  ok(!r.disseNadaEncontrado, '⛔ não diz "nenhum jogo encontrado" com o jogo existindo');

  console.log('\n' + (fail ? '❌ ' + fail + ' FALHA(S)' : '✅ busca-monta-lote-aninhado: OK') + '  (' + pass + ' asserts ok)');
  if (fail) process.exit(1);
})();
