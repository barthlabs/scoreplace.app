/* LIMPA CONVITES DE QUEM JÁ É AMIGO — a higiene por trás da rede da 2.1.19.
 *
 * O PROBLEMA (medido em 27/ago/2026): 12 usuários da base têm alguém que JÁ É AMIGO ainda
 * listado em `friendRequestsSent` / `friendRequestsReceived` — 11 pares. O dono viu isso na
 * tela: amigos dele apareciam em "convites pendentes".
 *
 * A TELA JÁ ESTÁ CERTA SEM ESTE SCRIPT. A 2.1.19 filtra na exibição
 * (window._exploreSemAmigos), e essa rede é a proteção de verdade — ela cobre qualquer
 * origem futura. Isto aqui é HIGIENE do dado, não o conserto do sintoma.
 *
 * A ORIGEM É HISTÓRICA, e foi conferida antes: o fluxo de hoje limpa os dois lados
 * (acceptFriendRequest), o auto-aceite mútuo chama a mesma função, e a regra do Firestore
 * permite a escrita cruzada. Suspeita principal: o merge de contas legadas (auth.js:4651),
 * que faz arrayUnion dos convites da conta antiga SEM filtrar quem já é amigo.
 *
 * ⛔ NUNCA TOCA EM `friends`. A amizade é o estado FORTE — se os dois se contradizem, quem
 * manda é ela. Este script só remove das listas de CONVITE quem já está em `friends`.
 * ⛔ Escrita otimista: `currentDocument.updateTime` faz o PATCH falhar se o documento mudou
 * entre a leitura e a gravação. Melhor abortar do que apagar um convite legítimo que
 * chegou no meio do caminho.
 *
 * Uso:  node scripts/limpar-convite-de-quem-ja-e-amigo.js           (dry-run — não grava)
 *       node scripts/limpar-convite-de-quem-ja-e-amigo.js --apply   (grava)
 */
'use strict';
const { execSync } = require('child_process');

const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const APPLY = process.argv.includes('--apply');
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

const arr = (f) => (f && f.arrayValue && (f.arrayValue.values || []).map((v) => v.stringValue).filter(Boolean)) || [];
const toF = (list) => ({ arrayValue: { values: list.map((s) => ({ stringValue: s })) } });

(async () => {
  const tk = token();
  let pageToken = null;
  const alvos = [];

  do {
    const url = `${BASE}/users?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`;
    const j = await (await fetch(url, { headers: { Authorization: `Bearer ${tk}` } })).json();
    if (j.error) { console.error('✗ leitura falhou:', j.error.message); process.exit(1); }
    (j.documents || []).forEach((d) => {
      const f = d.fields || {};
      const amigos = new Set(arr(f.friends));
      if (!amigos.size) return;
      const sent = arr(f.friendRequestsSent);
      const recv = arr(f.friendRequestsReceived);
      const sentLimpo = sent.filter((x) => !amigos.has(x));
      const recvLimpo = recv.filter((x) => !amigos.has(x));
      if (sentLimpo.length === sent.length && recvLimpo.length === recv.length) return;
      alvos.push({
        uid: d.name.split('/').pop(),
        nome: (f.displayName && f.displayName.stringValue) || '(sem nome)',
        updateTime: d.updateTime,
        tiraSent: sent.filter((x) => amigos.has(x)),
        tiraRecv: recv.filter((x) => amigos.has(x)),
        sentLimpo, recvLimpo,
        mexeSent: sentLimpo.length !== sent.length,
        mexeRecv: recvLimpo.length !== recv.length,
      });
    });
    pageToken = j.nextPageToken;
  } while (pageToken);

  if (!alvos.length) { console.log('✓ nada a limpar — nenhum amigo listado como convite.'); return; }

  console.log(`\n▸ ${alvos.length} usuário(s) com amigo listado como convite:\n`);
  let pares = 0;
  alvos.forEach((a) => {
    const partes = [];
    if (a.tiraSent.length) partes.push(`${a.tiraSent.length} em ENVIADOS`);
    if (a.tiraRecv.length) partes.push(`${a.tiraRecv.length} em RECEBIDOS`);
    pares += a.tiraSent.length + a.tiraRecv.length;
    console.log(`  · ${a.nome.padEnd(24)} ${a.uid.slice(0, 12)}  →  tira ${partes.join(' + ')}`);
  });
  console.log(`\n  total: ${pares} entrada(s) de convite a remover. \`friends\` NÃO é tocado.`);

  if (!APPLY) { console.log('\n(dry-run — rode com --apply pra gravar)\n'); return; }

  // ⭐ O "ANTES" VAI PRO DISCO ANTES DE QUALQUER PATCH. Remover entrada de array não tem
  // desfazer no Firestore, e "é só dado inconsistente" não é motivo pra apagar sem rede:
  // se a leitura estivesse errada, sem isto não haveria como voltar.
  const fs = require('fs');
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  const arquivo = `/tmp/convites-antes-${carimbo}.json`;
  fs.writeFileSync(arquivo, JSON.stringify(alvos.map((a) => ({
    uid: a.uid, nome: a.nome,
    friendRequestsSent_antes: a.sentLimpo.concat(a.tiraSent),
    friendRequestsReceived_antes: a.recvLimpo.concat(a.tiraRecv),
  })), null, 2));
  console.log(`\n▸ estado anterior salvo em ${arquivo}`);

  let ok = 0, falhou = 0;
  for (const a of alvos) {
    const fields = {};
    if (a.mexeSent) fields.friendRequestsSent = toF(a.sentLimpo);
    if (a.mexeRecv) fields.friendRequestsReceived = toF(a.recvLimpo);
    const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&');
    const url = `${BASE}/users/${a.uid}?${mask}&currentDocument.updateTime=${encodeURIComponent(a.updateTime)}`;
    const w = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    if (w.ok) { ok++; }
    else { falhou++; console.error(`  ✗ ${a.nome} (${a.uid.slice(0, 12)}): ${w.status} ${await w.text()}`); }
  }
  console.log(`\n✓ ${ok} gravado(s)${falhou ? `, ${falhou} falhou(ram)` : ''}.`);
  if (falhou) console.log('  (falha por updateTime = o documento mudou no meio; rode de novo)');
})();
