/* FOLGA SEM IDENTIDADE NÃO NASCE.
 *
 * FALHA MEDIDA (09/ago/2026): rodando o motor REAL contra o doc REAL do Confra
 * com os rótulos dos slots apagados (uids mantidos), a rodada gerada vinha com
 * UMA folga a mais — `p1: undefined`, `p1Uid` vazio, sem perfil. Um jogador que
 * não existe, na caixa "Ficaram de fora desta rodada", que nenhum caminho
 * consegue remover depois: não há uid pra casar nem nome pra procurar.
 *
 * Com o guard, o motor passou a gerar rodada IDÊNTICA com e sem os rótulos:
 *   com rótulo: 96 total · 93 jogos · 3 folgas · 31 grupos · 124 pessoas
 *   sem rótulo: 96 total · 93 jogos · 3 folgas · 31 grupos · 124 pessoas
 * É esse empate que torna o rótulo gravado não-load-bearing também no MOTOR
 * (o render já tinha sido fechado na 1.7.79).
 *
 * ⚠️ HONESTIDADE SOBRE A FORÇA DESTE TESTE: eu NÃO consegui reproduzir o
 * fantasma sinteticamente. Tentei entrada vazia, uid órfão (sem perfil) e o
 * fixture `_confra-monarch-fixture.json` — nenhum reproduz (o fixture tem 12
 * pessoas em 3 grupos exatos e nem chega a gerar folga). A reprodução só
 * acontece com o doc de produção COMPLETO, que não cabe no repo.
 * Então aqui vão as duas coisas que EU CONSIGO travar de verdade:
 *   1. o INVARIANTE, contra rodadas que realmente geram folga;
 *   2. a presença e a FORMA do guard (varredura), porque a forma importa.
 * Se alguém reproduzir o fantasma num fixture pequeno, troque isto por ele.
 *
 * ⚠️ O guard exige `!name && !uid` — os DOIS. Só-nome é fictício (sem conta),
 * cuja identidade legítima É o nome digitado; só-uid é inscrito real com o
 * rótulo stripado pelo save. Exigir apenas um barraria gente de verdade.
 */
const fs = require('fs');
const path = require('path');
const { sandbox } = require('./render-harness');
const W = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── folga-sem-identidade ────');

const P = { u1: 'Ana', u2: 'Bruno', u3: 'Carla', u4: 'Diego', u5: 'Elis' };
W._profileNameByUid = Object.assign({}, P);
W._nameForUid = (u) => P[u] || '';
W._displayNameForUid = (u, fb) => P[u] || fb || '';

function mkLiga(extra) {
  const parts = Object.keys(P).map((u) => ({ uid: u, ligaActive: true, categories: ['C'] }));
  if (extra) parts.push(extra);
  return { id: 'LG', name: 'Liga', format: 'Liga', drawMode: 'rei_rainha', status: 'active',
    categories: ['C'], participants: parts, matches: [], rounds: [] };
}
function gera(t) {
  W.AppStore.tournaments = [t]; W._findTournamentById = () => t; W._currentBracketTournament = t;
  if (typeof W._rehydrateEntryNames === 'function') W._rehydrateEntryNames(t);
  const antes = (t.rounds || []).length;
  try { W._generateNextRound(t, null); } catch (e) { return { erro: e.message, f: [] }; }
  const n = (t.rounds || [])[antes] || {};
  return { f: (n.matches || []).filter((m) => m && m.isSitOut) };
}
const idDe = (f) => f.p1 || f.p1Uid || (f.team1Uids || [])[0] || '';

// ─── (1) o INVARIANTE, em rodadas que de fato geram folga ────────────────────
// 5 jogadores em Rei/Rainha (grupos de 4) → sobra 1 → gera folga de verdade.
const r1 = gera(mkLiga());
ok(r1.f.length > 0, 'o cenário exercita mesmo o caminho de folga (senão o teste não vale nada)');
r1.f.forEach((f) => ok(!!idDe(f), 'toda folga gerada identifica alguém — nome OU uid, nunca vazia'));

// com um uid ÓRFÃO (uid real, perfil inexistente) no meio
const r2 = gera(mkLiga({ uid: 'uORFAO', ligaActive: false, categories: ['C'] }));
r2.f.forEach((f) => ok(!!idDe(f), 'com uid órfão no elenco, nenhuma folga sai sem identidade'));

// ─── (2) o que NÃO pode ser barrado ──────────────────────────────────────────
const r3 = gera(mkLiga({ displayName: 'Jogador Fictício', ligaActive: false, categories: ['C'] }));
ok(r3.f.some((f) => idDe(f) === 'Jogador Fictício'),
  'fictício (SEM uid, COM nome digitado) continua recebendo folga — o nome É a identidade dele');

const tD = mkLiga(); tD.participants[4].ligaActive = false;   // Elis desativada (só-uid)
const r4 = gera(tD);
ok(r4.f.some((f) => idDe(f) === 'u5' || idDe(f) === 'Elis'),
  'inscrito real desativado (só-uid, shape de produção) continua recebendo folga');

// ─── (3) a FORMA do guard ────────────────────────────────────────────────────
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket-logic.js'), 'utf8');
ok(/if \(!name && !_uidFolga\) return;/.test(src),
  'o guard existe e exige nome E uid vazios (só-nome ou só-uid seguem passando)');
ok(/_uidFolga = _n2uMap\[name\]/.test(src),
  'o uid da folga sai do mapa nome→uid — a MESMA fonte que o _buildSitOut usa pra gravar p1Uid');

console.log(`  ${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
