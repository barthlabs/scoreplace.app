/* REPARO — o que o W.O. deixou pra trás num torneio DIVIDIDO
 *
 * POR QUE ISTO EXISTE. `mutateTournament` (a porta do W.O./substituição) roda o mutator
 * sobre `doc.data()` — o documento CRU. Num torneio dividido isso é o documento MAGRO:
 * `participants: []` e nenhum jogo. O mutator então:
 *   ① empurra o substituto pra `ft.participants`, que é um array vazio no doc, e a leitura
 *      seguinte (`montarDoBanco`) sobrescreve esse campo com a subcoleção — a pessoa SOME
 *      (é exatamente o que functions/split-parts.js já descrevia);
 *   ② chama `_rewriteSlot` sobre jogos que não existem no objeto dele — a troca nunca chega
 *      na subcoleção `matches`.
 * Resultado medido no Confra (30/ago/2026): o W.O. entra no `woLog` e na classificação, e
 * NÃO entra nem no elenco nem no jogo. Ver [[project_wo_nao_escreve_nas_subcolecoes]].
 *
 * ⛔ ISTO NÃO É O CONSERTO — é o curativo. O conserto é levar o W.O. pra CF; o cliente não
 * tem (nem deve ter) permissão de escrever `inscritos`/`matches`.
 *
 * O QUE ELE FAZ, derivado do `woLog` — nada de lista escrita à mão:
 *   A) todo substituto ATIVO que não está em `inscritos` volta pro elenco, com o mesmo
 *      rastro (`woSubstituteFor*`) que os 10 substitutos anteriores à divisão têm;
 *   B) todo jogo que ainda nomeia um AUSENTE no grupo/rodada onde o W.O. aconteceu passa a
 *      nomear o substituto (uid junto; `null` quando o substituto é vaga/Jogador X).
 *
 *   D) o AUSENTE é desativado — a outra metade do W.O. (`_ligaWoDeactivate`, travada pelo
 *      teste `wo-sempre-desativa`), que também mora no elenco e também não chegou. Sem ela
 *      a pessoa volta a ser sorteada na rodada seguinte. ⛔ SÓ para W.O. POSTERIORES à
 *      divisão — antes dela a escrita funcionava, e mexer ali desfaria decisão do dono.
 *
 * ⚠️ CÂNONE (dono, 30/ago): _"se a pessoa estiver inscrita, esta inscrita e deve ser
 * contada. nao importa se esta na lista de espera, inativa ou tomou wo."_ Desativar NÃO
 * tira ninguém da conta — (A) e (D) convivem sem se contradizer.
 * [[project_inscrito_e_inscrito_sempre_conta]]
 *
 * ⛔ NÃO TOCA EM JOGO COM PLACAR. Reescrever quem jogou depois do resultado lançado é
 * reescrever história. Se aparecer um, o script ACUSA e não grava nada daquele jogo.
 *
 * Uso:  node scripts/reparar-substitutos-do-wo.js <tournamentId>            (ENSAIO, não grava)
 *       node scripts/reparar-substitutos-do-wo.js <tournamentId> --aplicar  (grava)
 */
const { execSync } = require('child_process');

const ID = process.argv.slice(2).find((a) => !a.startsWith('--'));
const APLICAR = process.argv.includes('--aplicar');
if (!ID) { console.error('uso: node scripts/reparar-substitutos-do-wo.js <tournamentId> [--aplicar]'); process.exit(1); }

const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const DOC = BASE + '/tournaments/' + ID;
const tok = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
const H = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };

/* ── tradução Firestore REST ↔ JS ──────────────────────────────────────────────
 * ⚠️ Ler o Firestore por REST erra em SILÊNCIO (campo/máscara errados devolvem VAZIO,
 * não erro). Por isso o script confere contra coisas que ele JÁ SABE antes de gravar.
 * [[project_ler_firestore_por_rest_erra_calado]] */
function val(v) {
  if (v == null) return null;
  const k = Object.keys(v)[0];
  if (k === 'stringValue') return v.stringValue;
  if (k === 'integerValue') return Number(v.integerValue);
  if (k === 'doubleValue') return v.doubleValue;
  if (k === 'booleanValue') return v.booleanValue;
  if (k === 'nullValue') return null;
  if (k === 'timestampValue') return v.timestampValue;
  if (k === 'arrayValue') return (v.arrayValue.values || []).map(val);
  if (k === 'mapValue') { const o = {}; for (const [a, b] of Object.entries(v.mapValue.fields || {})) o[a] = val(b); return o; }
  return null;
}
function toF(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === 'string') return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(toF) } };
  const fields = {}; for (const [k, v] of Object.entries(x)) fields[k] = toF(v);
  return { mapValue: { fields } };
}
async function get(url) { const r = await fetch(url, { headers: H }); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j; }
async function lista(col) {
  let out = [], pt = null;
  do {
    const j = await get(DOC + '/' + col + '?pageSize=300' + (pt ? '&pageToken=' + pt : ''));
    (j.documents || []).forEach((d) => { const o = {}; for (const [a, b] of Object.entries(d.fields || {})) o[a] = val(b); o._id = d.name.split('/').pop(); o._upd = d.updateTime; out.push(o); });
    pt = j.nextPageToken;
  } while (pt);
  return out;
}
async function grava(url, objeto) {
  const fields = {}; for (const [k, v] of Object.entries(objeto)) fields[k] = toF(v);
  const r = await fetch(url, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) });
  const j = await r.json(); if (j.error) throw new Error(j.error.message); return j;
}

(async () => {
  const doc = await get(DOC);
  const t = {}; for (const [k, v] of Object.entries(doc.fields || {})) t[k] = val(v);
  const fora = Array.isArray(t._semPesados) ? t._semPesados : [];
  console.log('torneio :', t.name);
  console.log('dividido:', fora.length ? fora.join(', ') : 'NÃO (este reparo não se aplica)');
  if (!fora.length) { console.log('nada a fazer.'); return; }

  const woLog = (t.woLog || []).filter((w) => w && w.status === 'active');
  const inscritos = await lista('inscritos');
  const uidsInscritos = new Set(inscritos.map((p) => p.item && p.item.uid).filter(Boolean));
  const jogos = await lista('matches');
  console.log('woLog ativos:', woLog.length, '| inscritos:', inscritos.length, '| jogos:', jogos.length);
  /* ── QUEM É A VERDADE, E CONTRA O QUE EU CONFIRO ──────────────────────────────
   * `_semPesados` diz que `participants` e `matches` moram nas subcoleções: elas SÃO a
   * fonte; `_nPartes`/`_nJogos` são só marcadores. Então divergência não é motivo pra
   * abortar — é COISA A REPARAR. Medido no Confra (30/ago 20:46): um `saveTournament`
   * disparado com o torneio já esvaziado em memória reescreveu `_nPartes.participants`
   * de 148 pra 1 e `_nJogos` de 115 pra 114, com as subcoleções intactas. Marcador
   * mentindo é perigoso: `_enxertaJogos` decide POR ELE se vale a pena buscar a parte, e
   * um marcador que dissesse 0 faria o app concluir "vazio de verdade" e nunca mais
   * buscar o elenco. [[project_wo_nao_escreve_nas_subcolecoes]]
   *
   * ⛔ MAS LER O FIRESTORE POR REST ERRA EM SILÊNCIO — máscara ou caminho errado devolvem
   * VAZIO, não erro. Coleção vazia é exatamente a assinatura dessa falha, e é o único caso
   * em que eu me recuso a decidir: gravar marcador zerado sobre uma leitura que falhou
   * apagaria o torneio da tela de todo mundo.
   * [[project_ler_firestore_por_rest_erra_calado]] */
  if (!inscritos.length || !jogos.length) {
    console.error('⛔ ABORTADO: li ' + inscritos.length + ' inscrito(s) e ' + jogos.length + ' jogo(s) — coleção vazia é a assinatura de leitura REST falha. Não decido nada sobre isso.');
    process.exit(1);
  }
  const marcAntes = (t._nPartes && t._nPartes.participants);
  if (marcAntes !== inscritos.length) console.log('⚠️  marcador MENTINDO: _nPartes.participants diz ' + marcAntes + ', a coleção tem ' + inscritos.length + ' — será reparado.');

  // ── (A) substitutos que sumiram do elenco ─────────────────────────────────
  let idx = inscritos.reduce((m, p) => Math.max(m, typeof p._idx === 'number' ? p._idx : -1), -1);
  let seq = inscritos.reduce((m, p) => Math.max(m, (p.item && p.item.enrollSeq) || 0), 0);
  const novosInscritos = [];
  woLog.forEach((w) => {
    if (!w.subUid) return;                        // vaga/Jogador X não é pessoa
    if (uidsInscritos.has(w.subUid)) return;      // já está no elenco
    if (novosInscritos.some((n) => n.item.uid === w.subUid)) return;
    idx += 1; seq += 1;
    novosInscritos.push({
      _id: 'u' + w.subUid, _k: 'u' + w.subUid, _idx: idx,
      item: {
        uid: w.subUid, selfEnrolled: true, ligaActive: true, enrollSeq: seq,
        addedAt: w.at || new Date().toISOString(),
        woSubstituteFor: w.absentName || '', woSubstituteForUid: w.absentUid || null, woSubstituteAt: w.at || null
      }
    });
  });

  // ── (B) jogos que ainda nomeiam o ausente ─────────────────────────────────
  const patchesDeJogo = [];
  const recusados = [];
  woLog.forEach((w) => {
    if (!w.absentName || !w.groupName) return;
    if (!w.subName) return;                        // vaga não preenchida: nada a reescrever
    jogos.forEach((m) => {
      const g = m.jogo; if (!g) return;
      if (String(g.label || '').indexOf(w.groupName) !== 0) return;
      if ((g.roundIndex || 0) !== (w.roundIndex || 0)) return;
      /* ⛔ O NOME MORA EM DOIS LUGARES NO MESMO JOGO, e trocar um só deixa o jogo
       * discordando de si mesmo. Medido depois da primeira passada deste script: eu troquei
       * `p1`/`p2` (a string "A / B") e deixei `team1`/`team2` (os arrays de nomes) com o
       * ausente — os 6 jogos continuavam citando a Nathalya e a marcia por ali.
       * ⭐ Por isso o laço percorre a TRINCA (string, array de nomes, array de uids) junta:
       * quem esquecer uma das três reintroduz a divergência. */
      let mexeu = false;
      const novo = JSON.parse(JSON.stringify(g));
      [['p1', 'team1', 'team1Uids'], ['p2', 'team2', 'team2Uids']].forEach(([campoStr, campoNomes, campoUids]) => {
        let mexeuAqui = false;
        const partes = String(novo[campoStr] || '').split(' / ');
        partes.forEach((nome, i) => {
          if (nome.trim() !== w.absentName) return;
          partes[i] = w.subName;
          if (Array.isArray(novo[campoUids])) novo[campoUids][i] = w.subUid || null;
          mexeuAqui = true;
        });
        if (Array.isArray(novo[campoNomes])) {
          novo[campoNomes].forEach((nome, i) => {
            if (String(nome).trim() !== w.absentName) return;
            novo[campoNomes][i] = w.subName;
            if (Array.isArray(novo[campoUids])) novo[campoUids][i] = w.subUid || null;
            mexeuAqui = true;
          });
        }
        if (mexeuAqui) { novo[campoStr] = partes.join(' / '); mexeu = true; }
      });
      if (!mexeu) return;
      /* ⛔ placar lançado = história. Não reescrevo quem jogou depois do resultado. */
      if (g.scoreP1 != null || g.scoreP2 != null) { recusados.push(g.label + ' (tem placar ' + g.scoreP1 + 'x' + g.scoreP2 + ')'); return; }
      /* ⚠️ `playerUids` é índice denormalizado e NEM TODO jogo tem. Escrever onde não
       * existia é inventar campo — só atualizo o de quem já tinha. */
      const patch = { _id: m._id, de: g.p1 + ' X ' + g.p2, para: novo.p1 + ' X ' + novo.p2, label: g.label, jogo: novo, _loc: m._loc, _chave: m._chave };
      if (Array.isArray(m.playerUids)) {
        const uids = []; (novo.team1Uids || []).concat(novo.team2Uids || []).forEach((u) => { if (u) uids.push(u); });
        patch.playerUids = uids;
      }
      patchesDeJogo.push(patch);
    });
  });

  /* ── (D) O AUSENTE É DESATIVADO — a outra metade do W.O. ──────────────────────
   * `_ligaApplyWo` termina em `_ligaWoDeactivate`: _"O AUSENTE É DESATIVADO — sempre
   * (v1.7.59)"_, travado pelo teste `wo-sempre-desativa`. Isso mora no ELENCO, então
   * também não chegou na subcoleção. Sem esta metade a pessoa que tomou W.O. continua
   * ATIVA e volta a ser sorteada na rodada seguinte, como se nada tivesse acontecido.
   * ⭐ Desativar NÃO tira ninguém da contagem de inscritos — cânone do dono, 30/ago.
   * [[project_inscrito_e_inscrito_sempre_conta]] */
  /* ⛔ SÓ O QUE É ESCRITA PERDIDA — e foi o ensaio que me mostrou a armadilha: TRÊS ausentes
   * de W.O. ANTERIORES à divisão também estão ativos, e pelo menos um deles (Fábio Simão)
   * foi REATIVADO À MÃO pelo organizador — está escrito no histórico do torneio. Desativar
   * aquilo seria desfazer uma decisão dele com cara de conserto.
   * ⭐ A fronteira sai do DADO, não de uma data que eu escreva: enquanto a divisão gravava os
   * 148 inscritos, a escrita no elenco FUNCIONAVA. W.O. anterior a esse instante teve a sua
   * chance de gravar, e o estado de hoje é intencional. Só depois dele a porta ficou cega.
   * [[feedback_never_freeze_my_opinion_as_owners_decision]] */
  const divisaoEm = inscritos.reduce((m, p) => ((p._upd && p._upd > m) ? p._upd : m), '');
  console.log('\ndivisão gravou os inscritos em:', divisaoEm, '— W.O. anterior a isso não é tocado');
  const desativar = [];
  woLog.forEach((w) => {
    if (!w.absentUid) return;                       // "Jogador X" é vaga, não pessoa
    if (!w.at || !divisaoEm || w.at <= divisaoEm) return;   // pré-divisão: o estado é intencional
    const e = inscritos.find((p) => p.item && p.item.uid === w.absentUid);
    if (!e || e.item.ligaActive === false) return;  // não está no elenco, ou já desativado
    if (desativar.some((d) => d._id === e._id)) return;
    desativar.push({ _id: e._id, _k: e._k, _idx: e._idx, nome: w.absentName, quando: w.at,
      item: Object.assign({}, e.item, { ligaActive: false, woDeactivatedAt: w.at }) });
  });

  // ── relatório ─────────────────────────────────────────────────────────────
  console.log('\n(A) SUBSTITUTOS A DEVOLVER PRO ELENCO:', novosInscritos.length);
  novosInscritos.forEach((n) => console.log('   + inscritos/' + n._id, '_idx=' + n._idx, 'enrollSeq=' + n.item.enrollSeq, '| entrou no lugar de:', n.item.woSubstituteFor));
  console.log('\n(B) JOGOS A CORRIGIR:', patchesDeJogo.length);
  patchesDeJogo.forEach((p) => { console.log('   ~', p.label); console.log('       de : ' + p.de); console.log('       para: ' + p.para); });
  if (recusados.length) { console.log('\n⛔ RECUSADOS (placar já lançado — não mexo):'); recusados.forEach((r) => console.log('   ', r)); }
  console.log('\n(D) AUSENTES A DESATIVAR (a outra metade do W.O.):', desativar.length);
  desativar.forEach((d) => console.log('   ~ inscritos/' + d._id, '|', d.nome, '| ligaActive true → false, woDeactivatedAt=' + d.quando));

  /* (C) OS MARCADORES saem da CONTAGEM REAL das coleções — nunca de aritmética sobre o
   * valor velho. Somar +1 a um marcador que já mente propaga a mentira. */
  /* ⛔ `memberUids` TAMBÉM sai da COLEÇÃO, não do delta desta rodada. Eu tinha feito
   * `t.memberUids + novosInscritos`, e na segunda passada `novosInscritos` estava vazio (os
   * três já tinham voltado ao elenco) — resultado: 151 inscritos e memberUids parado em 149,
   * com o Fábio e o Tiago de fora. E isso não é cosmético: `memberUids` é o campo do
   * `array-contains` que faz o torneio APARECER pro participante. Ficariam sem ver o
   * próprio torneio. Mesma lição do (C): reparo se calcula do dado, nunca do delta. */
  const memberUids = Array.from(new Set(
    (t.memberUids || [])
      .concat(inscritos.map((p) => p.item && p.item.uid))
      .concat(novosInscritos.map((n) => n.item.uid))
      .filter(Boolean)
  ));
  const nPartes = Object.assign({}, t._nPartes || {}, {
    participants: inscritos.length + novosInscritos.length,
    matches: jogos.length
  });
  console.log('\n(C) MARCADORES DO DOCUMENTO (recontados das coleções):');
  console.log('    _nPartes.participants ' + ((t._nPartes || {}).participants) + ' → ' + nPartes.participants);
  console.log('    _nPartes.matches      ' + ((t._nPartes || {}).matches) + ' → ' + nPartes.matches);
  console.log('    _nJogos               ' + t._nJogos + ' → ' + jogos.length);
  console.log('    memberUids            ' + (t.memberUids || []).length + ' → ' + memberUids.length);

  if (!APLICAR) { console.log('\n▸ ENSAIO — nada foi gravado. Rode com --aplicar pra valer.'); return; }

  for (const n of novosInscritos) { await grava(DOC + '/inscritos/' + n._id, { _k: n._k, _idx: n._idx, item: n.item }); console.log('  ✓ gravado inscritos/' + n._id); }
  for (const p of patchesDeJogo) {
    const corpo = { _loc: p._loc, _chave: p._chave, jogo: p.jogo };
    if (p.playerUids) corpo.playerUids = p.playerUids;
    await grava(DOC + '/matches/' + p._id, corpo);
    console.log('  ✓ gravado matches/' + p._id);
  }
  for (const d of desativar) { await grava(DOC + '/inscritos/' + d._id, { _k: d._k, _idx: d._idx, item: d.item }); console.log('  ✓ desativado inscritos/' + d._id + ' (' + d.nome + ')'); }
  await grava(DOC + '?updateMask.fieldPaths=memberUids&updateMask.fieldPaths=_nPartes&updateMask.fieldPaths=_nJogos&updateMask.fieldPaths=updatedAt',
              { memberUids: memberUids, _nPartes: nPartes, _nJogos: jogos.length, updatedAt: new Date().toISOString() });
  console.log('  ✓ documento atualizado');
  console.log('\n✅ reparo aplicado.');
})().catch((e) => { console.error('⛔ ERRO:', e.message); process.exit(1); });
