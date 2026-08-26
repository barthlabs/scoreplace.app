/* O INSTRUMENTO PRECISA ENXERGAR CALLBACK ASSÍNCRONO — senão manda procurar errado.
 *
 * O PONTO CEGO (achado em 25/ago/2026, medindo o iPhone do dono na 2.0.79):
 * TODA travada dele — de rolagem e de toque — chegava ao Sentry com `quem: nenhum`,
 * como se nenhum JS estivesse rodando. Ao mesmo tempo, o campo `ultimo=` apontava:
 *   · `intervalo800:this._poll()`   → vigia de abas do Firebase Auth (IndexedDB)
 *   · `timeout:handleDelayElapsed()`→ recuo exponencial do SDK do Firestore
 *   · `Mu:schedule`                 → fila assíncrona do Firestore
 * Os três são pontos de entrada **async**. `async () => this._poll()` devolve uma
 * PROMESSA na hora: o cronômetro do embrulho media ~0ms e ia embora, e o trabalho
 * real (IndexedDB, rede, fila do SDK) acontecia DEPOIS, fora da medição.
 *
 * ⇒ Não era "ninguém trabalhando". Era o instrumento cego pro assíncrono.
 * É a MESMA lição da 1.9.94, quando a rolagem ficou de fora do rastro e as travadas
 * chegavam com "anim=0 e nenhum JS": instrumento que não cobre o caminho quente não
 * é neutro — ele manda procurar no lugar errado.
 *
 * ⛔ E O RISCO DE MEDIR: observar uma promessa não pode ALTERAR o programa. Este
 * teste roda a função REAL, extraída do store.js, pra garantir isso.
 */
const fs = require('fs');
const path = require('path');
const _R = require('./recorte.js');   // recorta pelo CONSTRUTO, nunca por tamanho fixo

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('──── o rastro enxerga callback assíncrono (e não altera nada) ────');

const store = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');

// ── ① a observação existe e está no lugar certo ──────────────────────────────
{
  ok(/_marcaFimAssinc/.test(store), 'existe a marcação de fim de callback assíncrono');
  const i = store.indexOf('var _r = fn.apply(this, arguments);');
  ok(i > 0, 'o embrulho guarda o retorno do callback antes de devolvê-lo');
  const bloco = _R.ateSairDoBloco(store, i);
  ok(/typeof _r\.then === 'function'/.test(bloco),
     'e só observa quando o retorno é uma PROMESSA (callback comum não paga nada)');
  ok(/return _r;/.test(bloco),
     '⛔ devolve o MESMO objeto que o callback devolveu — observar não pode trocar o valor');
  ok(/_marcaFimAssinc\([^)]*\), _marcaFimAssinc\(/.test(bloco.replace(/\s+/g, ' ')),
     'observa os DOIS lados (cumpriu e rejeitou) — senão rejeição vira medição perdida');
}

// ── ② ⭐ RODA A FUNÇÃO REAL, extraída do arquivo ─────────────────────────────
// Copiar a função pro teste deixaria as duas divergirem em silêncio. Aqui o código
// testado é literalmente o do store.js.
{
  const m = store.match(/var _marcaFimAssinc = function[\s\S]*?\n    };/);
  ok(!!m, 'a função foi extraída do store.js (é o código de verdade que roda abaixo)');

  const trechos = [];
  const janela = { _trechos: trechos };
  const escopo = { window: janela, performance: { now: () => Date.now() } };
  // eslint-disable-next-line no-new-func
  const criar = new Function('window', 'performance', m[0] + '\n return _marcaFimAssinc;');
  const _marcaFimAssinc = criar(escopo.window, escopo.performance);

  // (a) valor cumprido passa intacto
  const marcaRapida = _marcaFimAssinc('teste:rapido', Date.now());
  const valor = { id: 42 };
  ok(marcaRapida(valor) === valor, '⛔ o valor cumprido volta IDÊNTICO (mesma referência)');
  ok(trechos.length === 0, 'e callback rápido não suja o rastro');

  // (b) callback LENTO entra no rastro, marcado como assíncrono
  const marcaLenta = _marcaFimAssinc('intervalo800:this._poll()', Date.now() - 900);
  marcaLenta('ok');
  ok(trechos.length === 1, '⭐ callback assíncrono LENTO passa a aparecer no rastro');
  ok(trechos[0].nome.charAt(0) === '~',
     'e vem marcado com "~" — é tempo de PONTA A PONTA, não CPU (ler como CPU acusaria inocente)');
  ok(/_poll/.test(trechos[0].nome), 'com o nome do culpado junto (' + trechos[0].nome.slice(0, 34) + ')');
  ok(trechos[0].dur >= 900, 'e com a duração real (' + Math.round(trechos[0].dur) + 'ms)');

  // (c) o piso de 180ms vale pro assíncrono também
  trechos.length = 0;
  _marcaFimAssinc('teste:quase', Date.now() - 100)('x');
  ok(trechos.length === 0, 'abaixo de 180ms continua fora do rastro (ruído não vira sinal)');

  // (d) rastro não cresce sem fim
  trechos.length = 0;
  for (let i = 0; i < 60; i++) _marcaFimAssinc('t:' + i, Date.now() - 500)('x');
  ok(trechos.length <= 30, 'o rastro é limitado a 30 entradas (' + trechos.length + ')');
}

// ── ③ ⛔ o ramo de observação não pode ficar pendurado REJEITADO ─────────────
// A issue nº 1 do Sentry deste app é "try/catch não pega promessa". Instrumentação
// que gera rejeição órfã seria o mesmo erro, vindo de quem deveria vigiá-lo.
{
  const m = store.match(/var _marcaFimAssinc = function[\s\S]*?\n    };/);
  const trechos = [];
  // eslint-disable-next-line no-new-func
  const criar = new Function('window', 'performance', m[0] + '\n return _marcaFimAssinc;');
  const _marca = criar({ _trechos: trechos }, { now: () => Date.now() });

  let orfa = null;
  const onUnhandled = (e) => { orfa = e; };
  process.on('unhandledRejection', onUnhandled);

  const original = Promise.reject(new Error('falha de propósito'));
  const observado = original.then(_marca('t:falha', Date.now()), _marca('t:falha', Date.now()));
  let capturou = null;
  original.catch((e) => { capturou = e; });   // o consumidor de verdade

  setTimeout(() => {
    process.off('unhandledRejection', onUnhandled);
    ok(orfa === null, '⛔ observar uma promessa REJEITADA não cria rejeição órfã');
    ok(capturou instanceof Error, 'e o consumidor real continua recebendo a rejeição');
    observado.then(() => {
      ok(true, 'o ramo de observação termina resolvido (não propaga o erro adiante)');
      console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
      process.exit(fail ? 1 : 0);
    });
  }, 60);
}
