#!/usr/bin/env node
/* backup-amizade-legado.js — FOTOGRAFA o estado social antes do corte da 2.1.48.
 *
 * ⛔ POR QUE ESTE SCRIPT EXISTE (5ª auditoria externa, ponto 2): o cutover mandava rodar
 * `scripts/backup-torneios.js` antes da Etapa B. Aquele script salva TORNEIOS — ele não
 * toca em `users/`. O rollback descrito era, portanto, FALSO: o backfill REESCREVE os
 * quatro campos de cache de todos os perfis, e não havia de onde restaurá-los.
 *
 *   node scripts/backup-amizade-legado.js                    # grava o .json
 *   node scripts/backup-amizade-legado.js --saida=<arquivo>
 *
 * O que entra, para TODOS os `users/{uid}`:
 *   friends · friendRequestsSent · friendRequestsReceived · friendRequestsSentAt
 * ⚠️ E a diferença entre CAMPO AUSENTE e ARRAY VAZIO é preservada: `null` no arquivo
 * significa "o campo não existia". Restaurar `[]` onde não havia nada criaria campo do
 * zero, e o `restore` precisa poder APAGAR de volta.
 * Também fotografa `friendships` e `friendAccess` se já existirem (para desfazer um
 * backfill parcial).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

const PROJETO = process.env.SP_PROJECT || 'scoreplace-app';
require('./preflight-alvo').preflight('backup-amizade-legado', PROJETO);
if (!admin.apps.length) admin.initializeApp({ projectId: PROJETO });
const db = admin.firestore();

const CAMPOS = ['friends', 'friendRequestsSent', 'friendRequestsReceived', 'friendRequestsSentAt'];
const SAIDA = (process.argv.find((a) => a.startsWith('--saida=')) || '').split('=')[1];

/** Hash estável do conteúdo — chaves ordenadas, para o restore poder conferir. */
function hashDe(obj) {
  const estavel = JSON.stringify(obj, Object.keys(obj).sort ? undefined : undefined);
  return crypto.createHash('sha256').update(estavel).digest('hex');
}
function ordenar(o) {
  if (Array.isArray(o)) return o.map(ordenar);
  if (o && typeof o === 'object') {
    const out = {};
    Object.keys(o).sort().forEach((k) => { out[k] = ordenar(o[k]); });
    return out;
  }
  return o;
}

(async () => {
  const snap = await db.collection('users').get();
  const perfis = {};
  let comAlgumCampo = 0;
  snap.forEach((d) => {
    const x = d.data() || {};
    const reg = {};
    let tem = false;
    CAMPOS.forEach((c) => {
      // ⛔ `undefined` vira null EXPLÍCITO: "não existia". Distinto de [] e de {}.
      if (Object.prototype.hasOwnProperty.call(x, c)) { reg[c] = x[c]; tem = true; }
      else reg[c] = null;
    });
    if (tem) comAlgumCampo++;
    perfis[d.id] = reg;
  });

  // friendships / friendAccess, se já existirem
  const relacoes = {};
  (await db.collection('friendships').get()).forEach((d) => { relacoes[d.id] = d.data() || {}; });
  /* ⛔ 6ª auditoria (ponto 12): guarda o CONTEÚDO de cada projeção, não só o caminho.
   * A versão anterior salvava a lista de chaves e o restore recriava com
   * `{ since: 'restore' }` — isso não é restore exato, é reconstrução aproximada, e apaga
   * `since`, `ownerUid` e `friendUid` originais. */
  /* ⛔ 7ª auditoria (ponto 7): BACKUP NÃO É BEST-EFFORT. Antes, falha ao ler `friendAccess`
   * ou o marcador virava um `console.warn` e o arquivo era gravado assim mesmo, com
   * mensagem de sucesso — um backup incompleto que só se descobre na hora do rollback,
   * que é exatamente a hora em que não dá pra descobrir. Qualquer leitura obrigatória que
   * falhe ABORTA e nenhum arquivo é produzido. */
  const acessos = {};
  try {
    (await db.collectionGroup('accepted').get()).forEach((d) => {
      const pai = d.ref.parent.parent;
      if (pai && pai.parent && pai.parent.id === 'friendAccess') acessos[pai.id + '/' + d.id] = d.data() || {};
    });
  } catch (e) {
    console.error('\n⛔ ABORTA: leitura de friendAccess falhou — ' + (e && e.message));
    console.error('   Nenhum backup foi gravado. Backup incompleto é pior que backup nenhum:');
    console.error('   ele só se revela incompleto na hora do rollback.');
    process.exit(1);
  }

  /* ⛔ 6ª auditoria (ponto 7): o MARCADOR da migração entra na foto.
   * Sem ele, restaurar o banco para o estado congelado deixava `_meta/amizadeMigration`
   * dizendo `backfilled` — um estado impossível: dados de antes do backfill com marcador
   * de depois. E é o marcador que decide se o backfill pode rodar. */
  /* ⚠️ AUSÊNCIA REAL ≠ ERRO DE LEITURA. O documento não existir é um estado válido
   * (`not_started`, marcado com `_ausente`). Não CONSEGUIR ler é falha, e aborta. */
  let marcador = null;
  try {
    const m = await db.doc('_meta/amizadeMigration').get();
    marcador = m.exists ? (m.data() || {}) : { fase: 'not_started', _ausente: true };
  } catch (e) {
    console.error('\n⛔ ABORTA: leitura do marcador da migração falhou — ' + (e && e.message));
    console.error('   Nenhum backup foi gravado. Sem o marcador, o restore devolveria dados');
    console.error('   antigos com fase nova — estado impossível.');
    process.exit(1);
  }

  const corpo = ordenar({ perfis, relacoes, acessos, marcador });
  const doc = {
    _meta: {
      formato: 'amizade-legado/1',
      projeto: PROJETO,
      geradoEm: new Date().toISOString(),
      perfis: Object.keys(perfis).length,
      perfisComAlgumCampo: comAlgumCampo,
      relacoes: Object.keys(relacoes).length,
      acessos: Object.keys(acessos).length,
      faseMigracao: (marcador && marcador.fase) || 'not_started',
      campos: CAMPOS,
      hash: hashDe(corpo),
    },
    dados: corpo,
  };

  const nome = SAIDA || path.join(process.cwd(),
    'backup-amizade-' + PROJETO + '-' + doc._meta.geradoEm.replace(/[:.]/g, '-') + '.json');
  /* ⭐ RENAME ATÔMICO: grava num temporário e só então move. Interrupção no meio da escrita
   * deixa um `.parcial` óbvio, nunca um .json truncado com cara de backup bom. */
  const tmp = nome + '.parcial';
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 1));
  fs.renameSync(tmp, nome);
  console.log('✅ backup gravado: ' + nome);
  console.log('   projeto: ' + PROJETO);
  console.log('   perfis: ' + doc._meta.perfis + ' (com algum campo social: ' + comAlgumCampo + ')');
  console.log('   friendships: ' + doc._meta.relacoes + ' · friendAccess: ' + doc._meta.acessos);
  console.log('   fase da migração fotografada: ' + doc._meta.faseMigracao);
  console.log('   hash: ' + doc._meta.hash.slice(0, 16) + '…');
})().catch((e) => { console.error('ERRO:', e); process.exit(1); });
