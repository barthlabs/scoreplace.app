/* A BUSCA PUXA O NOME DOS CARDS QUE ELA MESMA ACABOU DE MONTAR.
 *   node tests/busca-puxa-nome-de-grupo-adiado.test.js
 *
 * ⛔ O BUG (medido pelo dono na produção 2.1.110): _"não funciona tão bem com 2 letras. ro
 * mostra, mo não"_ — e a regra que ele deu junto: _"precisa puxar sempre os nomes por uid.
 * não pode isso de o nome não ter vindo e ficar por isso mesmo"_.
 *
 * A CAUSA: o card da chave nasce com o nome VAZIO quando o perfil ainda não chegou — de
 * propósito, desde a 1.7.79: leva `data-uid-name` e conta com `_hydrateUidNames`. Só que a
 * hidratação roda UMA VEZ, no render. Os grupos ADIADOS (lote) só entram no DOM quando a
 * busca chama `_chaveMontaTudo`, e aí ninguém pede os perfis deles: os spans ficam vazios
 * PARA SEMPRE. Procurar alguém de um grupo adiado nunca achava, porque o nome não existia
 * em lugar nenhum do DOM.
 * "ro" achava porque é o jogo do PRÓPRIO dono — o app rola até ele, então está na parte já
 * pintada e hidratada. "mo" (outra pessoa, outro grupo) não.
 *
 * ⛔ O TESTE PRECISA DO LOTE ADIADO E DO SPAN VAZIO. Um card já hidratado passa com o bug.
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

(async () => {
  console.log('\n──── a busca puxa o nome do grupo adiado ────');
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.route('**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await p.goto('http://sp.teste/x');
  await p.addScriptTag({ content: ler('js/store.js') });
  // ⭐ O card de verdade precisa dos ajudantes do motor (_matchWinnerSide, _slotUidsPositional).
  // Sem eles o teste só conseguiria montar card À MÃO — que foi exatamente como este bug
  // passou batido. Ordem igual à do index.html.
  await p.addScriptTag({ content: ler('js/views/bracket-logic.js') });
  await p.addScriptTag({ content: ler('js/views/bracket-model.js') });
  await p.addScriptTag({ content: ler('js/views/bracket.js') });

  const r = await p.evaluate(async () => {
    var uidM = 'uMorais';
    window._userProfileCache = { uRod: { displayName: 'Rodrigo Barth' } };
    window._userProfileCache[uidM] = { displayName: 'Livia Morais' };
    var lote = function () {
      return '<div data-group-box="1"><div id="oculto" data-players="" data-my-match="0">' +
        '<span class="sp-name-fit"><span data-uid-name="' + uidM + '"></span></span></div></div>';
    };
    document.body.innerHTML =
      '<div id="view-container">' + window._bracketBar(true) +
      '<div id="inline-bracket-container">' +
        '<div data-group-box="1"><div id="meu" data-players="Rodrigo Barth" data-my-match="1">' +
          '<span class="sp-name-fit">Rodrigo Barth</span></div></div>' +
        window._chaveGuardaLote(lote) +
      '</div></div>';
    var inp = document.getElementById('bracket-search');
    var out = { adiadoNoDom: !!document.getElementById('oculto') };
    inp.value = 'ro'; window._bracketApplyFilter();
    out.achaMeu = document.getElementById('meu').style.display !== 'none';
    inp.value = 'mo'; window._bracketApplyFilter();
    await new Promise(function (res) { setTimeout(res, 400); });
    var oc = document.getElementById('oculto');
    out.montou = !!oc;
    out.nomePuxado = oc ? String(oc.textContent || '').trim() : '';
    out.achaOutro = !!(oc && oc.style.display !== 'none');
    inp.value = 'zzz'; window._bracketApplyFilter();
    out.naoAchaOQueNaoTem = !!(oc && oc.style.display === 'none');
    return out;
  });

  /* ⛔ A REGRESSÃO QUE O TESTE ANTERIOR NÃO PEGAVA — E POR QUÊ.
   * O fixture escrevia `data-player-uids` À MÃO. Ele ficava verde enquanto o RENDERIZADOR
   * REAL nunca emitia o atributo: `_uidsFor` era um `var` de dentro do IIFE de
   * `_searchNames`, e o IIFE de `_searchUids` lançava ReferenceError na primeira linha do
   * `try` — engolido pelo `catch (e) {}`. Resultado: `data-player-uids=""` em TODO card,
   * a busca por UID nascia morta e o teste não via nada.
   * ⭐ Por isso o primeiro assert agora sai de window.renderMatchCard, o renderizador de
   * verdade. [[feedback_congelador_cego_procurava_o_jogo_no_escopo_errado]]
   */
  const rReal = await p.evaluate(() => {
    var uid = 'uDeborahMonteiro';
    window._userProfileCache = {};   // perfil AINDA NÃO carregado: o nome não existe no DOM
    var html = window.renderMatchCard(
      { id: 'j99', p1: 'TBD', p2: 'TBD', p1Uid: uid, p2Uid: 'uAdversario',
        team1Uids: [uid], team2Uids: ['uAdversario'] },
      false, 'tX', 18);
    var d = document.createElement('div');
    d.innerHTML = html;
    var card = d.querySelector('[data-players]');
    return {
      attr: card ? (card.getAttribute('data-player-uids') || '') : '(sem card)',
      textoVisivel: card ? String(card.textContent || '') : ''
    };
  });

  /* E o caso ponta a ponta: card do renderizador REAL, sem nome nenhum na tela, só com os
   * UIDs. Buscar "mon" tem que (a) não apagar a chave durante a carga, (b) puxar o perfil
   * pela função canônica e (c) achar "Deborah Monteiro" ao reaplicar a MESMA consulta.
   * E digitar letra a letra não pode multiplicar o pedido. */
  const rUidOnly = await p.evaluate(async () => {
    var uid = 'uDeborahMonteiro';
    window._userProfileCache = { uJaConhecido: { displayName: 'Rodrigo Barth' } };
    window._bracketSearchUidsAsked = {};
    window._bracketSearchUidsDead = {};
    var calls = 0, pedidos = [];
    window._preloadUserProfiles = function (uids) {
      calls++; pedidos.push((uids || []).slice());
      return new Promise(function (resolve) {
        setTimeout(function () {
          window._userProfileCache[uid] = { displayName: 'Deborah Monteiro' };
          window._userProfileCache['uAdversario'] = { displayName: '', email: '' }; // sem doc
          resolve();
        }, 20);
      });
    };
    var card = window.renderMatchCard(
      { id: 'j99', p1: 'TBD', p2: 'TBD', p1Uid: uid, p2Uid: 'uAdversario',
        team1Uids: [uid], team2Uids: ['uAdversario'] },
      false, 'tX', 18);
    // ⭐ Um segundo card cujo nome JÁ é conhecido. Ele é a prova de que a busca não para
    // de filtrar enquanto o outro hidrata — a versão anterior abortava a função inteira e
    // devolvia a chave TODA visível, que para o dono é "a busca não filtra".
    var cardConhecido = window.renderMatchCard(
      { id: 'j77', p1: 'TBD', p2: 'TBD', p1Uid: 'uJaConhecido', p2Uid: 'uJaConhecido',
        team1Uids: ['uJaConhecido'], team2Uids: ['uJaConhecido'] },
      false, 'tX', 77);
    document.body.innerHTML = '<div id="view-container">' + window._bracketBar(true) +
      '<div data-group-box="1">' + card + cardConhecido + '</div></div>';
    var elC = document.getElementById('card-j77');
    var el = document.getElementById('card-j99');
    var nomeAntes = String(el.textContent || '');
    var inp = document.getElementById('bracket-search');

    // digita letra a letra: "m" → "mo" → "mon"
    inp.value = 'm'; window._bracketApplyFilter();
    inp.value = 'mo'; window._bracketApplyFilter();
    inp.value = 'mon'; window._bracketApplyFilter();
    var visivelDuranteCarga = el.style.display !== 'none';
    // "mon" não casa com "Rodrigo Barth", e esse card É conhecido: tem que sumir JÁ,
    // sem esperar a hidratação de ninguém.
    var conhecidoFiltradoNaHora = elC.style.display === 'none';
    await new Promise(function (r) { setTimeout(r, 150); });
    var achou = el.style.display !== 'none';

    // depois de carregado, uma busca que não casa TEM que continuar escondendo
    inp.value = 'zzz'; window._bracketApplyFilter();
    await new Promise(function (r) { setTimeout(r, 60); });
    var escondeOQueNaoTem = el.style.display === 'none';

    // e voltar a buscar não pode pedir os perfis de novo
    inp.value = 'mon'; window._bracketApplyFilter();
    await new Promise(function (r) { setTimeout(r, 60); });
    return {
      calls: calls, pedidos: pedidos,
      semNomeNaTela: !/Monteiro/.test(nomeAntes),
      visivelDuranteCarga: visivelDuranteCarga,
      conhecidoFiltradoNaHora: conhecidoFiltradoNaHora,
      achou: achou,
      escondeOQueNaoTem: escondeOQueNaoTem,
      achouDeNovo: el.style.display !== 'none'
    };
  });

  await b.close();

  ok(r.adiadoNoDom === false, 'setup: o grupo do "mo" está ADIADO — não está no DOM antes da busca');
  ok(r.achaMeu, '"ro" acha o jogo do próprio dono (já pintado e hidratado) — era o que funcionava');
  ok(r.montou, 'buscar montou o grupo adiado');
  ok(/Livia Morais/.test(r.nomePuxado), '⭐ o nome foi PUXADO por uid para o card recém-montado');
  ok(r.achaOutro, '⭐ e "mo" acha esse jogo — era isto que sumia');
  ok(r.naoAchaOQueNaoTem, '⛔ e segue filtrando: "zzz" não acha nada');
  ok(/uDeborahMonteiro/.test(rReal.attr),
    '⭐ O RENDERIZADOR REAL emite data-player-uids (era "" — ReferenceError engolido)');
  ok(!/Monteiro/.test(rReal.textoVisivel),
    'setup: e o card sai SEM o nome na tela — só o UID, que é o caso do bug');
  ok(rUidOnly.semNomeNaTela, 'setup: o card no DOM não tem "Monteiro" em texto nenhum');
  ok(rUidOnly.calls === 1,
    '⛔ "m"→"mo"→"mon" pede os perfis UMA vez só (dedução por UID, não pela consulta) — foram ' + rUidOnly.calls);
  ok(rUidOnly.visivelDuranteCarga, '⛔ o card SEM perfil não some enquanto o nome carrega');
  ok(rUidOnly.conhecidoFiltradoNaHora,
    '⭐ e a busca SEGUE FILTRANDO durante a hidratação: quem já é conhecido e não casa some na hora');
  ok(rUidOnly.achou, '⭐ "mon" acha "Deborah Monteiro" carregada por UID depois do reapply');
  ok(rUidOnly.escondeOQueNaoTem, '⛔ e segue filtrando de verdade: "zzz" esconde o card');
  ok(rUidOnly.achouDeNovo, '⭐ buscar de novo continua achando');
  ok(rUidOnly.calls === 1, '⛔ e NENHUM pedido redundante depois — segue em ' + rUidOnly.calls);

  console.log('\n' + (fail ? '❌ ' + fail + ' FALHA(S)' : '✅ busca-puxa-nome-de-grupo-adiado: OK') + '  (' + pass + ' asserts ok)');
  if (fail) process.exit(1);
})();
