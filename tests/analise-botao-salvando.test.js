/* O Salvar da Análise fica "Salvando…" até terminar — node tests/analise-botao-salvando.test.js
 *
 * Relato do dono (07/ago/2026): "o botão salvar da análise precisa de um salvando enquanto
 * não termina de salvar."
 *
 * O QUE EXISTIA: só o `#er-save-btn` (a barra da lista legada) trocava de texto pra
 * "Salvando…". O `#er-mx-save-btn` — o da MATRIZ, que é o caminho que o organizador usa —
 * não recebia NADA: sem texto, sem cinza, sem spinner e sem `disabled`, dava pra clicar de
 * novo no meio do save. E o que existia era texto puro, fora do motor canônico.
 *
 * A ARMADILHA (e é o motivo deste teste rodar em browser de verdade): `_erSaveEdits` limpa
 * `_pendingEdits` ANTES de o trabalho terminar. Qualquer chamada a `_erUpdateSaveBar` no meio
 * do save vê n=0 e, sem guard, (a) troca o "Salvando…" pelo rótulo normal e (b) ESCONDE a
 * barra inline inteira — sumindo com o próprio feedback que o dono pediu. Medido aqui nas
 * duas direções: com o guard sobrevive, com a lógica antiga a barra vai a `display:none`.
 *
 * Roda o `js/store.js` e o `js/views/tournaments-enrollment-report.js` REAIS num Chromium —
 * o cânone do botão ocupado não se prova com DOM stubado.
 * Ver [[project_busy_button_canonical]], [[feedback_tests_must_reproduce_real_failure]].
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('@playwright/test');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const ROOT = path.join(__dirname, '..');
const DOM =
  '<div id="er-mx-save-inline" style="display:flex;gap:6px;">' +
  '<button id="er-mx-save-btn" class="btn btn-success btn-sm">💾 Salvar (3)</button></div>' +
  '<div id="er-save-bar"><button id="er-save-btn" class="btn btn-success">💾 Salvar alterações (3)</button></div>';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  for (const f of ['js/store.js', 'js/views/tournaments-enrollment-report.js']) {
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, f), 'utf8') });
  }

  const api = await page.evaluate(() => ({
    spin: typeof window._spinButton, done: typeof window._spinButtonDone,
    bar: typeof window._erUpdateSaveBar, save: typeof window._erSaveEdits
  }));
  console.log('\n📋 Os módulos reais carregaram');
  ok(api.spin === 'function' && api.done === 'function', 'motor canônico do botão ocupado disponível');
  ok(api.bar === 'function' && api.save === 'function', 'a Análise expõe _erUpdateSaveBar e _erSaveEdits');

  const r = await page.evaluate((dom) => {
    document.body.innerHTML = dom;
    const inline = document.getElementById('er-mx-save-inline');
    const mx = document.getElementById('er-mx-save-btn');
    const legacy = document.getElementById('er-save-btn');
    const snap = (b) => ({
      texto: (b.textContent || '').trim(),
      spinner: !!b.querySelector('.btn-spinner'),
      disabled: b.disabled,
      cinza: (b.style.filter || '').indexOf('grayscale') >= 0
    });
    const out = {};
    // é exatamente o que _erSaveEdits faz: pinta OS DOIS
    [legacy, mx].forEach((b) => window._spinButton(b, 'Salvando…'));
    out.aoSalvar = { inline: inline.style.display, mx: snap(mx), legado: snap(legacy) };
    // repintura no meio do save (n=0, porque _pendingEdits já foi zerado)
    window._erUpdateSaveBar();
    out.noMeio = { inline: inline.style.display, mx: snap(mx), legado: snap(legacy) };
    // fim do trabalho — a ordem do `finish`: solta e SÓ ENTÃO repinta
    [legacy, mx].forEach((b) => window._spinButtonDone(b));
    window._erUpdateSaveBar();
    out.aoTerminar = { inline: inline.style.display, mx: snap(mx), legado: snap(legacy) };
    return out;
  }, DOM);

  console.log('\n📋 Enquanto salva, OS DOIS botões ficam ocupados');
  ['mx', 'legado'].forEach(function (k) {
    const b = r.aoSalvar[k];
    ok(b.texto === 'Salvando…', k + ': mostra o gerúndio com reticências');
    ok(b.spinner === true, k + ': tem spinner');
    ok(b.disabled === true, k + ': fica desabilitado (não dá pra clicar de novo)');
    ok(b.cinza === true, k + ': fica cinza (grayscale), como manda o cânone');
  });
  ok(r.aoSalvar.inline === 'flex', 'a barra inline está visível enquanto salva');

  console.log('\n📋 Repintar no meio do save NÃO apaga o feedback');
  ok(r.noMeio.inline === 'flex', 'a barra inline continua visível (era ela que sumia)');
  ok(r.noMeio.mx.texto === 'Salvando…' && r.noMeio.mx.spinner === true,
    'o botão da matriz continua "Salvando…" com spinner');
  ok(r.noMeio.legado.texto === 'Salvando…' && r.noMeio.legado.spinner === true,
    'o botão da barra legada também');

  console.log('\n📋 Ao terminar, volta ao normal (o fim é EVENTO, não timeout)');
  ok(r.aoTerminar.mx.texto === '💾 Salvar', 'matriz volta ao rótulo normal');
  ok(r.aoTerminar.legado.texto === '💾 Salvar alterações', 'barra legada volta ao rótulo normal');
  ok(r.aoTerminar.mx.spinner === false && r.aoTerminar.legado.spinner === false, 'spinner sai');
  ok(r.aoTerminar.mx.cinza === false && r.aoTerminar.legado.cinza === false, 'o cinza sai');
  ok(r.aoTerminar.inline === 'none', 'sem edições pendentes, a barra inline se esconde de novo');

  // ── A LÓGICA ANTIGA, no mesmo estado: prova que o guard não é enfeite ──────────
  const velho = await page.evaluate((dom) => {
    document.body.innerHTML = dom;
    const inline = document.getElementById('er-mx-save-inline');
    const mx = document.getElementById('er-mx-save-btn');
    window._spinButton(mx, 'Salvando…');
    const n = 0;                                  // o estado real no meio do save
    if (n > 0) { inline.style.display = 'flex'; mx.disabled = false; mx.textContent = '💾 Salvar (' + n + ')'; }
    else { inline.style.display = 'none'; mx.disabled = true; mx.textContent = '💾 Salvar'; }
    return { inline: inline.style.display, texto: (mx.textContent || '').trim(), spinner: !!mx.querySelector('.btn-spinner') };
  }, DOM);
  console.log('\n📋 Sem o guard (lógica anterior) o feedback evaporava');
  ok(velho.inline === 'none' && velho.spinner === false,
    'a versão antiga escondia a barra e apagava o spinner no meio do save');

  // ── FIAÇÃO: o save tem que pintar os dois e soltar antes de repintar ───────────
  const src = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-enrollment-report.js'), 'utf8');
  const fn = src.slice(src.indexOf('window._erSaveEdits = function'), src.indexOf('// ─── Verificação letzplay'));
  console.log('\n📋 Fiação em _erSaveEdits');
  ok(/'er-save-btn',\s*'er-mx-save-btn'/.test(fn), 'os DOIS botões entram na lista de ocupados');
  ok(fn.indexOf('_spinButtonDone') < fn.indexOf('window._erUpdateSaveBar()'),
    'solta o spin ANTES de repintar (senão o rótulo velho volta por cima)');
  ok(!/btn\.textContent = 'Salvando…'/.test(fn), 'o "Salvando…" à mão saiu — quem pinta é o motor canônico');

  await browser.close();
  console.log('\n' + '─'.repeat(40));
  console.log('Results: ' + pass + ' passed, ' + fail + ' failed');
  console.log('─'.repeat(40));
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
