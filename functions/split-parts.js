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
  /* ⛔ TODO TORNEIO NASCE DIVIDIDO. `_semPesados` continua no documento somente para o
   * aplicativo nativo antigo, mas NÃO é uma decisão de negócio deste lado. Quando uma
   * fotografia legítima chega sem o marcador, tratá-la como "inteira" faz a Function
   * decidir lotação/duplicata com `participants: []` e depois gravar no lugar errado.
   * A fonte única `partesDe` preserva o marcador quando existe e devolve as partes
   * canônicas quando ele falta. [[project_torneio_nasce_dividido]] */
  return S.partesDe(data);
}

function temGruposFisicos(data) {
  return !!(data && ((Array.isArray(data._semPesados) && data._semPesados.includes('grupos')) ||
    (data._nPartes && Number.isSafeInteger(data._nPartes.grupos) && data._nPartes.grupos > 0) ||
    (Number.isSafeInteger(data._nGrupos) && data._nGrupos > 0)));
}

function contagemGruposFisicos(data) {
  const principal = data && data._nPartes && data._nPartes.grupos;
  const alias = data && data._nGrupos;
  if (principal != null && alias != null && principal !== alias) {
    throw new Error('[split-parts] contadores físicos de grupos divergentes');
  }
  return principal != null ? principal : alias;
}

function partesIdenticas(antes, depois) {
  const delta = S.jogosQueMudaram(antes || [], depois || []);
  const reverso = S.jogosQueMudaram(depois || [], antes || []);
  return !delta.mudaram.length && !delta.sumiram.length &&
    !reverso.mudaram.length && !reverso.sumiram.length;
}

/**
 * Devolve `data` com as partes divididas PREENCHIDAS a partir das subcoleções.
 * Muta e devolve o próprio objeto — quem chama já trabalha com uma cópia do snapshot.
 * ⛔ Se uma parte não vier, LANÇA. Entregar um torneio com o elenco vazio pra quem vai
 * decidir lotação e duplicata é pior que falhar: a falha a pessoa vê e tenta de novo.
 *
 * ⭐ `apenas` (opcional) — MESMA semântica do `dividir(t, apenas)` do tradutor: hidrata só
 * as partes pedidas, e sempre INTERSECTADAS com as partes CANÔNICAS (pedir uma parte fora
 * do contrato não inventa leitura nenhuma). `_semPesados` é apenas compatibilidade nativa;
 * existe porque as portas que só
 * precisam saber QUEM ESTÁ INSCRITO — telefone de contato, @ do letzplay, comunicado do
 * organizador — não têm por que arrastar `matches` e `opponentHistory` inteiros de um
 * torneio de 150 pessoas dentro de um callable de 30s.
 * ⛔ Omitir `apenas` continua hidratando TUDO: quem decide chave/lotação precisa do
 * torneio inteiro, e o default nunca pode ser o que entrega de menos.
 */
async function hidratar(tx, ref, data, apenas) {
  let fora = partesDivididas(data);
  const gruposFisicos = temGruposFisicos(data);
  if (gruposFisicos && !fora.includes('grupos')) fora.push('grupos');
  if (Array.isArray(apenas)) {
    const pedidos = new Set(apenas);
    if (gruposFisicos && pedidos.has('grupos')) pedidos.add('matches');
    fora = fora.filter((n) => pedidos.has(n));
  }
  if (!fora.length) return data;
  for (const nome of fora) {
    const col = ref.collection(S.colecaoDaParte(nome));
    const snap = await (tx ? tx.get(col) : col.get());
    const regs = snap.docs.map((d) => d.data());
    if (nome === 'matches') {
      const montado = S.remontar({ config: data, matches: regs });
      if (!montado) throw new Error('[split-parts] remontar falhou em "matches"');
      for (const campo of ['matches', 'rounds', 'phaseRounds', 'groups', 'thirdPlaceMatch']) {
        if (Object.prototype.hasOwnProperty.call(montado, campo)) data[campo] = montado[campo];
      }
    } else if (nome === 'grupos') {
      const montado = S.remontar({ config: data, grupos: regs });
      if (!montado) throw new Error('[split-parts] remontar falhou em "grupos"');
      const vistos = new Set();
      for (const reg of regs) {
        const loc = reg && reg._loc;
        if (!loc || loc.tipo !== 'grupos' || !Number.isSafeInteger(loc.ri) || loc.ri < 0 ||
            !Number.isSafeInteger(loc.gi) || loc.gi < 0) {
          throw new Error('[split-parts] localização física de grupo inválida');
        }
        const chave = loc.ri + ':' + loc.gi;
        if (vistos.has(chave)) throw new Error('[split-parts] localização física de grupo repetida');
        vistos.add(chave);
      }
      const count = contagemGruposFisicos(data);
      if (count != null && (!Number.isSafeInteger(count) || count < 0 || count !== regs.length)) {
        throw new Error('[split-parts] contagem física de grupos divergente');
      }
      const reextraidos = S.dividir(montado, ['grupos']).grupos || [];
      if (reextraidos.length !== regs.length || !partesIdenticas(regs, reextraidos)) {
        throw new Error('[split-parts] remontar perdeu ou alterou grupo físico');
      }
      const jogosAntes = S.dividir(data, ['matches']).matches || [];
      const jogosDepois = S.dividir(montado, ['matches']).matches || [];
      if (!partesIdenticas(jogosAntes, jogosDepois)) {
        throw new Error('[split-parts] remontar grupos alterou jogos');
      }
      data.rounds = montado.rounds;
    } else {
      const montado = S.remontar({ config: { [nome]: [] }, [nome]: regs });
      if (!montado) throw new Error('[split-parts] remontar falhou em "' + nome + '"');
      data[nome] = montado[nome] || [];
    }
  }
  return data;
}

/*
 * Leitura com chave física para migrações. `hidratar()` devolve somente valores
 * porque é o formato que o motor de torneio consome; uma migração de identidade
 * precisa também do document ID, pois ele é a âncora determinística do convidado
 * legado. Esta função não escreve nem tenta remontar a parte.
 */
async function lerRegistrosDaParte(tx, ref, nome) {
  const col = ref.collection(S.colecaoDaParte(nome));
  const snap = await (tx ? tx.get(col) : col.get());
  return snap.docs.map((doc) => {
    const data = doc.data() || {};
    return { sourceKey: doc.id, entry: data.item || data };
  });
}

/**
 * Aplica `updateData` respeitando a divisão: campo que mora fora vai pra subcoleção (com
 * diff, para não reescrever o que não mudou nem perder quem saiu), e o resto vai pro doc.
 * `antes` é o torneio JÁ HIDRATADO — é dele que sai o lado esquerdo do diff.
 * ⛔ Deriva de `partesDe` (a lista canônica). Citar 'participants' aqui à mão faria a próxima
 * parte a entrar na lista ser esquecida em silêncio, que é como este projeto já perdeu parte
 * quatro vezes. O marcador legado não pode voltar a escolher essa lista.
 */
function gravar(tx, ref, antes, updateData) {
  const fora = partesDivididas(antes);
  const doc = Object.assign({}, updateData || {});
  if (!fora.length) { if (Object.keys(doc).length) tx.update(ref, doc); return; }

  // Depois da tradução administrativa, um callable pode reenviar a estrutura
  // hidratada. Só metadados mudam aqui: jogos e grupos físicos ficam na sua
  // subcoleção. O tradutor único limpa todas as posições aninhadas da raiz.
  if (antes._inlineGamesExternalized === true) {
    if (Object.prototype.hasOwnProperty.call(doc, 'matches')) {
      throw new Error('[split-parts] jogos migrados exigem escrita física específica');
    }
    const structural = ['rounds', 'phaseRounds', 'groups', 'thirdPlaceMatch']
      .filter((field) => Object.prototype.hasOwnProperty.call(doc, field));
    if (structural.length) {
      const original = S.dividir(JSON.parse(JSON.stringify(antes)), ['matches', 'grupos']);
      const counts = antes._nPartes || {};
      if (!Number.isSafeInteger(counts.matches) || counts.matches < 0 ||
          counts.matches !== original.matches.length) {
        throw new Error('[split-parts] jogos migrados não foram hidratados por completo');
      }
      const oldGroups = original.grupos || [];
      const count = contagemGruposFisicos(antes);
      if ((oldGroups.length || count != null) &&
          (!Number.isSafeInteger(count) || count < 0 || count !== oldGroups.length)) {
        throw new Error('[split-parts] grupos migrados não foram hidratados por completo');
      }
      const proposed = S.dividir(JSON.parse(JSON.stringify(Object.assign({}, antes, doc))),
        ['matches', 'grupos']);
      for (const name of ['matches', 'grupos']) {
        const delta = S.jogosQueMudaram(original[name] || [], proposed[name] || []);
        if (delta.mudaram.length || delta.sumiram.length) {
          throw new Error('[split-parts] ' + name + ' migrados exigem escrita física específica');
        }
      }
      for (const field of structural) {
        if (Object.prototype.hasOwnProperty.call(proposed.config, field)) {
          doc[field] = proposed.config[field];
        } else {
          delete doc[field];
        }
      }
    }
  } else if (temGruposFisicos(antes) && Object.prototype.hasOwnProperty.call(doc, 'rounds')) {
    const original = S.dividir(JSON.parse(JSON.stringify(antes)), ['grupos']);
    const count = contagemGruposFisicos(antes);
    if (!Number.isSafeInteger(count) || count < 0 || count !== original.grupos.length) {
      throw new Error('[split-parts] grupos físicos não foram hidratados por completo');
    }
    if (!Array.isArray(doc.rounds)) throw new Error('[split-parts] rodadas inválidas');
    const proposedRounds = doc.rounds.map((round, ri) => {
      if (!round || typeof round !== 'object') return round;
      // Um round vindo do config já dividido carrega `monarchGroups: []`.
      // Aqui vazio/ausente significa manter a subcoleção; removê-la exige escritor físico.
      const groups = round.monarchGroups;
      if (Object.prototype.hasOwnProperty.call(round, 'monarchGroups') &&
          (!Array.isArray(groups) || groups.length)) return round;
      const previous = Array.isArray(antes.rounds) && antes.rounds[ri];
      return previous && Object.prototype.hasOwnProperty.call(previous, 'monarchGroups')
        ? Object.assign({}, round, { monarchGroups: previous.monarchGroups }) : round;
    });
    const proposed = S.dividir(JSON.parse(JSON.stringify(Object.assign({}, antes, doc,
      { rounds: proposedRounds }))), ['grupos']);
    if (!partesIdenticas(original.grupos, proposed.grupos)) {
      throw new Error('[split-parts] grupos físicos exigem escrita específica');
    }
    doc.rounds = proposed.config.rounds;
  }

  let mexeu = Object.keys(doc).length > 0;   // campo que fica no doc já é motivo de bump
  // ⛔ `_nPartes` mede REGISTROS FÍSICOS da subcoleção, não pessoas. Formar uma
  // dupla troca duas entradas por uma; desfazer faz o contrário. Se o marcador fica
  // no total anterior, o cliente recebe o elenco certo mas o declara "incompleto" e
  // mantém o card em "Carregando…" para sempre. O marcador é derivado AQUI, no mesmo
  // diff que escreve a parte: nenhuma porta que transforme o elenco pode esquecê-lo.
  // [[regression_pairing_keeps_split_part_count_in_sync]]
  const nPartes = Object.assign({}, antes._nPartes || {});
  let marcouParte = false;
  const pAntes = S.dividir(JSON.parse(JSON.stringify(antes)), fora);
  fora.forEach((nome) => {
    if (!(nome in doc)) return;                       // esta gravação não mexe nesta parte
    const depois = S.dividir({ [nome]: doc[nome] }, [nome]);
    delete doc[nome];                                 // não vai pro documento
    nPartes[nome] = (depois[nome] || []).length;
    marcouParte = true;
    const d = S.jogosQueMudaram(pAntes[nome] || [], depois[nome] || []);
    const col = ref.collection(S.colecaoDaParte(nome));
    const ch = (x) => {
      const k = S.chaveDoRegistro(x);
      if (!k) throw new Error('[split-parts] registro sem chave em "' + nome + '"');
      return k;
    };
    d.mudaram.forEach((x) => { tx.set(col.doc(ch(x)), x); mexeu = true; });
    d.sumiram.forEach((x) => { tx.delete(col.doc(ch(x))); mexeu = true; });
  });
  if (marcouParte) {
    doc._nPartes = nPartes;
    // Compatibilidade com clientes antigos: estes dois aliases também descrevem
    // contagem de registros externos e não podem divergir do marcador canônico.
    if (Object.prototype.hasOwnProperty.call(nPartes, 'matches')) doc._nJogos = nPartes.matches;
    if (Object.prototype.hasOwnProperty.call(nPartes, 'grupos')) doc._nGrupos = nPartes.grupos;
    mexeu = true;
  }
  /* ⛔ O DOCUMENTO TEM QUE SER TOCADO MESMO QUANDO SÓ A SUBCOLEÇÃO MUDOU.
   * Antes, uma gravação que mexia SÓ numa parte dividida (o caso do PLACAR) caía aqui com
   * `doc` vazio — o `delete doc[nome]` acima tinha tirado a única chave — e o `tx.update`
   * não rodava. Resultado: o jogo ia pra subcoleção e o doc do torneio ficava intacto.
   * Como `updatedAt` não andava, o `onSnapshot` do DOC não disparava e todo portão de
   * frescor concluía "nada mudou" — o cliente seguia pintando o cache.
   * MEDIDO no Confra (26/ago/2026, torneio AO VIVO): doc.updatedAt = 22:24:03, enquanto os
   * jogos 11/10/12 do Grupo D foram gravados 22:24:23 / :35 / :47. Os três placares estavam
   * salvos e CERTOS na subcoleção; dois deles a tela mostrava como 0-0 "PRONTO", com botão
   * de confirmar — a tela inventando um estado que o dado não tinha. Relato do dono:
   * "os resultados que lancei para o jogo 10 e 12 sumiram".
   * A porta `aplicarNoTorneio` (functions/index.js) já bumpava o `updatedAt` sempre; esta
   * não. Duas portas para a mesma subcoleção, uma só ciente. [[feedback_unify_dual_entry_points]]
   * ⚠️ Só toca o doc se ALGO foi de fato escrito — bump em gravação vazia seria escrita
   * inventada, e `updatedAt` que anda sozinho quebra quem usa ele como assinatura. */
  if (mexeu && !('updatedAt' in doc)) doc.updatedAt = new Date().toISOString();
  if (Object.keys(doc).length) tx.update(ref, doc);
}

module.exports = { partesDivididas, hidratar, lerRegistrosDaParte, gravar };
