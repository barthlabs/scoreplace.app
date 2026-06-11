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
  'tournaments-utils.js',      // _isLigaFormat, _calcNextDrawDate
  'tournaments-categories.js', // _displayCategoryName, _sortCategoriesBySkillOrder, _getParticipantCategories, _participantInCategory
  'bracket-model.js',          // _appendCanonicalColumn
  'bracket-logic.js',          // _computeStandings, _generateNextRound, geradores Rei/Rainha + padrão + round-robin
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
