// test-orphan-uid.js — REPRODUZ o bug real do Ranking (staging, jul/2026): a tela do
// ranking mostrava chips "Desativados" com o UID CRU no lugar do nome
// ("4kAMPQI3w1hDlmwjjrBR5AyLOS12 +0 PA"), e o uid ficou GRAVADO em m.p1 dos sit-outs.
//
// Cenário: a pessoa recriou a conta (uid novo) e a inscrição ficou apontando pro uid
// VELHO. Como o storage é só-uid (o save stripa displayName), a entrada órfã fica sem
// NENHUMA forma de resolver nome → o resolvedor caía em `|| uid` e devolvia o uid, que
// o motor de sorteio usa COMO NOME e grava no doc.
//
// Este teste FALHA no código antigo (uid vaza) e PASSA no corrigido. Roda: `node test-orphan-uid.js`.

const { generateLigaRound } = require('./draw-core.js');

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('  ✗ ' + msg); failures++; }
  else console.log('  ✓ ' + msg);
}

// Um uid Firebase real tem 28 chars alfanuméricos, sem espaço. É assim que a gente
// reconhece "vazou uid" sem depender do valor exato.
const looksLikeUid = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{20,40}$/.test(s.trim());

const ORPHAN_UID = '4kAMPQI3w1hDlmwjjrBR5AyLOS12';   // sem users/, sem contato (caso real)
const ORPHAN_EMAIL_UID = 'y6SumFPdi6SvgKpJHNx2yUdvj0m2'; // sem users/, com e-mail (caso real)

// 12 jogadores: 10 com perfil + 2 órfãos (uid sem users/). Os órfãos entram como
// INATIVOS, que é exatamente onde os chips vazaram na tela.
function mkTournament() {
  const parts = [];
  for (let i = 1; i <= 10; i++) parts.push({ uid: 'u' + i, ligaActive: true });
  // Órfão SEM contato nenhum — o pior caso: só o uid existe.
  parts.push({ uid: ORPHAN_UID, ligaActive: false });
  // Órfão COM e-mail — deve exibir o e-mail (decisão do dono, jul/2026).
  parts.push({ uid: ORPHAN_EMAIL_UID, email: 'camila@millideas.com.br', ligaActive: false });
  return {
    id: 'mock-orphan', name: 'Ranking', format: 'Liga',
    ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', ligaDrawMode: 'standard',
    equilibrado: true, balanceBy: 'individual', temporada: true,
    teamSize: 2, gameTypes: 'duplas', enrollmentMode: 'individual',
    combinedCategories: [], participants: parts, rounds: [], standings: [],
  };
}

console.log('\n[ÓRFÃO] inscrição apontando pra uid sem users/ — o uid NUNCA pode virar nome');

// Espelha o index.js: popula o cache SÓ com os perfis que existem. Os dois órfãos
// ficam de fora de propósito — é essa a essência do bug.
const draw = require('./draw-core.js');
global.window._profileNameByUid = {};
for (let i = 1; i <= 10; i++) global.window._profileNameByUid['u' + i] = 'Jogador ' + i;

const t = mkTournament();
const r = generateLigaRound(t, new Date('2026-07-15T19:00:00-03:00'));
assert(r.ok, 'sorteio gerou rodada (reason=' + (r.reason || 'ok') + ')');

const col = t.rounds[t.rounds.length - 1] || {};
const matches = col.matches || [];
const sitOuts = matches.filter(m => m && m.isSitOut);
const inactive = sitOuts.filter(m => m.sitOutReason === 'inactive');

assert(inactive.length === 2, 'os 2 órfãos viraram sit-out inactive (got ' + inactive.length + ')');

// ── O CORAÇÃO DO TESTE ──────────────────────────────────────────────────────────
// Nenhum slot gravado pode conter um uid. Era exatamente isto que estava no Firestore.
const leaked = [];
matches.forEach(m => {
  ['p1', 'p2'].forEach(k => { if (looksLikeUid(m[k])) leaked.push(m.id + '.' + k + ' = ' + m[k]); });
  ['team1', 'team2'].forEach(k => (Array.isArray(m[k]) ? m[k] : []).forEach(n => {
    if (looksLikeUid(n)) leaked.push(m.id + '.' + k + '[] = ' + n);
  }));
});
(col.monarchGroups || []).forEach(g => (g.players || []).forEach(n => {
  if (looksLikeUid(n)) leaked.push('grupo ' + (g.name || '?') + '.players[] = ' + n);
}));
assert(leaked.length === 0, 'NENHUM uid gravado como nome em slot/grupo — vazamentos: ' +
  (leaked.length ? '\n      ' + leaked.join('\n      ') : '0'));

// A identidade real continua no slot de uid — o nome é só display.
const orphanSitOut = inactive.filter(m => m.p1Uid === ORPHAN_UID)[0];
assert(!!orphanSitOut, 'o sit-out do órfão guarda a identidade em p1Uid (não no nome)');

// Órfão COM e-mail → exibe o e-mail (decisão do dono: "exibir pelo e-mail gravado").
const emailSitOut = inactive.filter(m => m.p1Uid === ORPHAN_EMAIL_UID)[0];
assert(emailSitOut && emailSitOut.p1 === 'camila@millideas.com.br',
  'órfão com e-mail exibe o e-mail (got ' + (emailSitOut ? JSON.stringify(emailSitOut.p1) : 'sit-out não achado') + ')');

// Órfão SEM contato → rótulo neutro. O sufixo do uid dá unicidade: o nome é CHAVE no
// motor, então dois rótulos iguais fariam um dos dois sumir do sorteio.
assert(orphanSitOut && /^Jogador sem perfil \(/.test(String(orphanSitOut.p1)),
  'órfão sem contato exibe rótulo neutro (got ' + (orphanSitOut ? JSON.stringify(orphanSitOut.p1) : '—') + ')');

// Dois órfãos sem contato não podem colidir num nome só.
const t2 = { ...mkTournament(), participants: [
  ...Array.from({ length: 10 }, (_, i) => ({ uid: 'u' + (i + 1), ligaActive: true })),
  { uid: '4kAMPQI3w1hDlmwjjrBR5AyLOS12', ligaActive: false },
  { uid: 'fApj7n2jwkf9SSsRso0PsI2ER3W2', ligaActive: false },
], rounds: [], standings: [] };
generateLigaRound(t2, new Date('2026-07-15T19:00:00-03:00'));
const inact2 = ((t2.rounds[t2.rounds.length - 1] || {}).matches || [])
  .filter(m => m && m.isSitOut && m.sitOutReason === 'inactive');
const names2 = inact2.map(m => m.p1);
assert(new Set(names2).size === names2.length,
  'dois órfãos sem contato recebem rótulos DISTINTOS (got ' + JSON.stringify(names2) + ')');

// ── Não-regressão: quem TEM perfil segue resolvendo pelo nome vivo ──────────────
const withProfile = matches.filter(m => !m.isSitOut && !m.isBye);
let named = 0;
withProfile.forEach(m => (m.team1 || []).concat(m.team2 || []).forEach(n => {
  if (/^Jogador \d+$/.test(n)) named++;
}));
assert(named > 0, 'jogadores COM perfil seguem com o nome vivo do perfil (got ' + named + ')');

console.log(failures === 0 ? '\n✅ TODOS OS TESTES PASSARAM' : '\n❌ ' + failures + ' FALHA(S)');
process.exit(failures === 0 ? 0 : 1);
