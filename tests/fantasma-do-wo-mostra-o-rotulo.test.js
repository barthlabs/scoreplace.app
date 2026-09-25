'use strict';
/* ⛔⛔ O ADVERSÁRIO AUSENTE DO W.O. APARECE COM O RÓTULO — MEDIDO NO RENDERIZADOR REAL.
 *
 * Quando o organizador dá W.O. individual numa dupla sem substituto, o parceiro segue jogando
 * contra um adversário sintético, e o app fabrica para ele um uid `ghostwo_…`
 * (js/views/wo-core.js). Não existe `users/ghostwo_…`.
 *
 * ⚠️ ESTE TESTE NASCEU DE UM ERRO MEU (24/set/2026). Medi a FUNÇÃO isolada —
 * `_displayName('ghostwo_…', 'Jogador X')` devolve `''` — e concluí que a tela mostrava o
 * placeholder "…". Cheguei a planejar uma leva para "consertar". Renderizando de verdade, o
 * card mostra **"Jogador X"**: o rótulo do slot não passa pelo uid. Retorno de função não é
 * o que a tela entrega, e o repositório já tinha essa regra registrada — eu a usei o dia todo
 * e falhei nela aqui. [[feedback_medir_com_dado_real_antes_de_teorizar]]
 *
 * O teste fica para que o contrário também não volte: se alguém "consertar" o caminho do uid e
 * o rótulo sumir, isto reprova.
 */
const path = require('path');
const W = require(path.join(__dirname, 'render-harness')).window;

let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }

console.log('──── o fantasma do W.O. mostra o rótulo ────');

const GHOST = 'ghostwo_manual_game135_cristina';   // uid real, colhido do Confra
const m = {
  id: 'g135', p1: 'Fulano / Beltrano', p2: 'Cristina / Jogador X',
  team1Uids: ['uid-fulano-0001', 'uid-beltrano-01'],
  team2Uids: ['uid-cristina-001', GHOST],
  team2Obj: { p1Uid: 'uid-cristina-001', p1Name: 'Cristina', p2Uid: GHOST, p2Name: 'Jogador X' }
};
const t = { id: 't1', participants: [], matches: [m] };

ok(typeof W._teamAvatarHtml === 'function', 'o renderizador do lado do jogo existe no harness');
const html = String(W._teamAvatarHtml(m.p2, null, t, null, m) || '');

ok(/Jogador X/.test(html),
  '⛔ o card mostra "Jogador X" — o rótulo do slot NÃO depende de resolver o uid pelo perfil');
ok(/Cristina/.test(html), 'e o parceiro de verdade continua aparecendo ao lado');
ok(html.indexOf(GHOST) === -1,
  'o uid sintético não vaza para o HTML — nem como marcador de hidratação');

/* A função isolada devolve vazio, e ISSO ESTÁ CERTO: sem conta não há perfil para resolver.
 * Foi ler este vazio como "a tela mostra …" que me fez inventar um defeito. */
ok(W._displayName(GHOST, 'Jogador X') === '',
  'a função de nome por conta devolve vazio para o sintético — e a tela não depende dela aqui');
ok(W._displayName('jog_07_x', 'Jogador 07') === 'Jogador 07',
  'o prefixo legado de placeholder deriva o rótulo do próprio uid, como sempre');

/* ⛔ E o cânone do uid não pode ser atropelado por nenhum "conserto" deste caminho: conta de
 * verdade sem perfil carregado sai VAZIA de propósito, para a hidratação preencher — nome
 * gravado ENVELHECE. */
ok(W._displayName('uid-conta-real-01', 'Nome Gravado Velho') === '',
  '⛔ conta de verdade sem perfil continua vazia — nome gravado nunca é reserva');

console.log(fail ? `❌ fantasma-do-wo-mostra-o-rotulo: ${fail} falha(s), ${pass} ok`
                 : `✅ fantasma-do-wo-mostra-o-rotulo: ${pass} ok`);
process.exit(fail ? 1 : 0);
