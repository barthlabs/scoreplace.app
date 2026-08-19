/* A IMAGEM DO TORNEIO NÃO ENTRA NA STRING DE HTML
 * node tests/imagem-do-torneio-fora-do-html.test.js
 *
 * A FALHA REAL, medida nos documentos de produção (18/ago/2026):
 *   `coverPhotoData`/`logoData` são base64 dentro do doc do torneio — até 194 KB num
 *   único torneio. Os cards os concatenavam DENTRO do HTML:
 *       'background-image: ... url(' + t.coverPhotoData + ')'
 *       '<img src="' + t.logoData + '">'
 *   Montar a lista virava construir uma string com ~100 KB POR CARD e mandar o parser
 *   engolir tudo na thread principal. Não é o número de jogos que trava a abertura —
 *   é a imagem viajando como TEXTO.
 *
 * O contrato: a imagem é pintada DEPOIS que o card existe, pelo hidratador, a partir do
 * dado que já está em memória (`AppStore`) — mesma imagem, sem ida à rede, sem passar
 * pelo parser de HTML.
 *
 * ⚠️ Forma nova de render de card entra NESTE arquivo. São DOIS renderizadores de card
 * de torneio (dashboard e lista) e eles já divergiram antes — ver
 * [[project_two_participant_card_renderers]].
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let falhas = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); return; }
  falhas++; console.log('  ✗ ' + msg);
}

console.log('\nA IMAGEM DO TORNEIO NÃO ENTRA NA STRING DE HTML');

const store = ler('js/store.js');
const RENDERIZADORES = [
  ['js/views/dashboard.js', ler('js/views/dashboard.js')],
  ['js/views/tournaments.js', ler('js/views/tournaments.js')],
];

// ── 1. NENHUM CARD CONCATENA A BASE64 NO HTML ────────────────────────────────
// Estas duas são exatamente as formas que existiam e custavam ~100 KB por card.
const NO_CSS = /url\(\s*['"]?\s*\+\s*t\.(coverPhotoData|logoData)/;
const NO_IMG = /src\s*=\s*\\?["'][^"']*['"]\s*\+\s*t\.(logoData|coverPhotoData)/;
RENDERIZADORES.forEach(function ([nome, src]) {
  ok(!NO_CSS.test(src), nome + ': não injeta a imagem em `url(...)` do HTML');
  ok(!NO_IMG.test(src), nome + ': não injeta a imagem no `src=` do HTML');
  // e o card precisa marcar quem o hidratador deve pintar, senão a foto some da tela
  ok(/data-tcover-tid/.test(src), nome + ': marca o card com `data-tcover-tid` pro hidratador');
});
ok(/data-tlogo-tid/.test(RENDERIZADORES[0][1]),
   'js/views/dashboard.js: a linha compacta marca o logo com `data-tlogo-tid`');

// ── 2. O HIDRATADOR EXISTE E LÊ DA MEMÓRIA (não da rede) ─────────────────────
ok(/window\._hydrateTournamentPhotos\s*=\s*function/.test(store),
   'o hidratador `_hydrateTournamentPhotos` existe');
const corpo = (store.match(/window\._hydrateTournamentPhotos\s*=\s*function[\s\S]*?\n  \};/) || [''])[0];
ok(corpo.length > 0, 'consegui isolar o corpo do hidratador');
ok(/data-tcover-tid/.test(corpo) && /data-tlogo-tid/.test(corpo),
   'o hidratador atende capa E logo');
// 1.9.51: a imagem foi pro Storage e o doc guarda a URL. Quem resolve "onde está a
// imagem" é o acessor canônico — o hidratador NÃO pode voltar a ler o campo cru, senão
// torneio migrado (que só tem `logoUrl`) aparece sem foto.
ok(/_tourCoverSrc/.test(corpo) && /_tourLogoSrc/.test(corpo),
   'ele pinta pelo acessor canônico (serve URL do Storage E base64 antiga)');
ok(!/t\.coverPhotoData|t\.logoData/.test(corpo),
   'e NÃO lê o campo cru direto (torneio migrado ficaria sem imagem)');
// se for à rede, troca-se custo de parse por espera — o dado JÁ está em AppStore.
ok(!/fetch\(|_callCF|\.get\(\)|onSnapshot/.test(corpo),
   'o hidratador NÃO vai à rede (o dado já está em AppStore)');
ok(/data-tcover-done/.test(corpo) && /data-tlogo-done/.test(corpo),
   'marca quem já foi pintado — re-render não repinta tudo de novo');

// ── 3. A CAPA NÃO ESPERA O DEBOUNCE DE REDE ──────────────────────────────────
// O gatilho é compartilhado com a foto do LOCAL, que é debounced em 250ms porque vai à
// CF. Se a do torneio entrasse no mesmo balde, trocaríamos "HTML pesado" por "card que
// pisca de cinza pra foto" — regressão visível, ganho invisível.
const kick = (store.match(/function _kick\(\)[\s\S]*?\n  \}/) || [''])[0];
const posTorneio = kick.indexOf('_hydrateTournamentPhotos');
const posTimer = kick.indexOf('setTimeout');
ok(posTorneio > -1 && posTimer > -1 && posTorneio < posTimer,
   'a foto do torneio é pintada ANTES do setTimeout (não espera os 250ms da foto do local)');

console.log(falhas === 0
  ? '\n✅ a imagem é pintada depois do card, não dentro do HTML\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
