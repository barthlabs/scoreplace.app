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
  uM5: { displayName: 'Mulher 5', gender: 'feminino' },
  uM6: { displayName: 'Mulher 6', gender: 'feminino' },
  // perfil EXISTE mas o campo gênero está em branco
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
// ⭐ 2.1: a proporção agora é EXPLÍCITA em cada cenário. Antes todos herdavam o default do
// app — que era 25/75 — e por isso o arquivo inteiro parecia falar de "no máximo 1 homem"
// quando na verdade falava do DEFAULT. Com o default virando 50/50 (ordem do dono, 22/ago),
// separar as duas coisas é o que mantém honesto o que cada caso prova:
//   • '25/75' → a regra de agosto ("não fechar grupo novo com mais de 1 homem"), que é o que
//     a Confra tem gravado. Ela continua valendo onde foi pedida.
//   • sem ratio → o default do app, hoje 50/50.
function mkT(uidsNaEspera, ratio) {
  const t = {
    id: 'tour_wl', name: 'WL', format: 'Liga', ligaRoundFormat: 'rei_rainha',
    creatorUid: 'uOrg', participants: [], status: 'active',
    rounds: [{ round: 1, matches: [], monarchGroups: [] }],
    monarchWaitlist: {}, standbyParticipants: [], waitlist: []
  };
  // 4 pessoas já jogando (o grupo existente da rodada), pra a coluna existir de verdade.
  ['uJ1', 'uJ2', 'uJ3', 'uJ4'].forEach(u => t.participants.push({ uid: u }));
  t.rounds[0].monarchGroups.push({ players: ['uJ1', 'uJ2', 'uJ3', 'uJ4'].map(NOME), matches: [] });
  // QUEM ESTÁ NA ESPERA NÃO ESTÁ NO ELENCO (v1.7.16). O fixture antigo empurrava a fila
  // pra dentro de t.participants — e era só por isso que `_buildNameToUid` (que varre
  // EXATAMENTE t.participants) conseguia resolver os nomes e o gênero era enxergado.
  // Em produção o inscrito tardio fica em standbyParticipants + monarchWaitlist e NUNCA
  // em participants, então o mapa nascia vazio e a regra de equilíbrio ficava cega — foi
  // assim que o "R1 Grupo B2" do Confra fechou com 3 homens e `playersUids` todos nulos.
  // Modelar isso errado era o que deixava o gate verde com o bug vivo.
  if (ratio) t.genderRatio = ratio;
  t.monarchWaitlist['_default_'] = uidsNaEspera.map(NOME);
  uidsNaEspera.forEach(u => t.standbyParticipants.push({
    uid: u, addedAt: '2026-08-04T10:00:00.000Z', selfEnrolled: true, ligaActive: true
  }));
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

// ── O DEFAULT DO APP: 50/50 TRAVADO (ordem do dono, 22/ago/2026) ─────────────────────
// _"o default 50-50 para o app. na confra é setado para 25-75."_ E, perguntado sobre a
// consequência de 1 homem + 3 mulheres deixar de fechar: _"50/50 travado mesmo"_.
// O caso extremo que a regra de agosto existia pra impedir — 4 homens atrasados fechando um
// grupo forte — continua impedido: 50/50 exige 2+2, então 4H e 3H+1M também não fecham.
console.log('\n──── DEFAULT do app (50/50 travado) ────');
{
  const t = mkT(['uH1', 'uM1', 'uM2', 'uM3']);       // sem ratio → default
  t2('1 homem + 3 mulheres NÃO fecha (precisa de 2+2)',
     win._tryFormMonarchWaitlistGroups(t, null, 1) === 0);
}
{
  const t = mkT(['uH1', 'uH2', 'uM1', 'uM2']);
  const n = win._tryFormMonarchWaitlistGroups(t, null, 1);
  const gs = gruposFormados(t);
  t2('2 homens + 2 mulheres fecha', n === 1, 'formados=' + n);
  t2('e o grupo é 2+2', gs.length === 1 && homensNo(gs[0]) === 2,
     gs.length ? JSON.stringify(gs[0].players) : 'sem grupo');
}
{
  const t = mkT(['uH1', 'uH2', 'uH3', 'uH4']);
  t2('4 homens continuam sem fechar grupo (o medo de agosto segue coberto)',
     win._tryFormMonarchWaitlistGroups(t, null, 1) === 0);
}

console.log('\n──── 4 HOMENS na fila: o grupo NÃO fecha ────');
{
  const t = mkT(['uH1', 'uH2', 'uH3', 'uH4'], '25/75');
  const n = win._tryFormMonarchWaitlistGroups(t, null, 1);
  t2('nenhum grupo formado', n === 0, 'formados=' + n);
  t2('a fila continua intacta', (win._getWaitlist(t) || []).length === 4);
}

console.log('\n──── 1 homem + 3 mulheres: fecha normalmente ────');
{
  const t = mkT(['uH1', 'uM1', 'uM2', 'uM3'], '25/75');
  const n = win._tryFormMonarchWaitlistGroups(t, null, 1);
  t2('formou 1 grupo', n === 1, 'formados=' + n);
  const gs = gruposFormados(t);
  t2('o grupo tem no máximo 1 homem', gs.length === 1 && homensNo(gs[0]) <= 1,
     gs.length ? JSON.stringify(gs[0].players) : 'sem grupo');
}

console.log('\n──── 2 homens + 6 mulheres: forma 2 grupos, 1 homem em cada ────');
{
  const t = mkT(['uH1', 'uH2', 'uM1', 'uM2', 'uM3', 'uM4', 'uM5', 'uM6'], '25/75');
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
    const t = mkT(['uH1', 'uH2', 'uM1', 'uM2', 'uM3', 'uM4', 'uM5', 'uM6'], '25/75');
    const n = win._tryFormMonarchWaitlistGroups(t, null, 1);
    const maxH = gruposFormados(t).reduce((a, g) => Math.max(a, homensNo(g)), 0);
    if (n !== 2 || maxH > 1) { perdidos++; if (!pior) pior = 'seed=' + seed + ' grupos=' + n + ' maxHomens=' + maxH; }
  }
  Math.random = _random;
  t2('as 120 ordens formam 2 grupos, sempre com no máximo 1 homem', perdidos === 0,
    perdidos + ' ordem(ns) falharam; 1ª: ' + pior);
}

// ── v1.7.16: ASSERÇÃO REVOGADA DE PROPÓSITO ──────────────────────────────────────────
// Até aqui este bloco exigia o CONTRÁRIO — "4 sem gênero formam grupo normalmente" (n===1),
// sob o argumento de não travar quem não preenche o campo. O dono revogou depois do
// incidente do "R1 Grupo B2" no Confra (ago/2026), onde um grupo fechou com 3 homens:
//   "sem genero determinado tem que travar. nao pode assumir nem ser homem, nem ser mulher."
// O invariante que a asserção antiga defendia (não bloquear gratuitamente) NÃO sumiu: ele
// virou o toggle 'livre' e o cenário "conhecidos formam, desconhecido espera", ambos abaixo.
console.log('\n──── sem gênero determinado NÃO entra em grupo (revoga a regra da v1.7.3) ────');
{
  const t = mkT(['uX1', 'uX2', 'uX3', 'uX4']);
  const n = win._tryFormMonarchWaitlistGroups(t, null, 1);
  t2('4 sem gênero NÃO formam grupo', n === 0, 'formados=' + n);
  t2('e continuam na fila (não perdem o lugar)', (win._getWaitlist(t) || []).length === 4);
}

console.log('\n──── conhecidos fecham; o desconhecido espera (não bloqueia os outros) ────');
{
  const t = mkT(['uH1', 'uM1', 'uM2', 'uM3', 'uX1'], '25/75');
  const n = win._tryFormMonarchWaitlistGroups(t, null, 1);
  t2('formou 1 grupo com os 4 de gênero declarado', n === 1, 'formados=' + n);
  const gs = gruposFormados(t);
  t2('o desconhecido NÃO foi para o grupo',
     gs.length === 1 && gs[0].players.indexOf(NOME('uX1')) === -1,
     gs.length ? JSON.stringify(gs[0].players) : 'sem grupo');
  t2('e segue na fila', (win._getWaitlist(t) || []).some(e => win._pName(e, '') === NOME('uX1')));
}

// ── REPRODUÇÃO DO INCIDENTE (Confra, 04/ago/2026) ────────────────────────────────────
// O B2 fechou com 3 homens e saiu com `playersUids: [null,null,null,null]`. A causa não foi
// o cálculo do teto: `_isHomem` resolvia o gênero por um mapa nome→uid montado a partir do
// nome GRAVADO em t.participants — que a entrada strippada não tem — e dois dos quatro
// tinham se inscrito minutos antes, com o perfil ainda fora do cache. O mapa saiu vazio,
// todo mundo virou "não-homem", H=0 e o teto nunca foi testado.
// Aqui o perfil de quem chegou por último NÃO é registrado no cache, exatamente como em
// produção. Contra o código anterior este bloco fecha um grupo e fica VERMELHO.
console.log('\n──── perfil FORA do cache não vira "não-homem" (o bug do B2) ────');
{
  const FANTASMA = 'Recem Inscrito';           // sem entrada em _userProfileCache
  const t = mkT(['uH1', 'uH2', 'uH3']);
  t.monarchWaitlist['_default_'].push(FANTASMA);
  t.standbyParticipants.push({ uid: 'uFantasma', displayName: FANTASMA, addedAt: '2026-08-04T16:17:00.000Z' });
  if (typeof win._idMapSet === 'function') win._idMapSet(t, t.checkedIn, FANTASMA, Date.now());
  const n = win._tryFormMonarchWaitlistGroups(t, null, 1);
  t2('3 homens + 1 perfil não resolvido NÃO formam grupo', n === 0, 'formados=' + n);
}

console.log('\n──── a fila do Confra (4 homens + 1 mulher, 2 sem gênero) não fecha grupo ────');
{
  // Paulo, Renato, Gersom (masculino no perfil) + Vini e Ana Lúcia (gênero em branco).
  const t = mkT(['uH1', 'uH2', 'uH3', 'uX1', 'uX2']);
  const n = win._tryFormMonarchWaitlistGroups(t, null, 1);
  t2('nenhum grupo formado', n === 0, 'formados=' + n);
  t2('os 5 continuam na fila', (win._getWaitlist(t) || []).length === 5);
}

console.log('\n──── o grupo formado carrega uid REAL nos slots (nunca null) ────');
{
  const t = mkT(['uH1', 'uM1', 'uM2', 'uM3'], '25/75');
  win._tryFormMonarchWaitlistGroups(t, null, 1);
  const gs = gruposFormados(t);
  t2('playersUids sem nenhum null', gs.length === 1 && (gs[0].playersUids || []).length === 4
     && gs[0].playersUids.every(u => !!u), gs.length ? JSON.stringify(gs[0].playersUids) : 'sem grupo');
  const ms = (t.rounds[0].matches || []).filter(m => m.isMonarch);
  t2('os 3 jogos têm team1Uids/team2Uids preenchidos', ms.length === 3
     && ms.every(m => (m.team1Uids || []).every(u => !!u) && (m.team2Uids || []).every(u => !!u)),
     JSON.stringify(ms.map(m => [m.team1Uids, m.team2Uids])));
}

console.log('\n──── uid vem da ENTRADA da espera quando o nome não está no elenco ────');
{
  // Produção: standbyParticipants guarda a entrada com uid e SEM nome (strippada).
  const t = mkT([], '25/75');
  t.monarchWaitlist['_default_'] = ['uH1', 'uM1', 'uM2', 'uM3'].map(NOME);
  ['uH1', 'uM1', 'uM2', 'uM3'].forEach(u => {
    t.standbyParticipants.push({ uid: u, addedAt: '2026-08-04T10:00:00.000Z' });
    if (typeof win._idMapSet === 'function') win._idMapSet(t, t.checkedIn, NOME(u), Date.now());
  });
  const n = win._tryFormMonarchWaitlistGroups(t, null, 1);
  t2('formou 1 grupo resolvendo o gênero pela entrada da fila', n === 1, 'formados=' + n);
  const gs = gruposFormados(t);
  t2('com no máximo 1 homem', gs.length === 1 && homensNo(gs[0]) <= 1,
     gs.length ? JSON.stringify(gs[0].players) : 'sem grupo');
}

console.log('\n──── a entrada da espera NÃO carrega gender (como em produção) ────');
{
  const t = mkT(['uH1', 'uM1', 'uM2', 'uM3'], '25/75');
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
// ── OS DOIS EIXOS NÃO SE CONFUNDEM (v1.7.16) ─────────────────────────────────────────
// `wlGroupBalance` = a PROPORÇÃO está travada?   `_drawBalanceMode` = o SORTEIO é livre?
// Destravar a proporção NÃO libera quem está sem gênero (decisão do dono: "nunca, nem
// flexibilizando"). Quem não tem regra de gênero nenhuma é o SORTEIO LIVRE.
{
  const t = mkT(['uX1', 'uX2', 'uX3', 'uX4']);
  t.wlGroupBalance = 'livre';                 // proporção DESTRAVADA
  t2('proporção destravada NÃO libera quem está sem gênero',
     win._tryFormMonarchWaitlistGroups(t, null, 1) === 0);
}
{
  const t = mkT(['uX1', 'uX2', 'uX3', 'uX4']);
  t._drawBalanceMode = 'livre';               // SORTEIO livre: sem proporção e sem gênero
  t2('sorteio LIVRE forma normalmente, sem olhar gênero',
     win._tryFormMonarchWaitlistGroups(t, null, 1) === 1);
}
{
  // 4 homens: no sorteio livre não há proporção pra proteger, então fecham.
  const t = mkT(['uH1', 'uH2', 'uH3', 'uH4']);
  t._drawBalanceMode = 'livre';
  t2('sorteio LIVRE deixa 4 homens fecharem', win._tryFormMonarchWaitlistGroups(t, null, 1) === 1);
}
{
  // 25/75 destravado com 4 homens: 0 exatos → flexibiliza e inclui os 4.
  const t = mkT(['uH1', 'uH2', 'uH3', 'uH4']);
  t.wlGroupBalance = 'livre';
  t2('proporção destravada flexibiliza e inclui os 4 homens',
     win._tryFormMonarchWaitlistGroups(t, null, 1) === 1);
}

// ── A PORTA RECUSA DE VERDADE (v1.7.17) ──────────────────────────────────────────────
// Regra do dono: "não quero que coloque 4 num grupo para depois perceber que quebrou a
// regra." Os testes acima provam que o PLANEJADOR não emite grupo torto — mas a garantia
// que o dono pediu é que, mesmo se ele emitisse, o grupo NÃO NASCERIA. Aqui o planejador é
// sabotado de propósito pra devolver 4 homens; o motor tem de recusar na porta.
console.log('\n──── grupo torto NÃO NASCE, mesmo se o planejador falhar ────');
{
  const real = win._planGroupsByRatio;
  const t0 = mkT(['uH1', 'uH2', 'uH3', 'uH4']);
  // planejador sabotado: entrega um grupo 100% masculino como se fosse válido
  win._planGroupsByRatio = function (poolArr) {
    return { groups: [poolArr.slice(0, 4).map(p => p.key)], leftover: [], flexed: 0 };
  };
  let n;
  try { n = win._tryFormMonarchWaitlistGroups(t0, null, 1); }
  finally { win._planGroupsByRatio = real; }
  t2('a porta recusou o grupo de 4 homens', n === 0, 'formados=' + n);
  t2('e nenhum grupo foi anexado à rodada', gruposFormados(t0).length === 0);
  t2('os 4 continuam na fila', (win._getWaitlist(t0) || []).length === 4);
}
{
  // e o caminho bom continua passando pela porta sem ser barrado
  const t1 = mkT(['uH1', 'uM1', 'uM2', 'uM3'], '25/75');
  t2('grupo válido (1H+3M) NÃO é barrado pela porta',
     win._tryFormMonarchWaitlistGroups(t1, null, 1) === 1);
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
