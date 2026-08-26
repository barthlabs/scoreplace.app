/* INSCREVER-SE NUM TORNEIO DIVIDIDO  (2.0.120)
 * node tests/inscricao-em-torneio-dividido.test.js
 *
 * ⛔ O BURACO (medido 26/ago/2026): `functions/index.js` não tinha UMA menção à divisão
 * (`grep -c '_semPesados'` = 0). O `enrollParticipant` fazia `computeEnroll(snap.data(), …)`
 * e num torneio dividido o campo `participants` do documento é `[]` — o elenco mora na
 * subcoleção `inscritos`. Duas consequências, e a segunda é a pior:
 *   ① lotação e duplicata conferidas contra lista VAZIA: deixaria entrar quem já estava
 *      dentro, e ignoraria o limite de vagas;
 *   ② o novo inscrito era gravado num campo do documento que a LEITURA sobrescreve com a
 *      subcoleção — a pessoa entrava e sumia, sem erro nenhum.
 *
 * ⭐ Ninguém foi perdido: no Confra havia 148 uids em `memberUids`, 148 docs em `inscritos`
 * e `participants: []` — ninguém se inscreveu entre a divisão e o conserto. A medição é o
 * que autoriza essa frase; sem ela seria torcida.
 *
 * Esta suíte roda o ajudante contra uma transação de mentira que se comporta como o
 * Firestore: `get` devolve o que está no "banco", `set`/`delete` mexem na subcoleção,
 * `update` mexe no documento.
 */
const path = require('path');
const SP = require(path.join(__dirname, '..', 'functions', 'split-parts.js'));
const S = require(path.join(__dirname, '..', 'functions', 'vendor', 'tournament-split-core.js'));
let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

console.log('──── inscrição em torneio dividido ────');

// ── um Firestore de mentira, com as mesmas regras que importam ────────────────
function banco(docInicial, subs) {
  const b = { doc: JSON.parse(JSON.stringify(docInicial)), subs: JSON.parse(JSON.stringify(subs || {})), leuDepoisDeEscrever: false };
  let escreveu = false;
  const col = (nome) => ({
    _nome: nome,
    doc: (id) => ({ _col: nome, _id: id })
  });
  b.ref = { collection: col };
  b.tx = {
    get: async (alvo) => {
      if (escreveu) b.leuDepoisDeEscrever = true;      // o Firestore proíbe; queremos saber
      const nome = alvo._nome;
      const m = b.subs[nome] || {};
      return { docs: Object.keys(m).sort().map((k) => ({ id: k, data: () => JSON.parse(JSON.stringify(m[k])) })) };
    },
    set: (r, v) => { escreveu = true; (b.subs[r._col] = b.subs[r._col] || {})[r._id] = JSON.parse(JSON.stringify(v)); },
    delete: (r) => { escreveu = true; if (b.subs[r._col]) delete b.subs[r._col][r._id]; },
    update: (r, v) => { escreveu = true; Object.assign(b.doc, JSON.parse(JSON.stringify(v))); }
  };
  return b;
}

const pessoa = (uid, nome) => ({ uid: uid, name: nome, at: '2026-08-01T00:00:00.000Z' });
const elenco = [pessoa('uA', 'Ana'), pessoa('uB', 'Bruno'), pessoa('uC', 'Carla')];

// o torneio como fica DEPOIS da divisão: campo vazio no doc, gente na subcoleção
const partes = S.dividir({ participants: elenco.map((p) => Object.assign({}, p)) });
const subInsc = {};
partes.participants.forEach((r) => { subInsc[S.chaveDoRegistro(r)] = r; });
const docDividido = { id: 't1', name: 'Torneio', _semPesados: ['participants'], participants: [], maxParticipants: 4 };

// ── ① hidratar traz o elenco de volta ─────────────────────────────────────────
(async () => {
  const b1 = banco(docDividido, { inscritos: subInsc });
  const dados = await SP.hidratar(b1.tx, b1.ref, JSON.parse(JSON.stringify(docDividido)));
  ok('⛔ o documento sozinho diz que o torneio tem 0 inscritos',
    (docDividido.participants || []).length === 0,
    'era ISTO que chegava no computeEnroll: lotação e duplicata contra lista vazia');
  ok('⭐ hidratado, o elenco volta inteiro (3 pessoas)', (dados.participants || []).length === 3,
    'veio ' + JSON.stringify((dados.participants || []).map(p => p.name)));
  ok('  → e na ordem certa', (dados.participants || []).map(p => p.name).join(',') === 'Ana,Bruno,Carla');
  ok('  → com a identidade preservada', (dados.participants || []).every(p => p.uid));

  // ── ② quem entra vai pra SUBCOLEÇÃO, não pro documento ──────────────────────
  const b2 = banco(docDividido, { inscritos: JSON.parse(JSON.stringify(subInsc)) });
  const d2 = await SP.hidratar(b2.tx, b2.ref, JSON.parse(JSON.stringify(docDividido)));
  const novo = d2.participants.concat([pessoa('uD', 'Diana')]);
  SP.gravar(b2.tx, b2.ref, d2, { participants: novo, updatedAt: 123 });
  ok('⛔ o novo inscrito NÃO é gravado no campo do documento',
    b2.doc.participants.length === 0,
    'gravar ali é gravar num campo que a leitura sobrescreve — a pessoa some');
  ok('⭐ ele vira um DOC na subcoleção (3 → 4)', Object.keys(b2.subs.inscritos).length === 4);
  ok('  → e o resto do updateData vai pro documento normalmente', b2.doc.updatedAt === 123);
  ok('⭐ e só o registro NOVO foi escrito — os 3 que não mudaram ficaram quietos',
    Object.keys(b2.subs.inscritos).length === 4);

  // ── ③ quem sai é APAGADO da subcoleção ──────────────────────────────────────
  const b3 = banco(docDividido, { inscritos: JSON.parse(JSON.stringify(subInsc)) });
  const d3 = await SP.hidratar(b3.tx, b3.ref, JSON.parse(JSON.stringify(docDividido)));
  SP.gravar(b3.tx, b3.ref, d3, { participants: d3.participants.filter((p) => p.uid !== 'uB') });
  ok('⭐ quem sai some da subcoleção (3 → 2)', Object.keys(b3.subs.inscritos).length === 2);
  const restaram = Object.values(b3.subs.inscritos).map((r) => r.item.name).sort().join(',');
  ok('  → e some o CERTO (sobraram Ana e Carla)', restaram === 'Ana,Carla', 'sobraram: ' + restaram);

  // ── ④ torneio INTEIRO segue pelo caminho de sempre ──────────────────────────
  const b4 = banco({ id: 't2', participants: elenco.slice() }, {});
  const d4 = await SP.hidratar(b4.tx, b4.ref, { id: 't2', participants: elenco.slice() });
  SP.gravar(b4.tx, b4.ref, d4, { participants: elenco.concat([pessoa('uD', 'Diana')]) });
  ok('⭐ torneio NÃO dividido continua gravando no documento (nada mudou pra ele)',
    b4.doc.participants.length === 4 && !b4.subs.inscritos);

  // ── ⑤ a ordem que o Firestore exige ─────────────────────────────────────────
  ok('⛔ nenhuma leitura aconteceu depois de uma escrita (a transação proíbe)',
    !b1.leuDepoisDeEscrever && !b2.leuDepoisDeEscrever && !b3.leuDepoisDeEscrever);

  // ── ⑥ a inscrição realmente passa pelo ajudante ─────────────────────────────
  const fs = require('fs');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  const i = idx.indexOf('exports.enrollParticipant');
  const corpo = idx.slice(i, idx.indexOf('\nexports.', i + 10));
  ok('⛔ enrollParticipant hidrata antes de decidir', /_splitParts\.hidratar\(tx, docRef, snap\.data\(\)\)/.test(corpo),
    'sem isto ele decide lotação e duplicata contra uma lista vazia');
  ok('⛔ e grava pelo ajudante, não com tx.update direto',
    /_splitParts\.gravar\(tx, docRef, _dados, r\.updateData\)/.test(corpo) &&
    !/tx\.update\(docRef, r\.updateData\)/.test(corpo));

  // ── ⑦ E A PRÓXIMA? ─────────────────────────────────────────────────────────
  // ⛔ Este projeto já perdeu uma parte QUATRO vezes por lista escrita à mão. Não basta
  // consertar as cinco portas de hoje: o teste varre o arquivo e cobra QUALQUER transação
  // sobre o doc do torneio que decida a partir do `snap.data()` cru.
  const linhas = idx.split('\n');
  const cruas = [];
  linhas.forEach(function (l, n) {
    if (!/const (t|_dados|curData|d) = snap\.data\(\)/.test(l)) return;
    // é do torneio? a transação abre com `db.collection("tournaments").doc(...)`
    const tras = linhas.slice(Math.max(0, n - 12), n).join('\n');
    if (!/collection\("tournaments"\)/.test(tras)) return;
    if (/_splitParts\.hidratar/.test(l)) return;
    /* ⛔ EXCEÇÃO ESTREITA E MEDIDA: ler o documento só pra AUTORIZAR não precisa hidratar.
     * `creatorUid`, `adminUids` e `coHosts` nunca moram fora, e hidratar ali seria pagar
     * leitura de subcoleção à toa em toda checagem de permissão.
     * A exceção NÃO é um comentário mágico: ela só vale se o trecho adiante não tocar em
     * nenhuma parte que pode viver fora. Guarda que grita à toa vira guarda ignorado —
     * mas guarda que se cala por declaração não guarda nada. */
    const adiante = linhas.slice(n, n + 30).join('\n');
    if (!/\b(participants|history|opponentHistory|rounds|matches|standings)\b/.test(adiante)) return;
    cruas.push((n + 1) + ': ' + l.trim());
  });
  ok('⛔ NENHUMA transação sobre o torneio decide a partir do snap.data() cru',
    cruas.length === 0,
    'sem hidratar, estas rodam contra `participants: []` num torneio dividido:\n      ' + cruas.join('\n      '));

  const semAjudante = [];
  linhas.forEach(function (l, n) {
    if (!/tx\.update\((docRef|d\.ref),/.test(l)) return;
    semAjudante.push((n + 1) + ': ' + l.trim());
  });
  ok('⛔ e NENHUMA escreve no doc do torneio sem passar pelo ajudante',
    semAjudante.length === 0,
    'estas gravariam um campo dividido dentro do documento:\n      ' + semAjudante.join('\n      '));

  console.log(falhas === 0 ? '\n✅ inscricao-em-torneio-dividido: OK' : '\n❌ ' + falhas + ' falha(s)');
  process.exit(falhas === 0 ? 0 : 1);
})();
