// DUPLA TARDIA VIRANDO "#10" NA CHAVE — o bug ao vivo de 26/jul/2026.
//
// Dono: _"havia dado presença para a equipe previamente formada e correu tudo certo. de 2 equipes
// passou para 1 equipe. daí formei nova equipe com os individuais e eles entraram, mas a equipe
// formada previamente não."_ + _"tirei a presença e coloquei de novo e nem muda mais de 2 para 1.
// a equipe está no limbo."_
//
// MEDIDO no doc real (tour_1785038880593_sb): a dupla ENTROU — é o `team2Obj` do jogo
// p0-VC-R1-P5 (`_sig` C5|normal:#9 x #10). O que falhou foi o CARIMBO do slot:
//   • rótulo `p2 = "#10"` em vez do nome  → na tela lê-se "não entrou" (e o limbo é aparente:
//     ela está na chave, então deixa de ser candidata e o contador não muda mais — correto);
//   • `team2Uids` com UM uid só, e `p2Uid` preenchido como se a dupla fosse 1v1.
// Causa: o inscrito grava SÓ uid (cânone) — a entrada da espera é {uid,p1Uid,p2Uid} sem
// displayName — e o adapter lia `p.displayName || p.name` e `p.uids || [p.uid]`.
//
// Trava aqui: rótulo pela FONTE ÚNICA de nome (_pName, uid→perfil vivo) e identidade pela
// FONTE ÚNICA de uid (_participantUids, TODOS), nos dois carimbos do adapter (sorteio e
// crescimento) — mais a CURA do doc já gravado.
// Ver [[project_uid_identity_canon_locked]] / [[feedback_uid_controls_everything_name_only_ficticio]].
const { window: W, sandbox, load } = require('./headless');
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: {} };
sandbox.AppStore = { tournaments: [], logAction: () => {}, sync: () => {} };
const _ss = {};
sandbox.sessionStorage = { getItem: k => (k in _ss ? _ss[k] : null), setItem: (k, v) => { _ss[k] = String(v); }, removeItem: k => { delete _ss[k]; } };
load('identity-core.js');   // _participantUids/_idMap* — cânone de identidade
load('persist-core.js');
load('tournaments-draw.js');

// cache de perfis por uid: é daqui que o nome vivo sai (o mesmo papel do _preloadDrawNames na CF)
const NOMES = { wyzum: 'Catia Cavedon', gtTy: 'Max Mano', Nw1L: 'Luiza Ruic', WgGJ: 'Cynara Quiroz' };
W._displayNameForUid = (uid, stored) => NOMES[uid] || stored || '';
W._pName = function (p, fb) {
  if (!p) return fb || '';
  if (typeof p === 'string') return p;
  if (p.p1Uid || p.p2Uid) {
    const a = W._displayNameForUid(p.p1Uid, p.p1Name), b = W._displayNameForUid(p.p2Uid, p.p2Name);
    if (a && b) return a + ' / ' + b;
  }
  return W._displayNameForUid(p.uid, p.displayName || p.name) || fb || '';
};

const A = W._chavesAdapter;
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

function pares(n, off) {
  const a = [];
  for (let i = 1; i <= n; i++) { const k = (off || 0) + i; const nm = 'A' + k + ' / B' + k; a.push({ p1Uid: 'a' + k, p1Name: 'A' + k, p2Uid: 'b' + k, p2Name: 'B' + k, displayName: nm, name: nm }); }
  return a;
}
// A entrada REAL do doc: dupla SÓ-UID, sem displayName/name/pXName (o inscrito grava só uid)
const soUid = { uid: 'wyzum', p1Uid: 'wyzum', p2Uid: 'gtTy', category: 'Misto Obrig.', categorySource: 'perfil' };
const nova = { uid: 'Nw1L', p1Uid: 'Nw1L', p2Uid: 'WgGJ', category: 'Misto Obrig.' };

// ── 1. CRESCIMENTO (chave cheia, entram aos pares) — era aqui que nascia o "#10" ──────────
(function () {
  const base = A.build(8, 'dupla', { participantes: pares(8), ns: 'p0' });
  const g = A.crescerComPrefixo(base.matches, [nova, soUid], 'dupla', { ns: 'p0' });
  ok(g.ok, 'crescimento com 2 duplas tardias aplica — got ' + (g.ok ? 'ok' : g.motivo));
  const novo = (g.matches || []).filter(m => m.round === 1 && (m.bracket === 'main' || m.bracket === 'upper')).pop();

  ok(novo.p1 === 'Luiza Ruic / Cynara Quiroz', 'slot p1: nome vivo por uid, não "#N" — got ' + JSON.stringify(novo.p1));
  ok(novo.p2 === 'Catia Cavedon / Max Mano', 'slot p2: dupla SÓ-UID sai com NOME, não "#10" — got ' + JSON.stringify(novo.p2));
  ok(!/^#\d+$/.test(String(novo.p1)) && !/^#\d+$/.test(String(novo.p2)), 'nenhum slot fica com rótulo cru "#N"');

  const u1 = (novo.team1Uids || []).slice().sort().join('|');
  const u2 = (novo.team2Uids || []).slice().sort().join('|');
  ok(u1 === 'Nw1L|WgGJ', 'team1Uids = OS DOIS uids da dupla — got ' + JSON.stringify(novo.team1Uids));
  ok(u2 === 'gtTy|wyzum', 'team2Uids = OS DOIS uids da dupla — got ' + JSON.stringify(novo.team2Uids));
  ok(novo.p1Uid == null && novo.p2Uid == null, 'dupla NÃO grava pXUid (isso é hint de 1v1) — got ' + JSON.stringify([novo.p1Uid, novo.p2Uid]));
  ok(novo.team2Obj && novo.team2Obj.p2Uid === 'gtTy', 'team2Obj preservado (identidade completa da entrada)');
})();

// ── 2. SORTEIO NORMAL (build) — mesmo carimbo, mesmo cânone ──────────────────────────────
(function () {
  const b = A.build(4, 'simples', { participantes: [soUid].concat(pares(3)), ns: 'p0' });
  const m1 = b.matches.filter(m => m.round === 1)[0];
  const alvo = [m1.p1, m1.p2].find(x => /Catia|#/.test(String(x)));
  ok(alvo === 'Catia Cavedon / Max Mano', 'sorteio inicial: dupla só-uid também sai com NOME — got ' + JSON.stringify(alvo));
  const campo = (m1.p1 === alvo) ? 'team1Uids' : 'team2Uids';
  ok((m1[campo] || []).slice().sort().join('|') === 'gtTy|wyzum', 'sorteio inicial: os DOIS uids no slot — got ' + JSON.stringify(m1[campo]));
})();

// ── 3. CURA do doc JÁ gravado (o torneio ao vivo) ────────────────────────────────────────
// Reproduz o jogo exatamente como está no Firestore: p2="#10", sem team2Uids, com team2Obj.
(function () {
  const t = {
    id: 'sb', format: 'Dupla Eliminatória', teamSize: 2, currentPhaseIndex: 0,
    participants: [soUid, nova],
    matches: [{
      id: 'p0-VC-R1-P5', bracket: 'upper', round: 1, phaseIndex: 0,
      p1: 'Luiza Ruic / Cynara Quiroz', p2: '#10',
      p1Seed: 9, p2Seed: 10, winner: null,
      team1Obj: nova, team2Obj: soUid,
      _sig: 'C5|normal:#9 x #10'
    }]
  };
  const n = W._stampMissingMatchUids(t);
  const m = t.matches[0];
  ok(n > 0, 'a cura reporta conserto (n>0) — got ' + n);
  ok(m.p2 === 'Catia Cavedon / Max Mano', 'doc corrompido: "#10" vira o nome real — got ' + JSON.stringify(m.p2));
  ok((m.team2Uids || []).slice().sort().join('|') === 'gtTy|wyzum', 'doc corrompido: team2Uids reconstruído dos DOIS uids — got ' + JSON.stringify(m.team2Uids));
  ok((m.team1Uids || []).slice().sort().join('|') === 'Nw1L|WgGJ', 'doc corrompido: team1Uids idem — got ' + JSON.stringify(m.team1Uids));
  // idempotente: 2ª passada não mexe em nada
  ok(W._stampMissingMatchUids(t) === 0, 'cura é IDEMPOTENTE (2ª passada não conserta nada)');
})();

// ── 3b. o doc que a CF DEVOLVE é curado no MESMO tick ────────────────────────────────────
// A cura existia mas rodava 1× por sessão AO ABRIR a chave. O slot cru nasce DEPOIS — quando
// o organizador forma a dupla e a CF grava — então ele formava e seguia vendo "#10" até
// recarregar a página. Trava o CALL SITE: _applyCFTournament cura o doc que acabou de chegar.
(function () {
  W.AppStore.tournaments = [{ id: 'sb3', matches: [] }];
  let rerender = 0;
  W._rerenderBracket = function () { rerender++; };
  W._softRefreshView = function () {};
  const doc = {
    id: 'sb3', format: 'Dupla Eliminatória', teamSize: 2, currentPhaseIndex: 0,
    participants: [soUid, nova],
    matches: [{
      id: 'p0-VC-R1-P5', bracket: 'upper', round: 1, phaseIndex: 0,
      p1: 'Luiza Ruic / Cynara Quiroz', p2: '#10', p1Seed: 9, p2Seed: 10,
      team1Obj: nova, team2Obj: soUid
    }]
  };
  W._applyCFTournament('sb3', doc);
  const guardado = W.AppStore.tournaments.find(x => String(x.id) === 'sb3');
  const m = guardado.matches[0];
  ok(m.p2 === 'Catia Cavedon / Max Mano', 'doc da CF chega curado — "#10" já vira nome sem recarregar — got ' + JSON.stringify(m.p2));
  ok((m.team2Uids || []).slice().sort().join('|') === 'gtTy|wyzum', 'doc da CF chega com os DOIS uids — got ' + JSON.stringify(m.team2Uids));
  ok(rerender > 0, 'a tela é re-renderizada depois da cura');
})();

// ── 4. jogo com placar/rótulo legítimo não é tocado ──────────────────────────────────────
(function () {
  const t = {
    id: 'sb2', format: 'Eliminatórias Simples', currentPhaseIndex: 0, participants: [],
    matches: [{ id: 'p0-VC-R1-P1', bracket: 'main', round: 1, phaseIndex: 0, p1: 'TBD', p2: 'BYE (Avança Direto)', isBye: true }]
  };
  ok(W._stampMissingMatchUids(t) === 0, 'TBD/BYE não são "rótulo cru" — a cura não inventa nada');
  ok(t.matches[0].p2 === 'BYE (Avança Direto)', 'BYE preservado');
})();

console.log((fail ? '❌' : '✅') + ' late-entry-slot-label-uid: ' + pass + ' ok, ' + fail + ' falhas');
fails.forEach(f => console.log('   ✗ ' + f));
process.exit(fail ? 1 : 0);
