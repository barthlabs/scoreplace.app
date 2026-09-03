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
  await b.close();

  ok(r.adiadoNoDom === false, 'setup: o grupo do "mo" está ADIADO — não está no DOM antes da busca');
  ok(r.achaMeu, '"ro" acha o jogo do próprio dono (já pintado e hidratado) — era o que funcionava');
  ok(r.montou, 'buscar montou o grupo adiado');
  ok(/Livia Morais/.test(r.nomePuxado), '⭐ o nome foi PUXADO por uid para o card recém-montado');
  ok(r.achaOutro, '⭐ e "mo" acha esse jogo — era isto que sumia');
  ok(r.naoAchaOQueNaoTem, '⛔ e segue filtrando: "zzz" não acha nada');

  console.log('\n' + (fail ? '❌ ' + fail + ' FALHA(S)' : '✅ busca-puxa-nome-de-grupo-adiado: OK') + '  (' + pass + ' asserts ok)');
  if (fail) process.exit(1);
})();
