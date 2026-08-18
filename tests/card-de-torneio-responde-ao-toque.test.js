/* CARD DE TORNEIO RESPONDE AO TOQUE — E POR UMA PORTA SÓ (1.9.48)
 *
 * A FALHA REAL que este teste reproduz:
 *   A 1.9.46 consertou o relato _"o clique no torneio demora um pouco sem NENHUM
 *   feedback visual"_ — mas consertou DENTRO do `_dashCardClick`, que é só da
 *   dashboard. O card da LISTA de torneios (`tournaments.js`) navegava com
 *   `onclick="window.location.hash='#tournaments/…'"` cru: mesma espera de ler o dado
 *   e montar a tela, feedback NENHUM. O dono reabriu o bug porque tocou pela lista.
 *
 * O que se trava aqui é o INVARIANTE, não o mecanismo:
 *   1. nenhum card de torneio navega escrevendo `location.hash` direto no onclick —
 *      todo mundo entra por `_openTournamentCard` (a porta única em store.js);
 *   2. a porta dá o sinal ANTES de navegar (mostra o loader e só depois troca a hash —
 *      invertido, o `hashchange` esconderia o loader que acabou de aparecer);
 *   3. existe realce de toque em CSS (`:active`), que é o único que responde no MESMO
 *      quadro do dedo, sem depender de JS;
 *   4. o realce não usa propriedade que os cards cravam INLINE (transform/box-shadow),
 *      senão o estilo inline ganha da folha e o realce não aparece.
 *
 * ⚠️ Forma NOVA de abrir torneio por card entra NESTE arquivo — a regra tem que
 * continuar valendo em UMA porta só, que é exatamente o que a 1.9.46 não garantiu.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let falhas = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); return; }
  falhas++;
  console.log('  ✗ ' + msg);
}

console.log('\nCARD DE TORNEIO RESPONDE AO TOQUE (porta única)');

const store = ler('js/store.js');
const dashboard = ler('js/views/dashboard.js');
const tournaments = ler('js/views/tournaments.js');
const componentsCss = ler('css/components.css');

// ── 1. A PORTA EXISTE ────────────────────────────────────────────────────────
ok(/window\._openTournamentCard\s*=\s*function/.test(store),
   'store.js define a porta única `_openTournamentCard`');

// ── 2. NENHUM CARD NAVEGA POR FORA DA PORTA ──────────────────────────────────
// A assinatura da falha: um `onclick` que escreve a hash do torneio na mão.
// (Só olhamos ONCLICK: `location.hash = '#tournaments/…'` dentro de função JS é
//  legítimo — é como o resto do app navega depois de decidir alguma coisa.)
const ONCLICK_COM_HASH_CRUA = /onclick=(["'])(?:(?!\1).)*?location\.hash\s*=\s*[^;]*#tournaments\//g;
[['js/views/dashboard.js', dashboard], ['js/views/tournaments.js', tournaments]].forEach(function ([nome, src]) {
  const achados = src.match(ONCLICK_COM_HASH_CRUA) || [];
  ok(achados.length === 0,
     nome + ': nenhum card navega escrevendo location.hash no onclick — achei ' + achados.length +
     (achados.length ? ' → ' + achados[0].slice(0, 90) : ''));
});

// O card da LISTA (o que reabriu o bug) tem que citar a porta nominalmente.
ok(/onclick="window\._openTournamentCard\(event/.test(tournaments),
   'o card da LISTA de torneios abre pela porta única');
ok(/_openTournamentCard\(event, tournamentId\)/.test(dashboard),
   'o `_dashCardClick` da dashboard delega pra mesma porta (não tem cópia da regra)');

// ── 3. O SINAL VEM ANTES DA NAVEGAÇÃO ────────────────────────────────────────
const corpoPorta = (store.match(/window\._openTournamentCard\s*=\s*function[\s\S]*?\n};/) || [''])[0];
const posLoader = corpoPorta.indexOf('_showLoading');
const posHash = corpoPorta.indexOf('location.hash');
ok(posLoader > -1, 'a porta mostra o "Abrindo o torneio…"');
ok(posLoader > -1 && posHash > -1 && posLoader < posHash,
   'o loader entra ANTES de trocar a hash (invertido, o hashchange o apagaria)');

// ── 4. GUARDA DE "NÃO NAVEGA" SOBREVIVEU À UNIFICAÇÃO ────────────────────────
// Tocar no toggle da Liga ou num botão dentro do card não pode abrir o torneio.
ok(/data-liga-toggle-tid/.test(corpoPorta),
   'a porta preserva a guarda do toggle da Liga');
ok(/button, input, label, select, textarea/.test(corpoPorta),
   'a porta preserva a guarda de botão/campo dentro do card');

// ── 5. REALCE DE TOQUE EM CSS (o único que responde sem JS) ──────────────────
const cssSemComentario = componentsCss.replace(/\/\*[\s\S]*?\*\//g, '');
const regraActive = (cssSemComentario.match(/\.card\[onclick\]:active[^{]*\{[^}]*\}/) || [''])[0];
ok(regraActive.length > 0,
   'existe realce `:active` para card clicável (responde no mesmo quadro do toque)');
ok(/outline/.test(regraActive),
   'o realce usa `outline` — propriedade que os cards NÃO cravam inline');
// transform e box-shadow são escritos inline nos cards de torneio; usá-los aqui seria
// escrever uma regra que nunca pinta (estilo inline ganha de folha).
ok(!/transform|box-shadow/.test(regraActive),
   'o realce NÃO depende de transform/box-shadow (o inline do card venceria)');
// opacity/clarear/escurecer invertem de leitura entre os dois temas.
ok(!/opacity/.test(regraActive),
   'o realce NÃO usa opacity (inverte de leitura entre tema claro e escuro)');

// ── 6. O REALCE PRECISA EXISTIR NO IPHONE ────────────────────────────────────
// WKWebView/Safari só aplicam `:active` em elemento que não é link se o documento
// tiver algum ouvinte de toque. Sem isto a regra do item 5 é letra morta no aparelho.
ok(/addEventListener\('touchstart'[\s\S]{0,80}passive:\s*true/.test(store),
   'há ouvinte de touchstart passivo no documento (destrava :active no iOS)');

console.log(falhas === 0
  ? '\n✅ card de torneio: porta única + resposta ao toque\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
