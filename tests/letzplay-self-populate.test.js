const core = require('../functions/letzplay-self-populate-core.js');

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) { pass++; return; }
  fail++;
  console.error('  ✗ ' + message);
}
function throws(fn, message) {
  let didThrow = false;
  try { fn(); } catch (_) { didThrow = true; }
  ok(didThrow, message);
}

console.log('\n── autopreenchimento pelo scan do letzplay ──');

// REGRESSÃO DO DEFEITO: este cálculo vivia no navegador e gravava direto em
// users/{uid}. As Rules negavam (campos de servidor) e o catch engolia o erro,
// então a categoria checada nunca chegava ao perfil. Aqui ele é núcleo puro e a
// gravação é da Function — o navegador não envia valor nenhum.
const cheio = core.build({
  scanDoc: { scan: { gender: 'feminino', profileSkill: 'B' } },
  profile: {}, currentImport: null
});
ok(cheio.profile.gender === 'feminino', 'gênero ausente é completado pelo scan');
ok(cheio.profile.skillBySport['Beach Tennis'] === 'B', 'categoria checada entra na modalidade do letzplay');
ok(cheio.profile.skillBySportSource['Beach Tennis'] === 'letzplay',
  'a fonte marca apuração, não autodeclaração');

const generoDeclarado = core.build({
  scanDoc: { scan: { gender: 'feminino' } },
  profile: { gender: 'masculino' }, currentImport: null
});
ok(generoDeclarado.profile.gender === undefined, 'gênero já declarado não é sobrescrito pelo scan');

const declaradaPerde = core.build({
  scanDoc: { scan: { profileSkill: 'B' } },
  profile: { skillBySport: { 'Beach Tennis': 'C' }, skillBySportSource: { 'Beach Tennis': 'declarada' } },
  currentImport: null
});
ok(declaradaPerde.profile.skillBySport['Beach Tennis'] === 'B',
  'categoria checada vence a declarada');

const jaAplicado = core.build({
  scanDoc: { scan: { profileSkill: 'B' } },
  profile: { skillBySport: { 'Beach Tennis': 'B' }, skillBySportSource: { 'Beach Tennis': 'letzplay' } },
  currentImport: null
});
ok(Object.keys(jaAplicado.profile).length === 0, 'aplicar o mesmo scan de novo não gera escrita');

const outraModalidade = core.build({
  scanDoc: { scan: { profileSkill: 'B' } },
  profile: { skillBySport: { 'Padel': 'A' } }, currentImport: null
});
ok(outraModalidade.profile.skillBySport.Padel === 'A',
  'habilidade de outra modalidade é preservada');

console.log('\n── import completo trazido por organizador ──');

const importNovo = core.build({
  scanDoc: {
    fullImport: { footprint: ['x'], games: [1, 2, 3], handle: '@ana' },
    scannedByName: 'Org', tournamentName: 'Confra', scannedAt: '2026-09-01'
  },
  profile: {}, currentImport: null
});
ok(importNovo.import && importNovo.import.importedVia === 'organizer', 'import registra a procedência');
ok(importNovo.import.importedByName === 'Org' && importNovo.import.importedTournamentName === 'Confra',
  'import guarda quem escaneou e em qual torneio');
ok(importNovo.profile.letzplayHandle === '@ana', 'handle ausente é completado pelo import');

const importVelho = core.build({
  scanDoc: { fullImport: { footprint: ['x'], games: [1] } },
  profile: {}, currentImport: { games: [1, 2, 3] }
});
ok(importVelho.import === null, 'org-scan com menos jogos não sobrescreve import mais completo');

/* ⛔ O DEFEITO QUE O CONTRATO ANTIGO TINHA. O import de quem já migrou vive em
 * `users/{uid}/letzplay/import`, e o campo `users/{uid}.letzplayImport` fica VAZIO.
 * Lendo o perfil, o núcleo via "sem import" e deixava um org-scan menor regredir
 * um histórico maior. Aqui o perfil está vazio DE PROPÓSITO: o import chega só
 * pelo `currentImport`, como quem chama tem de resolvê-lo. */
const importNoSubdoc = core.build({
  scanDoc: { fullImport: { footprint: ['x'], games: [1, 2] } },
  profile: {},
  currentImport: { games: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }
});
ok(importNoSubdoc.import === null,
  'import que só existe no subdocumento NÃO é regredido por org-scan menor');

// A borda gêmea: com o subdocumento realmente vazio, o org-scan entra.
const subdocVazio = core.build({
  scanDoc: { fullImport: { footprint: ['x'], games: [1, 2] } },
  profile: {},
  currentImport: null
});
ok(subdocVazio.import && subdocVazio.import.games.length === 2,
  'sem import atual, o org-scan é aplicado');

const handleExistente = core.build({
  scanDoc: { fullImport: { footprint: ['x'], games: [1, 2], handle: '@nova' } },
  profile: { letzplayHandle: '@antiga' }, currentImport: null
});
ok(handleExistente.profile.letzplayHandle === undefined, 'handle já definido não é trocado');

const semFootprint = core.build({
  scanDoc: { fullImport: { games: [1, 2, 3] } },
  profile: {}, currentImport: null
});
ok(semFootprint.import === null, 'import sem footprint não é aceito');

// gamesTotal: import antigo truncava `games` sem zerar `gamesTotal`, então o
// total declarado precisa vencer a lista quando for maior.
ok(core.gamesTotal({ games: [1, 2], gamesTotal: 40 }) === 40, 'total declarado vence a lista truncada');
ok(core.gamesTotal({ games: [1, 2] }) === 2, 'sem total declarado, vale a lista');
ok(core.gamesTotal(null) === 0, 'sem import, zero jogos');

console.log('\n── entradas ruins ──');
const vazio = core.build({ scanDoc: {}, profile: {}, currentImport: null });
ok(Object.keys(vazio.profile).length === 0 && vazio.import === null,
  'scan sem nada aproveitável não gera escrita e não quebra');
throws(() => core.build(null), 'entrada que não é objeto é recusada');
throws(() => core.build({ scanDoc: {}, profile: {} }),
  'esquecer currentImport é ERRO DE CHAMADA, não import vazio');
/* A borda que passaria despercebida: `currentImport: variavelQueVeioUndefined` TEM a
 * propriedade, mas não tem resposta. É a cara exata do defeito, então também recusa.
 * Só `null` significa "procurei e não há". */
throws(() => core.build({ scanDoc: {}, profile: {}, currentImport: undefined }),
  'currentImport undefined é recusado — só null diz "procurei e não há"');

if (fail) {
  console.error('\n❌ letzplay-self-populate: ' + pass + ' ok, ' + fail + ' falharam');
  process.exit(1);
}
console.log('\n✅ letzplay-self-populate: ' + pass + ' ok');
