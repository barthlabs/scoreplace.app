'use strict';
/* ⛔ CONTAS DOBRADAS PELO MESMO TELEFONE — mede e, com `--aplicar`, conserta.
 *
 * Ordem do dono (13/set/2026): _"corrija isso no codigo e no banco de dados como se tivesse
 * sido feito certo"_. O código já não deixa nascer a segunda conta; isto arruma as que
 * nasceram antes.
 *
 * ⚠️ A LEITURA DAS CONTAS VAI POR REST, DE PROPÓSITO. O caminho normal do SDK estoura o prazo
 * desta máquina (medido: 37s até `app/network-timeout`), e um `.catch(() => null)` ali
 * transformaria "não consegui ler" em "ninguém autenticou" — que é o oposto. Por REST a mesma
 * consulta responde na hora. [[feedback_nao_afirmar_causa_sem_medir]]
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const { GoogleAuth } = require(path.join(__dirname, '..', 'functions', 'node_modules', 'google-auth-library'));

const APLICAR = process.argv.includes('--aplicar');
const PROJETO = 'scoreplace-app';

async function contasPorUid(uids) {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const tok = (await (await auth.getClient()).getAccessToken()).token;
  const saida = new Map();
  for (let i = 0; i < uids.length; i += 100) {
    const lote = uids.slice(i, i + 100);
    const r = await fetch(
      'https://identitytoolkit.googleapis.com/v1/projects/' + PROJETO + '/accounts:lookup',
      { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify({ localId: lote }) });
    /* ⛔ NÃO ENGOLIR: sem esta leitura não se sabe qual telefone é o provado, e sem isso
     * nenhuma decisão aqui pode ser tomada. */
    if (!r.ok) throw new Error('leitura de contas falhou: ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const j = await r.json();
    (j.users || []).forEach((u) => saida.set(u.localId, u));
  }
  return saida;
}

const so = (t) => String(t || '').replace(/\D/g, '');
const _dup = require(path.join(__dirname, '..', 'functions', 'duplicate-person-core.js'));
/* Mesmo motor de nomes do produto — não uma régua paralela que diverge sem ninguém ver. */
const parecem = (a, b) => !!_dup.compararNomes(a, b);

(async () => {
  admin.initializeApp({ projectId: PROJETO });
  const db = admin.firestore();

  const snap = await db.collection('users').get();
  const vivos = snap.docs.filter((d) => !(d.data() || {}).mergedInto);
  console.log('cadastros vivos: ' + vivos.length + ' (de ' + snap.size + ')');

  const porFone = new Map();
  vivos.forEach((d) => {
    const f = so((d.data() || {}).phone);
    if (f.length < 10) return;
    if (!porFone.has(f)) porFone.set(f, []);
    porFone.get(f).push(d);
  });
  const dobrados = [...porFone.entries()].filter(([, v]) => v.length > 1);
  console.log('números em mais de um cadastro vivo: ' + dobrados.length + '\n');
  if (!dobrados.length) { process.exit(0); }

  const contas = await contasPorUid(dobrados.flatMap(([, v]) => v.map((d) => d.id)));

  /* ⛔⛔ ESTE SCRIPT NÃO UNE NADA — E É PROPOSITAL.
   * Ordem do dono (13/set/2026): _"pelo caso da fabiana e val é a prova que só autenticada é
   * prova verdadeira. nao pode mesclar ou considerar digitado pelo organizador"_ e _"sempre
   * pode acontecer de autenticar 1 telefone em duas contas (mae e filho usando o mesmo
   * telefone), marido e mulher"_.
   * Eu tinha montado aqui uma união automática dos pares. Estava errada: Fabiana e Val
   * dividem o número, são casal e estão no MESMO torneio. Unir teria apagado a conta de uma
   * pessoa de verdade. Telefone repetido é normal — o que ele pede é CONFERÊNCIA, não fusão. */
  const suspeitos = [];
  for (const [fone, docs] of dobrados) {
    console.log('📞 +' + fone);
    const linhas = docs.map((d) => {
      const p = d.data() || {};
      const c = contas.get(d.id);
      const foneDaConta = so(c && c.phoneNumber);
      return { uid: d.id, nome: p.displayName || '(sem nome)',
        provedor: p.authProvider || '—', carimbo: p.phoneSource || '—',
        confirmou: foneDaConta === fone };
    });
    linhas.forEach((l) => console.log('   · ' + l.uid + '  ' + l.nome +
      '  [entrada: ' + l.provedor + ' · registro: ' + l.carimbo +
      ' · confirmou este número: ' + (l.confirmou ? 'sim' : 'não') + ']'));

    const donos = linhas.filter((l) => l.confirmou);
    const digitados = linhas.filter((l) => !l.confirmou);
    if (donos.length === 1 && digitados.length) {
      console.log('   → normal: ' + donos[0].nome + ' confirmou o número por SMS; nos outros ' +
        'ele é apenas contato e caduca quando cada um confirmar o seu');
    } else if (!donos.length) {
      console.log('   → ninguém confirmou este número — em todos é só contato');
    }
    /* O que MERECE olhar humano: nomes parecidos, que é quando pode mesmo ser a mesma pessoa
     * com dois cadastros. Nome diferente com número igual é casa dividida, e é normal. */
    for (let i = 0; i < linhas.length; i++) {
      for (let j = i + 1; j < linhas.length; j++) {
        if (parecem(linhas[i].nome, linhas[j].nome)) {
          suspeitos.push([linhas[i], linhas[j], fone]);
          console.log('   ⚠️  nomes parecidos — pode ser a mesma pessoa com dois cadastros');
        }
      }
    }
    console.log('');
  }

  console.log('══ números repetidos: ' + dobrados.length +
    ' · pares com nome parecido para conferir à mão: ' + suspeitos.length);
  suspeitos.forEach(([a, b, f]) => console.log('   · +' + f + '  ' + a.nome + '  ×  ' + b.nome));
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e && e.message); process.exit(1); });
