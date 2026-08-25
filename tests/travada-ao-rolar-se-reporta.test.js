/* A TRAVADA DURANTE A ROLAGEM TEM QUE SE REPORTAR SOZINHA — com a DIREÇÃO.
 *
 * POR QUE ISTO EXISTE COMO TESTE, e não só como código:
 * esta instrumentação nasceu na 2.0.70, e a reversão da 2.0.72 levou a leva
 * INTEIRA — inclusive a parte que só MEDIA e não mudava tela nenhuma. Resultado:
 * ficamos cegos justamente na dor nº 2 do dono ("rolar cortado, pior pra cima"),
 * e das versões 2.0.72 em diante NENHUM episódio de rolagem chegou ao Sentry.
 *
 * O QUE ELA JÁ PROVOU (iPhone do dono, 25/ago/2026, releases 2.0.70/2.0.71):
 *   scroll-trav: 4708ms · pra-cima · nos=6938 · busca=2 · ultimo=handleDelayElapsed()
 *   scroll-trav: 4461ms · pra-cima · nos=6935 · ultimo=() { window._killDragGhosts(); }
 *   scroll-trav: 1235ms · pra-baixo · nos=11094 · ultimo=Mu:schedule
 *   scroll-trav:  976ms · pra-baixo · nos=6923 · busca=2
 * ⇒ "pior pra cima" é REAL e está medido: ~4,7s subindo contra ~1s descendo.
 * ⇒ e `handleDelayElapsed`/`Mu:schedule` são da fila assíncrona do SDK do
 *    Firestore — a pista de que a travada nasce FORA do código do app.
 *
 * ⛔ Se alguém reverter uma leva de novo, que leve o comportamento e deixe a
 * MEDIÇÃO em pé. É isso que este teste guarda.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('──── travada ao rolar se reporta sozinha (com direção) ────');

const store = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
const dash = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'dashboard.js'), 'utf8');

// ── ① o carimbo de direção existe e é PASSIVO ────────────────────────────────
{
  ok(/_spDirRolagem/.test(store) && /_spUltimaRolagemT/.test(store),
     'o carimbo de rolagem (direção + instante) existe em store.js');
  const bloco = store.slice(store.indexOf('_spUltimaRolagemT'), store.indexOf('_spUltimaRolagemT') + 700);
  ok(/addEventListener\('scroll'/.test(bloco), 'ele escuta o evento de rolagem');
  ok(/passive:\s*true/.test(bloco),
     '⛔ o ouvinte é PASSIVO — instrumentação não pode atrapalhar a rolagem que veio medir');
  ok(/pra-cima/.test(bloco) && /pra-baixo/.test(bloco),
     'e distingue PRA CIMA de PRA BAIXO (o dado que separa "corte só pra cima" de "corte sempre")');
}

// ── ② o aviso de travada-ao-rolar existe, e leva o que importa ───────────────
{
  ok(/scroll-trav:/.test(store), '⭐ a travada durante a rolagem manda aviso próprio (`scroll-trav`)');
  const i = store.indexOf("'scroll-trav: '");
  ok(i > 0, 'o aviso é montado em store.js');
  const msg = store.slice(i, i + 600);
  ok(/_spDirRolagem/.test(msg), 'o aviso leva a DIREÇÃO');
  ok(/foto\.nos|nos=/.test(msg), 'leva o tamanho do DOM (`nos`)');
  ok(/snaps=/.test(msg), 'leva os snapshots em voo (`snaps`)');
  ok(/busca=/.test(msg), 'leva as buscas de descoberta em voo (`busca`)');
  ok(/_ultimoCallback/.test(msg),
     '⭐ e leva o ÚLTIMO callback antes do buraco — foi ele que apontou o SDK do Firestore');
}

// ── ③ ⛔ o campo `busca` NÃO pode ser um zero mentiroso ──────────────────────
// Restaurar a mensagem sem restaurar o contador reportaria `busca=0` sempre.
// Número que mente é pior que campo ausente.
{
  ok(/_discoveryFetches\s*=\s*\(window\._discoveryFetches\s*\|\|\s*0\)\s*\+\s*1/.test(dash),
     '⛔ o contador de buscas é INCREMENTADO no dashboard (senão `busca=` sempre diria 0)');
  const j = dash.indexOf('_discoveryFetches = (window._discoveryFetches');
  const volta = dash.slice(Math.max(0, j - 700), j);
  ok(/re-fetch|loadPublicDiscovery|_publicDiscoveryLastFetch/.test(volta),
     'e ele é incrementado no ponto onde a busca REALMENTE dispara');
}

// ── ④ a cota é por JANELA DE TEMPO, não por sessão ──────────────────────────
// ⛔ ERA por sessão, e no PWA/tela-de-início a sessão dura DIAS. MEDIDO em
// 25/ago: o dono testou, os 3 avisos saíram às 14:07, e nas horas seguintes ele
// voltou a relatar corte com ZERO evento novo. Cota vencida lida como "não
// reproduziu" quase me fez trocar de hipótese.
{
  const i = store.indexOf("'scroll-trav: '");
  const volta = store.slice(Math.max(0, i - 2600), i);
  ok(/_travScrollN/.test(volta) && /<=\s*3/.test(volta),
     'no máximo 3 avisos por janela — telemetria não pode virar a própria enxurrada');
  ok(/_travScrollT/.test(volta) && /600000/.test(volta),
     '⛔ e a cota REARMA a cada 10 min — senão um teste novo nunca produz dado novo');
  ok(/foto\.dur\s*>\s*500/.test(volta),
     'e só reporta travada acima de 500ms (ruído de rolagem normal fica fora)');
}

// ── ④b o aviso leva os TRECHOS caros (o fim do "quem: nenhum") ──────────────
{
  const i = store.indexOf("'scroll-trav: '");
  const msg = store.slice(i, i + 900);
  ok(/trechos/.test(msg),
     '⭐ o aviso leva os trechos caros do momento — é o que substitui "quem: nenhum" por um NOME');
  const volta = store.slice(Math.max(0, i - 700), i);
  ok(/window\._trechos/.test(volta) && /\.dur/.test(volta),
     'e cada trecho vai com a DURAÇÃO (nome sem número não decide nada)');
}

// ── ⑤ só reporta quando a rolagem foi RECENTE ────────────────────────────────
{
  const i = store.indexOf("'scroll-trav: '");
  const volta = store.slice(Math.max(0, i - 2600), i);
  ok(/_spUltimaRolagemT/.test(volta) && /1200/.test(volta),
     'a travada só conta como "ao rolar" se houve rolagem há menos de 1,2s');
}

// ── ⑥ ⛔ é MEDIÇÃO: não pode mexer na tela ───────────────────────────────────
{
  const i = store.indexOf("'scroll-trav: '");
  const bloco = store.slice(Math.max(0, i - 900), i + 700);
  ok(!/innerHTML|classList|style\.|appendChild|removeChild/.test(bloco),
     '⛔ o bloco não toca no DOM — instrumentação que muda a tela deixa de ser instrumentação');
  ok(/try\s*\{/.test(bloco) && /catch/.test(bloco),
     'e roda dentro de try/catch: telemetria quebrada não pode derrubar o app');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
