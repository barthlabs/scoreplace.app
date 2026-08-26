/* split-parts.js — TORNEIO DIVIDIDO, PARA QUEM ESCREVE NO functions/  (2.0.120)
 *
 * ⛔ O BURACO QUE ISTO FECHA (medido em 26/ago/2026): `functions/index.js` tinha ZERO
 * menção à divisão (`grep -c '_semPesados'` = 0). O `enrollParticipant` mora lá e fazia:
 *
 *     const snap = await tx.get(docRef);
 *     const r = _enrollCore.computeEnroll(snap.data(), ...);
 *     if (r.updateData) tx.update(docRef, r.updateData);
 *
 * Num torneio DIVIDIDO o campo `participants` do documento é `[]` — o elenco mora na
 * subcoleção `inscritos`. Então `computeEnroll` conferia LOTAÇÃO e DUPLICATA contra uma
 * lista vazia (deixaria entrar quem já estava dentro, e ignoraria o limite de vagas) e
 * gravava o novo inscrito num campo que a leitura (`montarDoBanco`) sobrescreve com a
 * subcoleção. A pessoa entrava e sumia.
 *
 * ⭐ NÃO CHEGOU A ACONTECER, e a medição é o que permite dizer isso: no Confra havia 148
 * uids em `memberUids`, 148 docs em `inscritos` e `participants: []` — ninguém se inscreveu
 * entre a divisão e o conserto.
 *
 * ⛔ POR QUE ISTO NÃO REESCREVE A REGRA DE CHAVE: `chaveDoInscrito` mora no tradutor
 * (js/views/tournament-split-core.js) e viaja pra cá pelo copy-vendor. Duas cópias de uma
 * regra de chave divergem, e divergir numa chave é gravar o registro de A por cima do de B.
 * [[project_teto_do_documento_e_arquitetura_de_dados]] [[feedback_unify_dual_entry_points]]
 *
 * ⚠️ ORDEM NO FIRESTORE: transação lê TUDO antes de escrever QUALQUER coisa. Por isso
 * `hidratar` é await-ado antes de `computeEnroll`, e `gravar` só corre depois.
 */
const S = require('./vendor/tournament-split-core.js');

/** As partes que este torneio guarda fora do documento. */
function partesDivididas(data) {
  return (data && Array.isArray(data._semPesados)) ? data._semPesados.slice() : [];
}

/**
 * Devolve `data` com as partes divididas PREENCHIDAS a partir das subcoleções.
 * Muta e devolve o próprio objeto — quem chama já trabalha com uma cópia do snapshot.
 * ⛔ Se uma parte não vier, LANÇA. Entregar um torneio com o elenco vazio pra quem vai
 * decidir lotação e duplicata é pior que falhar: a falha a pessoa vê e tenta de novo.
 */
async function hidratar(tx, ref, data) {
  const fora = partesDivididas(data);
  if (!fora.length) return data;
  for (const nome of fora) {
    const col = ref.collection(S.colecaoDaParte(nome));
    const snap = await (tx ? tx.get(col) : col.get());
    const regs = snap.docs.map((d) => d.data());
    const montado = S.remontar({ config: { [nome]: [] }, [nome]: regs });
    if (!montado) throw new Error('[split-parts] remontar falhou em "' + nome + '"');
    data[nome] = montado[nome] || [];
  }
  return data;
}

/**
 * Aplica `updateData` respeitando a divisão: campo que mora fora vai pra subcoleção (com
 * diff, para não reescrever o que não mudou nem perder quem saiu), e o resto vai pro doc.
 * `antes` é o torneio JÁ HIDRATADO — é dele que sai o lado esquerdo do diff.
 * ⛔ Deriva de `_semPesados`. Citar 'participants' aqui à mão faria a próxima parte a entrar
 * na lista ser esquecida em silêncio, que é como este projeto já perdeu parte quatro vezes.
 */
function gravar(tx, ref, antes, updateData) {
  const fora = partesDivididas(antes);
  const doc = Object.assign({}, updateData || {});
  if (!fora.length) { if (Object.keys(doc).length) tx.update(ref, doc); return; }

  const pAntes = S.dividir(JSON.parse(JSON.stringify(antes)));
  fora.forEach((nome) => {
    if (!(nome in doc)) return;                       // esta gravação não mexe nesta parte
    const depois = S.dividir({ [nome]: doc[nome] });
    delete doc[nome];                                 // não vai pro documento
    const d = S.jogosQueMudaram(pAntes[nome] || [], depois[nome] || []);
    const col = ref.collection(S.colecaoDaParte(nome));
    const ch = (x) => {
      const k = S.chaveDoRegistro(x);
      if (!k) throw new Error('[split-parts] registro sem chave em "' + nome + '"');
      return k;
    };
    d.mudaram.forEach((x) => tx.set(col.doc(ch(x)), x));
    d.sumiram.forEach((x) => tx.delete(col.doc(ch(x))));
  });
  if (Object.keys(doc).length) tx.update(ref, doc);
}

module.exports = { partesDivididas, hidratar, gravar };
