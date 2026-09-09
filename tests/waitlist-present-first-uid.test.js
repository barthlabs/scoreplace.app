// ⏱️ Presença tem CARIMBO DE HORA e caduca em 24h ([[project_presenca_caduca_em_24h]]).
// Produção grava sempre Date.now() (medido: 317/317 valores). O `1`/`1000` que estava
// aqui era atalho de teste, e atalho que não existe no dado real vira teste que mente.
const _AGORA = Date.now();
/* Lista de espera (painel de check-in `_renderStandbyPanel`, bracket.js) — os PRESENTES vêm
 * primeiro, e "presente" é decidido por UID e SÓ uid (dono, 18-jul: "uid only! não pode gravar
 * nada além do uid"). Os mapas t.checkedIn/t.absent guardam APENAS chave-uid pra quem tem conta.
 *
 * FALHA que este teste reproduz (homônimo): dois "Rodrigo" (uR1, uR2). O presente é o uR2. Se o
 * sort resolvesse presença por NOME, `_memberUidByName(t,'Rodrigo')` casaria o PRIMEIRO homônimo
 * (uR1) → mapa não tem uR1 → "ausente" → Rodrigo cairia atrás da Ana. O cânone lê o uid do OBJETO
 * da entrada (uR2) → presente → topo. Um sort por-nome fica VERMELHO aqui; o por-uid passa.
 */
const { window: W } = require('./render-harness');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── waitlist-present-first-uid ────');

// Eliminatória Simples (teamSize 1) — sem ramo de duplas/late-pairing, sem Liga.
// Dois homônimos "Rodrigo" com uids distintos + "Ana". A espera tem o 2º Rodrigo (uR2) e a Ana.
const t = {
  id: 'WLT', format: 'Eliminatórias Simples', teamSize: 1, status: 'active',
  currentPhaseIndex: 0,
  participants: [
    { uid: 'uR1', displayName: 'Rodrigo', name: 'Rodrigo' },
    { uid: 'uR2', displayName: 'Rodrigo', name: 'Rodrigo' },
    { uid: 'uAna', displayName: 'Ana', name: 'Ana' }
  ],
  // Lista de espera: 2º Rodrigo (presente) + Ana (não marcada).
  standbyParticipants: [
    { uid: 'uAna', displayName: 'Ana' },
    { uid: 'uR2', displayName: 'Rodrigo' }
  ],
  // ⚠️ CHECK-IN GRAVADO SÓ POR UID — nenhuma chave-nome. Presente = uR2 (o 2º Rodrigo).
  checkedIn: { 'uR2': _AGORA },
  absent: {},
  matches: []
};
W.AppStore.tournaments = [t];

ok(typeof W._renderStandbyPanel === 'function', '_renderStandbyPanel existe');
ok(typeof W._idMapGet === 'function', '_idMapGet existe');

// (1) presença por uid do OBJETO da entrada, sem chave-nome no mapa
ok(W._idMapGet(t, t.checkedIn, { uid: 'uR2' }) === _AGORA, 'presença lida por uid (uR2) do objeto');
ok(W._idMapGet(t, t.checkedIn, { uid: 'uR1' }) == null, 'o outro homônimo (uR1) NÃO está presente');

// (2) a REPRODUÇÃO da falha: resolver presença por NOME casa o homônimo ERRADO (uR1) → "ausente".
//     _memberUidByName('Rodrigo') devolve o 1º match (uR1), cujo check-in não existe.
ok(W._memberUidByName(t, 'Rodrigo') === 'uR1', 'por-nome resolve o 1º homônimo (uR1) — a armadilha');
ok(W._idMapGet(t, t.checkedIn, 'Rodrigo') == null, 'lookup por-nome NÃO acha o presente (uR2) — a falha');

// (3) o painel real: Rodrigo (presente via uR2) aparece ANTES da Ana (não presente).
const html = W._renderStandbyPanel(t, true);
ok(typeof html === 'string' && html.length > 0, 'painel renderiza HTML');
const iR = html.indexOf('Rodrigo');
const iA = html.indexOf('Ana');
ok(iR !== -1 && iA !== -1, 'ambos os nomes aparecem no painel');
ok(iR < iA, 'PRESENTE (Rodrigo/uR2) vem ANTES do não-presente (Ana) — present-first por uid');

// (4) sanidade uid-only da escrita: _idMapSet de quem tem conta grava a chave-UID (e some a nome)
const m = {};
W._idMapSet(t, m, { uid: 'uR2', displayName: 'Rodrigo' }, 2000);
ok(m['uR2'] === 2000 && m['Rodrigo'] == null, 'write com conta grava SÓ o uid (nunca o nome)');

W._inscritoIndividualCard = () => '<div class="participant-card"><div>card</div></div>';

// (5) Busca + trilha histórica: quem está em W.O. não pode desaparecer do filtro, e o
// painel deve exibir o grupo canônico gravado em woClaims. Reproduz Nathalya no Confra.
W._phasePendingInactives = () => [];
W._phaseWoDeactivated = () => [{ uid: 'uNath', displayName: 'Nathalya Calil', woDeactivatedAt: 1 }];
t.woClaims = [{ absentUids: ['uNath'], absentName: 'Nathalya Calil', groupName: 'R1 Grupo H2' }];
const historico = W._renderStandbyPanel(t, true);
const posNath = historico.indexOf('Nathalya Calil');
ok(posNath !== -1, 'a pessoa em W.O. aparece no painel');
ok(historico.includes('Grupo anterior: R1 Grupo H2'), 'W.O. exibe o grupo de origem do log canônico');
ok(/data-players="[^"]*Nathalya Calil[^"]*"[^>]*data-my-match="1"/.test(historico),
  'a linha W.O. declara data-players e permanece pesquisável também com “Só meus jogos”');

// (6) Mesmo sem espera, o painel preserva a pessoa em W.O. para pesquisa e recuperação.
t.standbyParticipants = [];
const somenteWo = W._renderStandbyPanel(t, true);
ok(somenteWo.includes('Nathalya Calil') && somenteWo.includes('R1 Grupo H2'),
  'W.O. não some quando a lista de espera fica vazia');
ok(somenteWo.includes('participant-card'),
  'W.O. reutiliza o cartão canônico de participante após o avanço de fase');

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ waitlist-present-first-uid FALHOU'); process.exit(1); }
console.log('✅ waitlist-present-first-uid: OK');
