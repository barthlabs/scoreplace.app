/* O HISTÓRICO DE ATIVIDADES SÓ NASCE QUANDO É ABERTO.
 *
 * Regra do dono (25/ago/2026): _"nada que não estiver visível deve ser carregado…
 * o que não estiver não carrega enquanto o usuário não clicar pedindo outra seção"_.
 *
 * MEDIDO NO APARELHO DELE, na tela de DETALHE do torneio (Sentry, 2.0.84):
 *   nos=8061 · onde: #app=7870  #inline-bracket-container=6157
 *                    #activity-log-section=1242
 * O histórico inteiro era montado e escondido dentro de um `<details>` FECHADO —
 * 1.242 elementos que ninguém pediu, mais o TEXTO de todos os eventos antigos
 * construído a cada render.
 *
 * ⛔ O que este teste guarda: `<details>` fechado parece "não carregado" e não é.
 * Esconder não é deixar de construir — foi essa confusão que manteve 76% do DOM da
 * tela inicial ocupado por janelas fechadas (2.0.84) e o histórico inteiro aqui.
 */
const fs = require('fs');
const path = require('path');
const _R = require('./recorte.js');   // recorta pelo CONSTRUTO, nunca por tamanho fixo

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('──── histórico de atividades: só monta quando abre ────');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-analytics.js'), 'utf8');
const i = src.indexOf('window._buildActivityLog = function');
const fn = src.slice(i, src.indexOf('\n};', i));

ok(i > 0, 'a função do histórico existe');

// ── ① o container nasce VAZIO ───────────────────────────────────────────────
{
  ok(/data-log-corpo="1" style="[^"]*"><\/div>/.test(fn) || /data-log-corpo="1"[^>]*><\/div>/.test(fn),
     '⭐ o corpo do histórico nasce VAZIO no innerHTML');
  const iHtml = fn.indexOf('container.innerHTML');
  const bloco = fn.slice(iHtml, iHtml + 700);
  ok(bloco.indexOf('timelineHtml') === -1,
     '⛔ a linha do tempo NÃO entra no innerHTML inicial (era ela que enchia o DOM)');
  ok(bloco.indexOf('montaCauda()') === -1,
     '⛔ e a cauda de eventos antigos também não');
}

// ── ② o corpo entra no primeiro `toggle` ────────────────────────────────────
{
  ok(/addEventListener\('toggle'/.test(fn), '⭐ o corpo se monta no `toggle` do <details>');
  const iT = fn.indexOf("addEventListener('toggle'");
  const corpo = fn.slice(iT, iT + 800);
  ok(/_det\.open/.test(corpo), 'e só quando ele está ABERTO (fechar não remonta nada)');
  ok(/_corpo\.firstChild/.test(corpo),
     '⛔ uma vez só — abrir e fechar várias vezes não pode empilhar conteúdo');
  ok(/timelineHtml/.test(corpo) && /montaCauda\(\)/.test(corpo),
     'e é aí que a linha do tempo E a cauda antiga são construídas');
}

// ── ③ ⭐ a CAUDA é função, não string pronta ────────────────────────────────
// Montar o texto de todos os eventos antigos era trabalho feito sempre, para um
// <details> aninhado que quase ninguém abre.
{
  ok(/function montaCauda\(\)/.test(src),
     'a cauda de eventos antigos virou FUNÇÃO (só roda se pedirem)');
  ok(!/var allEventsHtml/.test(src),
     '⛔ e a string pronta que era montada a cada render deixou de existir');
  const iM = src.indexOf('function montaCauda()');
  ok(/if \(!hasMore\) return '';/.test(_R.ateOFim(src, iM)),
     'sem cauda, devolve vazio sem varrer nada');
}

// ── ④ a CONTAGEM continua no cabeçalho (não se esconde o que existe) ───────
// O <summary> promete "(N eventos)". Esse número não pode sumir: seção que corta
// em silêncio faz a pessoa achar que viu tudo.
{
  const iHtml = fn.indexOf('container.innerHTML');
  const bloco = fn.slice(iHtml, iHtml + 700);
  ok(/events\.length/.test(bloco),
     '⭐ o cabeçalho continua dizendo QUANTOS eventos existem');
}

// ── ⑤ ⛔ montar sob demanda não pode derrubar a tela ────────────────────────
{
  const iT = fn.indexOf("addEventListener('toggle'");
  const volta = fn.slice(Math.max(0, iT - 300), iT + 900);
  ok(/try\s*\{/.test(volta) && /catch/.test(volta),
     'a montagem sob demanda roda em try/catch');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
