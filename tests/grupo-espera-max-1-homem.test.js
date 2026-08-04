/* Grupo NOVO formado da LISTA DE ESPERA não fecha com mais de 1 HOMEM.
 *
 * Regra do dono (ago/2026, Confra): "precisamos manter a situação de não fechar um novo
 * grupo, pelo menos por enquanto, com mais de 1 homem no mesmo grupo" — para evitar que
 * "4 homens atrasados formem um grupo mais forte e levem vantagem em cima do atraso".
 *
 * O sorteio INICIAL já garantia isso pelo modo equilibrado. `_tryFormMonarchWaitlistGroups`
 * era o único caminho que ainda montava grupo às cegas: `_plainShuffle` + `splice(0,4)`.
 * Contra o código anterior, o cenário "4 homens na fila" fecha um grupo 100% masculino —
 * é essa a falha que este teste reproduz.
 *
 * GÊNERO VEM DO PERFIL POR UID (a entrada da espera é strippada desde a v1.3.52), então o
 * fixture popula _userProfileCache e deixa a entrada SEM `gender`, como em produção.
 */
const H = require('./render-harness');
const win = H.window;

let ok = 0, fail = 0;
function t(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra ? '  → ' + extra : '')); }
}

const PERFIS = {
  uH1: { displayName: 'Homem 1', gender: 'masculino' },
  uH2: { displayName: 'Homem 2', gender: 'masculino' },
  uH3: { displayName: 'Homem 3', gender: 'masculino' },
  uH4: { displayName: 'Homem 4', gender: 'masculino' },
  uM1: { displayName: 'Mulher 1', gender: 'feminino' },
  uM2: { displayName: 'Mulher 2', gender: 'feminino' },
  uM3: { displayName: 'Mulher 3', gender: 'feminino' },
  uM4: { displayName: 'Mulher 4', gender: 'feminino' },
  uX1: { displayName: 'Sem Genero 1' },
  uX2: { displayName: 'Sem Genero 2' },
  uX3: { displayName: 'Sem Genero 3' },
  uX4: { displayName: 'Sem Genero 4' },
  // 4 pessoas que JÁ estão jogando o grupo pré-existente. Separadas de propósito: usar
  // as mesmas da fila fazia o nome colidir e o grupo dedupar, e o teste media a colisão.
  uJ1: { displayName: 'Jogando 1', gender: 'feminino' },
  uJ2: { displayName: 'Jogando 2', gender: 'feminino' },
  uJ3: { displayName: 'Jogando 3', gender: 'feminino' },
  uJ4: { displayName: 'Jogando 4', gender: 'masculino' }
};
Object.keys(PERFIS).forEach(u => { win._userProfileCache[u] = PERFIS[u]; });
const NOME = u => PERFIS[u].displayName;

// Torneio Rei/Rainha com a rodada 1 já sorteada (é o pré-requisito da função) e a fila
// de espera povoada. As entradas da espera vão SEM gender — igual produção.
function mkT(uidsNaEspera) {
  const t = {
    id: 'tour_wl', name: 'WL', format: 'Liga', ligaRoundFormat: 'rei_rainha',
    creatorUid: 'uOrg', participants: [], status: 'active',
    rounds: [{ round: 1, matches: [], monarchGroups: [] }],
    monarchWaitlist: {}, standbyParticipants: [], waitlist: []
  };
  // 4 pessoas já jogando (o grupo existente da rodada), pra a coluna existir de verdade.
  ['uJ1', 'uJ2', 'uJ3', 'uJ4'].forEach(u => t.participants.push({ uid: u }));
  t.rounds[0].monarchGroups.push({ players: ['uJ1', 'uJ2', 'uJ3', 'uJ4'].map(NOME), matches: [] });
  t.monarchWaitlist['_default_'] = uidsNaEspera.map(NOME);
  uidsNaEspera.forEach(u => t.participants.push({ uid: u }));
  // Torneio sem datas → _tournamentIsSameDay devolve TRUE, e aí a função só forma grupo
  // com quem tem PRESENÇA confirmada (regra que já existia). Sem isto o fixture dava 0 em
  // todo cenário e o teste mediria a pré-condição, não a regra de gênero.
  t.checkedIn = {};
  uidsNaEspera.forEach(u => {
    if (typeof win._idMapSet === 'function') win._idMapSet(t, t.checkedIn, NOME(u), Date.now());
    else t.checkedIn[u] = Date.now();
  });
  return t;
}

function gruposFormados(t) {
  const col = t.rounds[0];
  return (col.monarchGroups || []).slice(1); // o primeiro é o pré-existente
}
function homensNo(grupo) {
  const uidPorNome = {};
  Object.keys(PERFIS).forEach(u => { uidPorNome[PERFIS[u].displayName] = u; });
  return (grupo.players || []).filter(n => (PERFIS[uidPorNome[n]] || {}).gender === 'masculino').length;
}

console.log('\n──── 4 HOMENS na fila: o grupo NÃO fecha ────');
{
  const t = mkT(['uH1', 'uH2', 'uH3', 'uH4']);
  const n = win._tryFormMonarchWaitlistGroups(t, null, 1);
  t2('nenhum grupo formado', n === 0, 'formados=' + n);
  t2('a fila continua intacta', (win._getWaitlist(t) || []).length === 4);
}

console.log('\n──── 1 homem + 3 mulheres: fecha normalmente ────');
{
  const t = mkT(['uH1', 'uM1', 'uM2', 'uX1']);
  const n = win._tryFormMonarchWaitlistGroups(t, null, 1);
  t2('formou 1 grupo', n === 1, 'formados=' + n);
  const gs = gruposFormados(t);
  t2('o grupo tem no máximo 1 homem', gs.length === 1 && homensNo(gs[0]) <= 1,
     gs.length ? JSON.stringify(gs[0].players) : 'sem grupo');
}

console.log('\n──── 2 homens + 6 mulheres: forma 2 grupos, 1 homem em cada ────');
{
  const t = mkT(['uH1', 'uH2', 'uM1', 'uM2', 'uM3', 'uM4', 'uX1', 'uX2']);
  const n = win._tryFormMonarchWaitlistGroups(t, null, 1);
  t2('formou 2 grupos', n === 2, 'formados=' + n);
  const gs = gruposFormados(t);
  const maxH = gs.reduce((a, g) => Math.max(a, homensNo(g)), 0);
  t2('nenhum grupo passou de 1 homem', maxH <= 1, 'maxHomens=' + maxH);
}

// ── REGRESSÃO (ago/2026): o guloso PERDIA um grupo, dependendo do embaralho ───────────
// O cenário acima só pegava o defeito por SORTE — medido: ~21% das ordens. Era essa a
// intermitência que fazia o gate do pre-push falhar sem ninguém ter mexido no sorteio.
// A causa não era o teste: `_pickGrupo` pegava "os 4 primeiros que cabem", gastava os
// não-homens no primeiro grupo e sobrava um pool só de homens que não fechava — com 4
// pessoas esperando à toa, existindo divisão válida. Aqui o embaralho vira DETERMINÍSTICO
// (Math.random semeado), então a falha reaparece sempre que alguém reintroduzir o guloso.
console.log('\n──── 2 homens + 6 mulheres NUNCA perde grupo (qualquer embaralho) ────');
{
  const _random = Math.random;
  let perdidos = 0, pior = null;
  for (let seed = 1; seed <= 120; seed++) {
    let s = seed;
    Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    const t = mkT(['uH1', 'uH2', 'uM1', 'uM2', 'uM3', 'uM4', 'uX1', 'uX2']);
    const n = win._tryFormMonarchWaitlistGroups(t, null, 1);
    const maxH = gruposFormados(t).reduce((a, g) => Math.max(a, homensNo(g)), 0);
    if (n !== 2 || maxH > 1) { perdidos++; if (!pior) pior = 'seed=' + seed + ' grupos=' + n + ' maxHomens=' + maxH; }
  }
  Math.random = _random;
  t2('as 120 ordens formam 2 grupos, sempre com no máximo 1 homem', perdidos === 0,
    perdidos + ' ordem(ns) falharam; 1ª: ' + pior);
}

console.log('\n──── gênero DESCONHECIDO não conta como homem (não trava quem não usa o campo) ────');
{
  const t = mkT(['uX1', 'uX2', 'uX3', 'uX4']);
  const n = win._tryFormMonarchWaitlistGroups(t, null, 1);
  t2('4 sem gênero formam grupo normalmente', n === 1, 'formados=' + n);
}

console.log('\n──── a entrada da espera NÃO carrega gender (como em produção) ────');
{
  const t = mkT(['uH1', 'uM1', 'uM2', 'uM3']);
  const entradas = win._getWaitlist(t) || [];
  t2('nenhuma entrada da fila tem gender gravado',
     entradas.every(e => !e || typeof e !== 'object' || !e.gender));
}

console.log('\n──── TOGGLE do organizador: livre volta a sortear sem restrição ────');
{
  // Desligado ('livre'): os 4 homens fecham grupo — comportamento anterior à 1.7.3.
  const t = mkT(['uH1', 'uH2', 'uH3', 'uH4']);
  t.wlGroupBalance = 'livre';
  const n = win._tryFormMonarchWaitlistGroups(t, null, 1);
  t2('livre → 4 homens FORMAM grupo', n === 1, 'formados=' + n);
  const gs = gruposFormados(t);
  t2('e o grupo é mesmo 100% masculino', gs.length === 1 && homensNo(gs[0]) === 4,
     gs.length ? String(homensNo(gs[0])) : 'sem grupo');
}
{
  // Ligado explicitamente e AUSENTE (default) têm que se comportar igual.
  const a = mkT(['uH1', 'uH2', 'uH3', 'uH4']); a.wlGroupBalance = 'equilibrado';
  const b = mkT(['uH1', 'uH2', 'uH3', 'uH4']);           // sem o campo = default
  t2('equilibrado explícito bloqueia', win._tryFormMonarchWaitlistGroups(a, null, 1) === 0);
  t2('DEFAULT (campo ausente) é equilibrado', win._tryFormMonarchWaitlistGroups(b, null, 1) === 0);
}

console.log('\n──── o toggle existe na UI e é do organizador ────');
{
  const fs2 = require('fs'), path2 = require('path');
  const ui = fs2.readFileSync(path2.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
  const hnd = fs2.readFileSync(path2.join(__dirname, '..', 'js', 'views', 'bracket-ui.js'), 'utf8');
  t2('box da espera tem o toggle', /_toggleWlBalance\(/.test(ui) && /wlGroupBalance/.test(ui));
  // CO-ORGANIZADOR TEM O MESMO PODER DO ORGANIZADOR (regra do dono). Gatear por
  // creatorUid excluiria o co-host EM SILÊNCIO — é exatamente o que estas duas travam.
  t2('render usa _isUserOrgOrCoHost (co-host incluído)',
     /_wlOrg\s*=\s*!!\(typeof window\._isUserOrgOrCoHost/.test(ui));
  t2('render NÃO gateia por creatorUid', !/_wlOrg[\s\S]{0,140}creatorUid/.test(ui));
  t2('handler checa a permissão TAMBÉM na função, incluindo co-host',
     /window\._toggleWlBalance = function[\s\S]{0,900}_isUserOrgOrCoHost[\s\S]{0,140}if\s*\(!_isAdmin\)\s*return;/.test(hnd));
  t2('handler persiste', /syncImmediate|saveTournament/.test(hnd.split('window._toggleWlBalance')[1] || ''));
}

function t2(l, c, e) { t(l, c, e); }

console.log('\n' + ok + ' asserts OK, ' + fail + ' falha(s)');
if (fail) { console.log('❌ grupo-espera-max-1-homem: FALHOU'); process.exit(1); }
console.log('✅ grupo-espera-max-1-homem: OK');
