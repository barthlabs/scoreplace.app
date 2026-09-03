/* A BUSCA TEM QUE ACHAR O NOME QUE VEM DO PERFIL, NÃO SÓ O GRAVADO NO CARD.
 *   node tests/busca-acha-nome-stripado.test.js
 *
 * ⛔ O BUG (relato do dono, produção 2.1.109): _"a barra de buscas ainda não funciona nas
 * chaves… ela tem que achar os jogos onde aquele nome/parte aparece"_ — buscar o nome de
 * alguém apagava a chave inteira.
 *
 * A CAUSA — e não era o comparador nem o lote adiado, que eu troquei antes achando que eram:
 * `data-players` (o texto que o filtro varre) é escrito NO RENDER. Para quem TEM CONTA o nome
 * é STRIPADO no save (cânone do uid: identidade é uid, nome vem do perfil vivo), então com o
 * perfil ainda não resolvido o atributo nasce SEM o nome real. A cura que existia só agia
 * quando o valor trazia o rótulo literal "jogador sem perfil (XXXX)" — e o caso NORMAL não
 * traz rótulo nenhum, é só um perfil que ainda não chegou. Resultado: o filtro varria um
 * palheiro onde o nome da pessoa não existe, não achava nada, e escondia todo container sem
 * acerto — a chave inteira sumia. Nos inscritos não aparece porque lá o card resolve o nome
 * por outro caminho.
 *
 * ⛔ O TESTE PARTE DO CARD COMO ELE NASCE: `data-players` sem o nome e SEM rótulo de órfão.
 * Um teste que já pusesse o nome no atributo passaria com o bug de pé.
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

(async () => {
  console.log('\n──── a busca acha o nome que vem do perfil ────');
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.route('**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await p.goto('http://sp.teste/x');
  await p.addScriptTag({ content: ler('js/store.js') });
  await p.addScriptTag({ content: ler('js/views/bracket.js') });

  const r = await p.evaluate(async () => {
    var uid = 'uAna';
    document.body.innerHTML =
      '<div id="view-container">' + window._bracketBar(true) +
      '<div id="inline-bracket-container"><div data-group-box="1">' +
        '<div id="c1" data-players="Jogador 24 / Tiago Lima" data-my-match="0">' +
          '<span data-uid-name="' + uid + '"></span>' +
        '</div>' +
      '</div></div></div>';
    var card = document.getElementById('c1');
    var buscar = function (q) {
      var i = document.getElementById('bracket-search');
      i.value = q; window._bracketApplyFilter();
      return card.style.display !== 'none';
    };
    var out = { renderSemNome: card.getAttribute('data-players'), antes: buscar('ana') };
    window._userProfileCache[uid] = { displayName: 'Ana Ribeiro' };
    await window._hydrateUidNames(document.getElementById('view-container'));
    out.depoisAttr = card.getAttribute('data-players');
    out.achaNome = buscar('ana');
    out.achaParte = buscar('rib');
    out.achaDuasPalavras = buscar('ana rib');
    out.naoAchaOQueNaoTem = buscar('zzz');
    out.guestPreservado = /Tiago Lima/.test(card.getAttribute('data-players') || '');
    return out;
  });
  await b.close();

  ok(!/Ana Ribeiro/.test(r.renderSemNome) && !/jogador sem perfil/i.test(r.renderSemNome),
    'setup: o card nasce SEM o nome real e SEM rótulo de órfão (é o caso normal de quem tem conta)');
  ok(r.antes === false, '⛔ antes da hidratação, buscar o nome NÃO acha — é o bug reproduzido');
  ok(/Ana Ribeiro/.test(r.depoisAttr), '⭐ a hidratação acrescenta o nome vivo ao palheiro da busca');
  ok(r.achaNome, '⭐ buscar "ana" acha o jogo');
  ok(r.achaParte, '⭐ buscar "rib" — PARTE do nome — acha (ordem do dono)');
  ok(r.achaDuasPalavras, '⭐ "ana rib" (duas palavras) acha');
  ok(r.naoAchaOQueNaoTem === false, '⛔ e continua filtrando: "zzz" não acha nada');
  ok(r.guestPreservado, '⛔ o nome de quem NÃO tem conta é preservado no palheiro (só acrescenta)');

  console.log('\n' + (fail ? '❌ ' + fail + ' FALHA(S)' : '✅ busca-acha-nome-stripado: OK') + '  (' + pass + ' asserts ok)');
  if (fail) process.exit(1);
})();
