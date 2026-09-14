'use strict';
/* ⛔⛔ REPÕE O CONTADOR DE PARTES NOS TORNEIOS JÁ DIVIDIDOS.
 *
 * MEDIDO em 14/set/2026: dos 41 torneios divididos, 41 têm `_nJogos` e ZERO têm `_nPartes`
 * ou `_nGrupos`. A causa está em `scripts/salto-fase2.js`, que gravava o documento com
 * `set()` (substitui) recolocando só o `_nJogos` — o contador que o aplicativo tivesse
 * gravado antes era apagado junto. O script já foi corrigido; isto arruma o que ficou.
 *
 * ⛔ POR QUE IMPORTA, e não é cosmético: `_nPartes` é o ÚNICO contador que fala do ELENCO.
 * Sem ele o aplicativo não distingue "não tem inscrito" de "o elenco ainda não chegou", e um
 * cache com os jogos dentro faz ele concluir "não falta nada" e nunca buscar o elenco — o
 * "0 INSCRITOS / você não está inscrito" relatado pelo dono. A trava de gravação que exige
 * prova numérica também nunca dispara sem ele, calada.
 *
 * ⭐ O NÚMERO VEM DA SUBCOLEÇÃO, contado agora. Não se copia de lugar nenhum: é a contagem
 * real do que está lá que faz o contador ser prova.
 *
 * Uso:  node scripts/repor-contador-de-partes.js            (ensaio)
 *       node scripts/repor-contador-de-partes.js --aplicar
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const APLICAR = process.argv.indexOf('--aplicar') !== -1;

/* Qual subcoleção guarda cada parte — mesma tabela do cânone da divisão. */
const COLECAO = { participants: 'inscritos' };

(async () => {
  admin.initializeApp({ projectId: 'scoreplace-app' });
  const db = admin.firestore();
  const snap = await db.collection('tournaments').get();
  const divididos = snap.docs.filter((d) => (((d.data() || {})._semPesados) || []).length);
  console.log('torneios divididos: ' + divididos.length + (APLICAR ? '' : '   (ensaio)'));

  let arrumados = 0, jaOk = 0, divergentes = 0;
  for (const d of divididos) {
    const t = d.data() || {};
    const fora = t._semPesados || [];
    const contagem = {};
    for (const parte of fora) {
      const col = COLECAO[parte] || parte;
      const c = await d.ref.collection(col).count().get();
      contagem[parte] = c.data().count;
    }
    const upd = { _nPartes: contagem };
    if (fora.indexOf('grupos') !== -1) upd._nGrupos = contagem.grupos;
    if (fora.indexOf('matches') !== -1) {
      /* ⛔ NÃO SOBRESCREVER `_nJogos` ÀS CEGAS: ele existe e é lido por aplicativo já
       * instalado. Se divergir da contagem real, isso é um achado — diga, não esconda. */
      const antes = t._nJogos;
      if (typeof antes === 'number' && antes !== contagem.matches) {
        divergentes++;
        console.log('  ⚠️ ' + (t.name || d.id).slice(0, 30) +
          ': _nJogos diz ' + antes + ' e a subcoleção tem ' + contagem.matches);
      }
      upd._nJogos = contagem.matches;
    }
    const igual = t._nPartes && fora.every((p) => t._nPartes[p] === contagem[p]);
    if (igual) { jaOk++; continue; }
    console.log('  · ' + (t.name || d.id).slice(0, 34).padEnd(34) + JSON.stringify(contagem));
    if (APLICAR) await d.ref.set(upd, { merge: true });
    arrumados++;
  }

  console.log('\n══ já estavam certos: ' + jaOk + ' · ' + (APLICAR ? 'arrumados: ' : 'a arrumar: ') + arrumados +
    (divergentes ? (' · ⚠️ contagem de jogos divergente em ' + divergentes) : ''));
  if (!APLICAR) console.log('   (nada foi gravado — use --aplicar)');
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e && e.message); process.exit(1); });
