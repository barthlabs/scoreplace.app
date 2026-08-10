/* O SAVE ATRASADO NÃO DESFAZ UMA TROCA JÁ APLICADA.
 *
 * INCIDENTE REAL QUE ESTE TESTE REPRODUZ (Confra, 09–10/ago/2026):
 * a substituição de Denise Mamesso por Carol Moresco foi aplicada pelo app e conferida
 * no banco. ~2h depois um SAVE ATRASADO a desfez sozinho — o dono estava SEM INTERNET
 * desde as 10h, então não foi ato de ninguém: foi uma aba com cópia velha gravando.
 *
 * POR QUE OS GUARDS DE 1.7.26–1.7.35 NÃO PEGARAM:
 * eles perguntam "sumiu rodada/jogo/pessoa?" — e aqui NADA sumiu. A cópia velha mandou
 * os MESMOS 3 jogos com o CONTEÚDO antigo (Denise de volta no lugar da Carol). O único
 * guard que olha conteúdo de escalação é o carimbo `rosterAt` (1.7.33), e ele tinha
 * DOIS buracos, os dois medidos:
 *
 *   (A) O CARIMBO SÓ NASCIA NUM DOS DOIS CAMINHOS DE ESCRITA. `saveTournament` carimba;
 *       `mutateTournament` (a TRANSAÇÃO — por onde passam W.O., substituição e formação
 *       de grupo, ou seja TUDO que roda com o torneio já sorteado) NÃO carimbava. Então
 *       a troca legítima ia pro banco SEM carimbo, e o save atrasado que chegava depois
 *       era lido como "primeira troca da vida" → ACEITO. É exatamente este incidente.
 *       Mesma família do [[project_roster_guard_single_rule]]: dois caminhos protegendo
 *       o mesmo invariante com regras diferentes é o próprio bug.
 *
 *   (B) O CARIMBO SÓ OLHAVA O SLOT DO JOGO. A pessoa num grupo Rei/Rainha vive em QUATRO
 *       estruturas, e a CLASSIFICAÇÃO do grupo sai de `rounds[i].monarchGroups[g].players[]`
 *       — que não estava em `_ROSTER`. Dava pra proteger os 3 jogos e a classificação
 *       continuar mostrando o ausente.
 *
 * A REGRA: uma troca de escalação ACEITA carimba o instante (`rosterAt`). Um save cujo
 * carimbo é mais VELHO que o do banco está devolvendo o passado — a escalação do banco
 * vence. Slot do jogo e elenco do grupo seguem a MESMA regra.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.console = console;
sandbox._warn = sandbox._log = sandbox._error = sandbox._debug = () => {};
sandbox._safeHtml = (s) => String(s == null ? '' : s);
sandbox.showNotification = () => {};
sandbox.navigator = { userAgent: 'node' };
sandbox.document = { getElementById: () => null, addEventListener() {} };
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
sandbox._participantUids = (p) => {
  if (!p || typeof p !== 'object') return [];
  return [p.uid, p.p1Uid, p.p2Uid].filter(Boolean);
};
sandbox._mergeMemberUids = (t, prev, next) => Array.from(new Set([].concat(prev || [], next || [])));
sandbox._stripStoredNamesForUidEntries = (a) => a;
sandbox.firebase = { firestore: Object.assign(() => ({}), { FieldValue: { delete: () => '__del__' } }) };

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-db.js'), 'utf8'),
  sandbox, { filename: 'firebase-db.js' });
const DB = sandbox.FirestoreDB;
DB._computeAdminEmails = () => [];
DB._computeAdminUids   = () => [];
DB._computeMemberUids  = (d) => (d.participants || []).flatMap(sandbox._participantUids);
DB._foldMonarchGroups  = () => {};
DB._cleanUndefined     = (d) => JSON.parse(JSON.stringify(d));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── save atrasado não desfaz troca ────');

// Firestore falso com as DUAS portas de escrita: o save solto e a transação.
function mkDb(doc) {
  const st = { doc: doc };
  const ref = {
    get: async () => ({ exists: !!st.doc, data: () => JSON.parse(JSON.stringify(st.doc)) }),
    set: async (d) => { st.doc = JSON.parse(JSON.stringify(d)); }
  };
  return {
    _banco: () => st.doc,
    collection: () => ({ doc: () => ref }),
    runTransaction: async (fn) => fn({
      get: async () => ({ exists: !!st.doc, data: () => JSON.parse(JSON.stringify(st.doc)) }),
      set: (r, d) => { st.doc = JSON.parse(JSON.stringify(d)); }
    })
  };
}

const P = (uid) => ({ uid: uid, addedAt: '2026-08-01T00:00:00Z' });

// Grupo Rei/Rainha REAL: 4 pessoas, 3 jogos de parceiros rotativos, e o elenco do
// grupo (`players`/`playersUids`) — que é DE ONDE SAI A CLASSIFICAÇÃO.
function torneioComGrupo(quem, quemUid) {
  return {
    id: 'T-confra',
    participants: [P('u-ana'), P('u-bia'), P('u-cid'), P(quemUid)],
    rounds: [{
      round: 1,
      monarchGroups: [{
        groupIdx: 0,
        players: ['Ana', 'Bia', 'Cid', quem],
        playersUids: ['u-ana', 'u-bia', 'u-cid', quemUid],
        matchIds: ['g0m1', 'g0m2', 'g0m3']
      }],
      matches: [
        { id: 'g0m1', monarchGroup: 0, p1: 'Ana / Bia',   p2: 'Cid / ' + quem,
          team1Uids: ['u-ana', 'u-bia'], team2Uids: ['u-cid', quemUid] },
        { id: 'g0m2', monarchGroup: 0, p1: 'Ana / Cid',   p2: 'Bia / ' + quem,
          team1Uids: ['u-ana', 'u-cid'], team2Uids: ['u-bia', quemUid] },
        { id: 'g0m3', monarchGroup: 0, p1: 'Ana / ' + quem, p2: 'Bia / Cid',
          team1Uids: ['u-ana', quemUid], team2Uids: ['u-bia', 'u-cid'] }
      ]
    }]
  };
}

// A substituição como o app a faz: troca nos slots E no elenco do grupo.
function trocaDenisePorCarol(t) {
  (t.rounds || []).forEach(function (r) {
    (r.monarchGroups || []).forEach(function (g) {
      g.players = (g.players || []).map(n => n === 'Denise' ? 'Carol' : n);
      g.playersUids = (g.playersUids || []).map(u => u === 'u-denise' ? 'u-carol' : u);
    });
    (r.matches || []).forEach(function (m) {
      ['p1', 'p2'].forEach(k => { if (typeof m[k] === 'string') m[k] = m[k].replace('Denise', 'Carol'); });
      ['team1Uids', 'team2Uids'].forEach(k => {
        if (Array.isArray(m[k])) m[k] = m[k].map(u => u === 'u-denise' ? 'u-carol' : u);
      });
    });
  });
}

const achatar = (t) => {
  const g = t.rounds[0].monarchGroups[0];
  const uidsJogos = t.rounds[0].matches.flatMap(m => [].concat(m.team1Uids || [], m.team2Uids || []));
  return { grupo: (g.playersUids || []).slice(), nomes: (g.players || []).slice(), jogos: uidsJogos };
};

(async function () {

// ── (1) O INCIDENTE, PELO CAMINHO REAL ───────────────────────────────────────
// A troca vai pela TRANSAÇÃO (é o que o app usa com o torneio sorteado) e a cópia
// velha grava pelo save solto. É a combinação exata que quebrou em produção.
{
  const db = mkDb(torneioComGrupo('Denise', 'u-denise'));
  DB.db = db;

  // uma aba lê o torneio ANTES da troca e fica com ele na memória
  const copiaVelha = JSON.parse(JSON.stringify(db._banco()));

  // o organizador aplica a substituição pelo app
  await DB.mutateTournament('T-confra', trocaDenisePorCarol);
  const depoisDaTroca = achatar(db._banco());
  ok(depoisDaTroca.grupo.includes('u-carol'), 'a substituição foi aplicada (Carol no grupo)');
  ok(depoisDaTroca.jogos.filter(u => u === 'u-carol').length === 3, 'Carol está nos 3 jogos');

  // ~2h depois, a aba com a cópia velha grava (autosave, toggle, qualquer coisa)
  await DB.saveTournament(copiaVelha);

  const fim = achatar(db._banco());
  ok(!fim.jogos.includes('u-denise'), 'SLOTS: o save atrasado NÃO devolve a Denise aos jogos');
  ok(fim.jogos.filter(u => u === 'u-carol').length === 3, 'SLOTS: a Carol continua nos 3 jogos');
  ok(!fim.grupo.includes('u-denise'), 'GRUPO: o save atrasado NÃO devolve a Denise ao elenco do grupo');
  ok(fim.grupo.includes('u-carol'), 'GRUPO: a Carol continua no elenco — é daqui que sai a CLASSIFICAÇÃO');
  ok(fim.nomes.indexOf('Denise') === -1 && fim.nomes.indexOf('Carol') >= 0,
     'GRUPO: o NOME exibido acompanha (a tela não pode mentir)');
}

// ── (2) A TRANSAÇÃO CARIMBA — é o que faltava ─────────────────────────────────
{
  const db = mkDb(torneioComGrupo('Denise', 'u-denise'));
  DB.db = db;
  await DB.mutateTournament('T-confra', trocaDenisePorCarol);
  const r = db._banco().rounds[0];
  ok(r.matches.every(m => typeof m.rosterAt === 'number'),
     'a troca pela TRANSAÇÃO carimba `rosterAt` no jogo (antes só o save solto carimbava)');
  ok(typeof r.monarchGroups[0].rosterAt === 'number',
     'a troca pela TRANSAÇÃO carimba `rosterAt` no GRUPO');
  ok(typeof db._banco().rosterRev === 'number' && db._banco().rosterRev >= 1,
     'a transação sobe o contador de documento `rosterRev` (o vigia do servidor lê isso)');
}

// ── (3) TROCA LEGÍTIMA CONTINUA PASSANDO — o guard não pode travar o app ──────
// Quem leu DEPOIS da troca carrega o carimbo dela, então a troca seguinte vence.
{
  const db = mkDb(torneioComGrupo('Denise', 'u-denise'));
  DB.db = db;
  await DB.mutateTournament('T-confra', trocaDenisePorCarol);        // Denise → Carol

  const copiaFresca = JSON.parse(JSON.stringify(db._banco()));       // leu DEPOIS
  copiaFresca.rounds[0].monarchGroups[0].players =
    copiaFresca.rounds[0].monarchGroups[0].players.map(n => n === 'Carol' ? 'Duda' : n);
  copiaFresca.rounds[0].monarchGroups[0].playersUids =
    copiaFresca.rounds[0].monarchGroups[0].playersUids.map(u => u === 'u-carol' ? 'u-duda' : u);
  copiaFresca.rounds[0].matches.forEach(m => {
    ['p1', 'p2'].forEach(k => { if (typeof m[k] === 'string') m[k] = m[k].replace('Carol', 'Duda'); });
    ['team1Uids', 'team2Uids'].forEach(k => {
      if (Array.isArray(m[k])) m[k] = m[k].map(u => u === 'u-carol' ? 'u-duda' : u);
    });
  });
  await DB.saveTournament(copiaFresca);

  const fim = achatar(db._banco());
  ok(fim.grupo.includes('u-duda') && !fim.grupo.includes('u-carol'),
     'a 2ª troca legítima (feita sobre cópia FRESCA) é aceita — o guard não trava o app');
}

// ── (4) O MOTOR REESCREVENDO NÃO É SAVE ATRASADO ─────────────────────────────
// Re-sorteio/rodada extra trazem jogo com id NOVO — o guard sai de cena (mesmo
// sinal que os guards de 1.7.32/1.7.34 já usam). Sem isto, sortear quebraria.
{
  const db = mkDb(torneioComGrupo('Denise', 'u-denise'));
  DB.db = db;
  await DB.mutateTournament('T-confra', trocaDenisePorCarol);

  const resorteio = JSON.parse(JSON.stringify(db._banco()));
  resorteio.rounds[0].monarchGroups[0].players = ['Ana', 'Bia', 'Cid', 'Denise'];
  resorteio.rounds[0].monarchGroups[0].playersUids = ['u-ana', 'u-bia', 'u-cid', 'u-denise'];
  resorteio.rounds[0].matches.push({ id: 'NOVO-1', monarchGroup: 0, p1: 'Ana / Bia', p2: 'Cid / Denise',
    team1Uids: ['u-ana', 'u-bia'], team2Uids: ['u-cid', 'u-denise'] });
  await DB.saveTournament(resorteio);

  ok(db._banco().rounds[0].monarchGroups[0].playersUids.includes('u-denise'),
     'o motor reescrevendo a chave (id novo) NÃO é barrado pelo guard');
}

// ── (5) SAVE QUE NÃO MEXE EM ESCALAÇÃO PRESERVA O CARIMBO ────────────────────
// Sem isto, um save de outra coisa (venue, horário) apagaria o carimbo e a
// próxima cópia velha voltaria a vencer.
{
  const db = mkDb(torneioComGrupo('Denise', 'u-denise'));
  DB.db = db;
  await DB.mutateTournament('T-confra', trocaDenisePorCarol);
  const carimboJogo  = db._banco().rounds[0].matches[0].rosterAt;
  const carimboGrupo = db._banco().rounds[0].monarchGroups[0].rosterAt;

  const soVenue = JSON.parse(JSON.stringify(db._banco()));
  delete soVenue.rounds[0].matches[0].rosterAt;          // cliente velho não conhece o campo
  delete soVenue.rounds[0].monarchGroups[0].rosterAt;
  soVenue.venue = 'Quadra 3';
  await DB.saveTournament(soVenue);

  ok(db._banco().rounds[0].matches[0].rosterAt === carimboJogo,
     'save que não mexe em escalação PRESERVA o carimbo do jogo');
  ok(db._banco().rounds[0].monarchGroups[0].rosterAt === carimboGrupo,
     'save que não mexe em escalação PRESERVA o carimbo do grupo');
  ok(db._banco().venue === 'Quadra 3', 'e a mudança real daquele save é gravada normalmente');
}

console.log(`\n  ${pass} passaram, ${fail} falharam`);
if (fail) process.exit(1);
})();
