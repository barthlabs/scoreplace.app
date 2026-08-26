// copy-vendor.js — sincroniza a lógica de sorteio do cliente para o Cloud Function.
//
// O autoDraw (server-side) precisa rodar EXATAMENTE a mesma lógica de sorteio
// que o app (cliente) — Rei/Rainha, duplas, equilíbrio, categorias, desempate.
// Em vez de duplicar/portar (que dá drift), copiamos os arquivos-fonte reais
// para ./vendor/ e os carregamos num shim Node (ver draw-core.js).
//
// Roda automaticamente no predeploy (ver firebase.json) — então o que sobe pro
// servidor é SEMPRE a versão atual do cliente. Zero drift.
//
// Uso manual: `node copy-vendor.js`

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '..', 'js', 'views');
const OUT_DIR = path.resolve(__dirname, 'vendor');

// Ordem não importa pra cópia; o draw-core carrega na ordem certa.
const FILES = [
  // ⭐ FASE 2 — o tradutor documento ⇄ subcoleções. Mora aqui (js/views/) porque agora
  // os DOIS lados usam: o gatilho `tournamentMirror` DIVIDE, e o app REMONTA ao abrir um
  // torneio cujos jogos já saíram do documento. Duas cópias divergiriam, e a regra do
  // módulo é `remontar(dividir(t)) === t` — divergir aqui é perder jogo na tela.
  'tournament-split-core.js',
  'identity-core.js',
  'persist-core.js',          // _participantUids, _memberUidByName, _idMap*, _entryHasVip (cânone uid)
  'waitlist-core.js',          // _getWaitlist/_removeFromWaitlist/_nameForms/_sanitizeWaitlistVsGroups
  'standings-core.js',         // _standingsCompare — cadeia de desempate padrão (tabela E transição)
  'gender-ratio-core.js',      // proporção de gênero do sorteio equilibrado (o motor chama no servidor)
  'sport-rules.js',            // window.SPORT_RULES — dep de format2 (allowsSingles/teamSize)
  'tournaments-utils.js',      // _isLigaFormat, _calcNextDrawDate
  // _countCompetitors/_waitlistPeopleCount — as contagens que o CARTÃO mostra. O
  // resumo (tournamentSummary) TEM que usar estas, não uma cópia: medido em
  // 25/ago/2026, uma reimplementação divergia em 10 dos 28 torneios da base real.
  // Tem DOM, mas só dentro de funções que o servidor nunca chama (mesma regra do
  // tournaments-draw.js; conferido no load).
  'tournaments.js',
  'tournaments-categories.js', // _displayCategoryName, _sortCategoriesBySkillOrder, _getParticipantCategories, _participantInCategory
  'format2.js',                // FORMAT2.normalize/compileToPhases — CONFIGURADOR canônico (fmt2 → phases)
  'bracket-model.js',          // _appendCanonicalColumn
  'bracket-logic.js',          // _computeStandings, _generateNextRound, geradores Rei/Rainha + padrão + round-robin
  'chaves.js',                 // window._chaves — desenho determinístico da chave: f(N, formato). Sem estado.
  'chaves-adapter.js',         // window._chavesAdapter — desenho → matches do app, com id ESTRUTURAL (p0-VC-R1-P3)
  'bracket-ui.js',             // _applyResultToTournament (fecho de rodada re-aplica o placar deferido) — DOM só em funções que o servidor não chama
  'phases-engine.js',          // _phasesEngine.generatePhase — motor multi-fase (lógica pura)
  'phase-generators.js',       // _phaseGen — geradores de fase (depende de phases-engine)
  // _buildPhase0Cfg/_buildPhase0Pool/_formDoublesTeams/_buildDoubleElimBracket/
  // _buildRepechageDoubleElim/_applyMixedOriginCategories — os helpers do SORTEIO INICIAL.
  // O arquivo tem DOM (painéis/diálogos), mas só dentro de funções que o servidor NUNCA
  // chama — no load ele é limpo (mesma regra do _fireLigaAutoDraw, ver README).
  'tournaments-draw.js',
  // checkPowerOf2/checkOddEntries/_diagnoseAll/_soloMoveOut — o diagnóstico e os núcleos
  // de elenco que a resolução usa. Mesmo caso do tournaments-draw.js: tem DOM (painéis),
  // mas só DENTRO de funções que o servidor nunca chama; no load é limpo (verificado).
  'tournaments-draw-prep.js',
  // _applyDrawDecisions + núcleos PUROS extraídos dos handlers de painel (resto/pow2/
  // ímpar/chamada). É o que faz o servidor aplicar a decisão do organizador ao elenco
  // com a MESMA função do cliente. Ver docs/sorteio-ciclo-decisoes.md.
  'draw-decisions.js',
];

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

let copied = 0;
for (const f of FILES) {
  const src = path.join(SRC_DIR, f);
  const dst = path.join(OUT_DIR, f);
  if (!fs.existsSync(src)) {
    console.error(`[copy-vendor] FONTE AUSENTE: ${src}`);
    process.exit(1);
  }
  fs.copyFileSync(src, dst);
  copied++;
  console.log(`[copy-vendor] ${f} (${fs.statSync(dst).size} bytes)`);
}
console.log(`[copy-vendor] ✓ ${copied} arquivos sincronizados em vendor/`);

/* ── O TRADUTOR TAMBÉM VAI PRO functions/ (2.0.120) ───────────────────────────
 * ⛔ MEDIDO: `functions/index.js` tinha ZERO menção à divisão (`grep -c` = 0). O
 * `enrollParticipant` mora lá e fazia `tx.get(docRef)` → `computeEnroll(snap.data(), …)`.
 * Num torneio DIVIDIDO o campo `participants` do documento é `[]`, então ele conferia
 * lotação e duplicata contra uma lista VAZIA e gravava o novo inscrito num campo que a
 * leitura (`montarDoBanco`) sobrescreve com a subcoleção. A pessoa sumia.
 * Não chegou a acontecer: medido no Confra, 148 uids no doc = 148 docs em `inscritos` e
 * `participants: []` — ninguém se inscreveu depois da divisão.
 * ⭐ A regra da chave do inscrito (`chaveDoInscrito`) NÃO pode ser reescrita lá: duas
 * cópias divergem, e divergir numa chave é gravar o registro de A por cima do de B.
 * Por isso o arquivo viaja — mesma fonte, dois destinos. */
const OUT_FN = path.resolve(__dirname, '..', 'functions', 'vendor');
const SO_FUNCTIONS = ['tournament-split-core.js'];
if (!fs.existsSync(OUT_FN)) fs.mkdirSync(OUT_FN, { recursive: true });
for (const f of SO_FUNCTIONS) {
  fs.copyFileSync(path.join(SRC_DIR, f), path.join(OUT_FN, f));
  console.log(`[copy-vendor] functions/vendor/${f}`);
}
