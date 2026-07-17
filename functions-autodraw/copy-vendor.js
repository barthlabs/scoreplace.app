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
  'identity-core.js',
  'persist-core.js',          // _participantUids, _memberUidByName, _idMap*, _entryHasVip (cânone uid)
  'sport-rules.js',            // window.SPORT_RULES — dep de format2 (allowsSingles/teamSize)
  'tournaments-utils.js',      // _isLigaFormat, _calcNextDrawDate
  'tournaments-categories.js', // _displayCategoryName, _sortCategoriesBySkillOrder, _getParticipantCategories, _participantInCategory
  'format2.js',                // FORMAT2.normalize/compileToPhases — CONFIGURADOR canônico (fmt2 → phases)
  'bracket-model.js',          // _appendCanonicalColumn
  'bracket-logic.js',          // _computeStandings, _generateNextRound, geradores Rei/Rainha + padrão + round-robin
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
