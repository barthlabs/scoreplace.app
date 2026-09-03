/* AS PORTAS QUE PERGUNTAM "ESTA PESSOA ESTÁ INSCRITA?"  (2.1.102)
 * node tests/elenco-hidratado-nas-portas-de-contato.test.js
 *
 * ⛔ A FALHA, RELATADA COM PRINT E MEDIDA EM PRODUÇÃO (02/set/2026):
 * o dono tentou registrar o celular da Cadu como organizador e levou
 *     "Essa pessoa não está inscrita neste torneio."
 * Ela está — é a 153ª do Confra, e joga em grupo. Medido no `tour_1780009816637`:
 *     _semPesados = ["matches","participants","opponentHistory"]
 *     computeMemberUids(doc CRU)   →   5 uids   ← era isto que a porta via
 *     computeMemberUids(hidratado) → 153 uids   ← inclui a Cadu
 * Num torneio DIVIDIDO o campo `participants` do documento é `[]`. Três portas liam o doc
 * cru: `setParticipantContactPhone`, `setParticipantLetzplay` e — a pior, porque falha em
 * SILÊNCIO — `sendOrgCommunication`, cuja lista de destinatários saía vazia e mandava o
 * comunicado só pro próprio organizador.
 *
 * ⚠️ A suíte `inscricao-em-torneio-dividido` NÃO pegava isto: a varredura dela cobra
 * TRANSAÇÃO sobre o doc do torneio, e estas três portas leem com `.get()` simples.
 * [[project_dividir_exige_todo_escritor_ciente]]
 */
const path = require('path');
const fs = require('fs');
const SP = require(path.join(__dirname, '..', 'functions', 'split-parts.js'));
const S = require(path.join(__dirname, '..', 'functions', 'vendor', 'tournament-split-core.js'));
const { computeMemberUids } = require(path.join(__dirname, '..', 'functions', 'enroll-core.js'));
const CP = require(path.join(__dirname, '..', 'functions', 'contact-phone-core.js'));

let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

console.log('──── elenco hidratado nas portas de contato ────');

// ── o banco de mentira, com as MESMAS regras que importam ─────────────────────
function banco(subs) {
  const b = { subs: JSON.parse(JSON.stringify(subs || {})) };
  b.ref = { collection: (nome) => ({ _nome: nome,
    get: async () => ({ docs: Object.keys(b.subs[nome] || {}).sort()
      .map((k) => ({ id: k, data: () => JSON.parse(JSON.stringify(b.subs[nome][k])) })) }) }) };
  return b;
}

// o elenco real: ORGANIZADOR + 152 inscritos, um deles a "Cadu"
const ORG = 'uOrg';
const elenco = [];
/* ⚠️ uid com 4+ caracteres de propósito: `computeMemberUids` descarta uid curto
 * (`u.length >= 4`), e um fixture com 'u0' faria o teste medir a peneira, não a divisão. */
for (let i = 0; i < 152; i++) elenco.push({ uid: 'uid' + String(i).padStart(3, '0'), at: '2026-08-01T00:00:00.000Z' });
const CADU = 'uid151';
const partes = S.dividir({ participants: elenco.map((p) => Object.assign({}, p)) });
const subInsc = {};
partes.participants.forEach((r) => { subInsc[S.chaveDoRegistro(r)] = r; });

// o torneio como fica DEPOIS da divisão — exatamente a forma do Confra
const docDividido = {
  id: 'tour_1780009816637', name: 'Confra', creatorUid: ORG,
  _semPesados: ['matches', 'participants', 'opponentHistory'],
  participants: [], matches: [], opponentHistory: [],
};

(async () => {
  // ── ① O DOC CRU É A FALHA ───────────────────────────────────────────────────
  const cru = JSON.parse(JSON.stringify(docDividido));
  const muCru = computeMemberUids(cru);
  ok('⛔ o documento sozinho conhece só o organizador (1 uid)', muCru.length === 1,
    'veio ' + muCru.length + ': ' + JSON.stringify(muCru));
  ok('⛔ e com ele a porta RECUSA quem está inscrita — a falha relatada',
    CP.computeSetContactPhone({ tournament: cru, callerUid: ORG, targetUid: CADU,
      phone: '11934253400', targetProfile: {} }).reason === 'nao-esta-no-elenco',
    'se isto passar, o teste deixou de reproduzir o defeito');

  // ── ② HIDRATADO, ELA ESTÁ LÁ ────────────────────────────────────────────────
  const b = banco({ inscritos: subInsc });
  const hid = await SP.hidratar(null, b.ref, JSON.parse(JSON.stringify(docDividido)), ['participants']);
  ok('⭐ hidratado, o elenco volta inteiro (152)', (hid.participants || []).length === 152,
    'veio ' + (hid.participants || []).length);
  const mu = computeMemberUids(hid);
  ok('⭐ e o elenco passa de 1 para 153 uids (152 + organizador)', mu.length === 153,
    'veio ' + mu.length);
  ok('⭐ a Cadu está no elenco', mu.indexOf(CADU) !== -1);
  const r = CP.computeSetContactPhone({ tournament: hid, callerUid: ORG, targetUid: CADU,
    phone: '11934253400', targetProfile: {} });
  ok('⭐ e a porta AUTORIZA o registro', r.ok === true, JSON.stringify(r));
  ok('  → gravando com procedência (phoneSource=organizer, phoneSetBy=quem registrou)',
    r.ok && r.update.phoneSource === 'organizer' && r.update.phoneSetBy === ORG);
  ok('⭐ o mesmo vale pro @ do letzplay (mesma trava, mesma cura)',
    CP.computeSetContactLetzplay({ tournament: hid, callerUid: ORG, targetUid: CADU,
      handle: 'cadu', targetProfile: {} }).ok === true);

  // ── ③ HIDRATAÇÃO SELETIVA: só o que se pede ─────────────────────────────────
  ok('⭐ `apenas:[participants]` NÃO arrasta matches nem opponentHistory',
    (hid.matches || []).length === 0 && (hid.opponentHistory || []).length === 0,
    'estas portas não decidem chave — arrastar o torneio inteiro num callable de 30s é pedágio');
  const tudo = await SP.hidratar(null, banco({ inscritos: subInsc }).ref,
    JSON.parse(JSON.stringify(docDividido)));
  ok('⛔ e SEM `apenas` o padrão continua sendo TUDO (quem decide chave precisa do torneio inteiro)',
    (tudo.participants || []).length === 152);
  const naoDividido = { id: 't2', participants: elenco.slice() };
  ok('⭐ torneio NÃO dividido não muda em nada',
    (await SP.hidratar(null, banco({}).ref, naoDividido, ['participants'])).participants.length === 152);
  ok('⭐ pedir uma parte que ESTE torneio não dividiu não inventa leitura',
    (await SP.hidratar(null, banco({}).ref,
      { id: 't3', _semPesados: ['matches'], participants: [] }, ['participants'])).participants.length === 0);

  // ── ④ E AS PORTAS DE VERDADE? (a varredura que cobra a próxima) ─────────────
  // ⛔ A suíte de inscrição varre TRANSAÇÕES; estas leem com `.get()` simples e passavam
  // batido. Aqui a cobrança é por NOME: quem decide sobre o elenco não lê o doc cru.
  const idx = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  const corpoDe = (nome) => {
    const i = idx.indexOf('exports.' + nome);
    return i === -1 ? '' : idx.slice(i, idx.indexOf('\nexports.', i + 10));
  };
  ['setParticipantContactPhone', 'setParticipantLetzplay', 'sendOrgCommunication'].forEach(function (nome) {
    const corpo = corpoDe(nome);
    ok('⛔ ' + nome + ' existe', corpo.length > 0);
    ok('  → lê o elenco hidratado', /_lerTorneioComElenco\(db, tournamentId\)/.test(corpo),
      'sem isto ele decide contra `participants: []`');
    ok('  → e NÃO lê o doc cru do torneio',
      !/collection\("tournaments"\)\.doc\(tournamentId\)\.get\(\)/.test(corpo),
      'o `.get()` cru é exatamente o defeito');
  });
  ok('⛔ o ajudante hidrata SÓ o elenco (matches ficariam caros e ninguém os olha aqui)',
    /_splitParts\.hidratar\(null, ref, snap\.data\(\) \|\| \{\}, \["participants"\]\)/.test(idx));

  console.log(falhas === 0 ? '\n✅ tudo certo' : '\n❌ ' + falhas + ' falha(s)');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO:', e && e.stack); process.exit(1); });
