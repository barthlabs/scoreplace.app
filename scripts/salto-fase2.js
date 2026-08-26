#!/usr/bin/env node
/* salto-fase2.js — BACKUP + TRANSFERÊNCIA, num comando só, na ordem certa.
 *
 * Ordem do dono (26/ago): _"faça um backup separado que possa ser consultado no estado
 * antigo imediatamente antes de transcrever os dados para o sistema novo"_ e
 * _"esse backup separado deve ficar guardado até termos certeza que ninguém reclamou de
 * algo que mudou sem percebermos"_.
 *
 * ⛔ GUARDA DOIS ESTADOS, e por razões diferentes:
 *   ① `tournaments_backup/{id}` — o documento EXATAMENTE como está no segundo antes da
 *      transferência. É contra ELE que se confere se a transferência mudou alguma coisa.
 *   ② `tournaments_backup/{id}__original` — lido do PASSADO do banco (Point-In-Time
 *      Recovery), de um instante ANTERIOR a qualquer manutenção. O dono apontou o buraco
 *      que isto fecha: _"se vc cagou em algo na transferencia e nao temos mais os dados
 *      originais, a cagada se propaga no backup"_ — um snapshot tirado depois de um erro
 *      guarda o erro com cara de original. Este segundo não passa por código meu nenhum.
 *      ⚠️ A janela do PITR é de 7 dias. Depois disso essa porta fecha pra sempre.
 *
 * ⛔ NENHUM DOS DOIS TEM PRAZO. Ficam até o dono mandar apagar — a regra do Firestore nega
 * leitura e escrita pro cliente; só o Admin SDK alcança.
 *
 * ⛔ E A ORDEM É SAGRADA — o passo destrutivo é o ÚLTIMO:
 *   ① congela os dois e RELÊ pra conferir
 *   ② prova `remontar(dividir(t)) === t`
 *   ③ escreve a subcoleção e prova que remontar DELA devolve o original
 *   ④ só agora o documento perde os jogos
 * Qualquer passo que falhe aborta ANTES do ④. Até lá, nada foi destruído.
 *
 * Uso:  node scripts/salto-fase2.js <id> [--pitr <ISO>]            # em seco
 *       node scripts/salto-fase2.js <id> [--pitr <ISO>] --aplicar
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const S = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const argv = process.argv.slice(2);
const APLICAR = argv.indexOf('--aplicar') !== -1;
const ID = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--pitr');
const iP = argv.indexOf('--pitr');
const PITR = iP >= 0 ? argv[iP + 1] : '2026-08-26T03:00:00Z';
const kb = (v) => (Buffer.byteLength(JSON.stringify(v) || '', 'utf8') / 1024).toFixed(1) + ' KB';
const morre = (m) => { console.error('\n⛔ ABORTADO: ' + m + '\n   O documento segue INTACTO — nada foi destruído.'); process.exit(1); };
const jogosDe = (t) => { const o = []; (t.rounds || []).forEach((r) => (r.matches || []).forEach((m) => m && o.push(m))); (t.matches || []).forEach((m) => m && o.push(m)); (t.groups || []).forEach((g) => (g.matches || []).forEach((m) => m && o.push(m))); return o; };
const comPlacar = (l) => l.filter((m) => m && (m.winner || m.sets || m.scoreP1 != null)).length;

(async () => {
  if (!ID) morre('uso: node scripts/salto-fase2.js <idDoTorneio> [--pitr <ISO>] [--aplicar]');
  const ref = db.collection('tournaments').doc(String(ID));
  const doc = await ref.get();
  if (!doc.exists) morre('torneio ' + ID + ' não existe');
  /* ⭐ INSCRITOS SAEM JUNTO (2.0.108). Ordem do dono, e ele está certo: _"se cada torneio
   * é um doc, cada jogo é um doc pendurado no torneio e cada inscrito é outro doc, não tem
   * limite"_. Com só os jogos fora, o teto tinha ido de 4,2× pra 7,5× — mas continuava
   * teto: medido, 556 B por inscrito ⇒ o documento RECUSA a partir de ~1.780 pessoas.
   * `participants` sozinho eram 256 B disso, o maior custo por pessoa. */
  /* ⛔ INSCRITOS FORA DO SALTO — POR ORA. Descoberto no canário (torneio real encerrado),
   * e o ensaio NÃO pegaria porque o torneio de ensaio nasce limpo:
   * `tournaments/{id}/participants` JÁ É USADA por outro espelho, com esquema DIFERENTE —
   * o roster (id = uid puro, dado cru) contra o meu (id = `_k`, `{_idx,_k,item}`).
   * Medido: 13 documentos onde deviam ser 8. `remontar` devolveu o certo por SORTE (os
   * intrusos não têm `_idx` e caíram fora do mapa) — e "funcionou por sorte" não é
   * critério pra mexer no elenco de um torneio.
   * ⇒ Os inscritos só saem quando tiverem SUBCOLEÇÃO PRÓPRIA. Dois esquemas no mesmo
   * lugar é o tipo de coisa que passa despercebida até o dia em que um deles muda.
   * ⚠️ E isto NÃO adia o objetivo do dono ("não tem que ter limite"): é o passo seguinte,
   * com nome de coleção próprio, não uma desistência. */
  const FORA = ['matches'];

  let t = doc.data(); t.id = String(ID);

  /* ⭐ ESTENDER UM TORNEIO JÁ DIVIDIDO (2.0.108). Antes isto dizia "já dividido, nada a
   * fazer" olhando só `matches` — e aí não dava pra tirar os INSCRITOS depois, que é
   * justamente o que faltava pro documento parar de crescer com gente.
   * ⛔ E pra estender é obrigatório MONTAR primeiro: o documento de um torneio dividido não
   * tem os jogos. Dividir o doc cru geraria um "original" sem jogo nenhum, a prova de
   * remontagem passaria (é igual a si mesma) e os jogos ficariam órfãos na subcoleção,
   * fora do que o app monta. Montar antes é o que faz a prova valer contra o TORNEIO, não
   * contra o pedaço dele que sobrou no documento. */
  const jaFora = Array.isArray(t._semPesados) ? t._semPesados : [];
  const faltam = FORA.filter((k) => jaFora.indexOf(k) === -1);
  if (!faltam.length) { console.log('já dividido em [' + jaFora.join(', ') + '] — nada a fazer'); process.exit(0); }
  if (jaFora.length) {
    const partesJa = { config: JSON.parse(JSON.stringify(t)) };
    for (const nome of jaFora) {
      const sub = await ref.collection(nome).get();
      partesJa[nome] = sub.docs.map((d) => d.data());
    }
    const montado = S.remontar(partesJa);
    if (!montado) morre('não consegui MONTAR o torneio já dividido — não vou estender às cegas');
    montado.id = String(ID);
    delete montado._semPesados;
    t = montado;
    console.log('  ⭐ já dividido em [' + jaFora.join(', ') + '] — montado do banco pra estender em [' + faltam.join(', ') + ']');
  }
  const jog = jogosDe(t);
  console.log('═══ ' + (t.name || ID));
  console.log('  AGORA: ' + kb(t) + ' · ' + jog.length + ' jogos (' + comPlacar(jog) + ' com placar) · ' +
    ((t.participants || []).length) + ' inscritos · ' + ((t.history || []).length) + ' eventos');

  const _configPraGravar = (p) => {
    const c = JSON.parse(JSON.stringify(p.config));
    delete c._semPesados; delete c._nJogos;   // recolocados abaixo, com o valor de AGORA
    ['participants', 'history'].forEach((k) => {
      if (FORA.indexOf(k) === -1 && t[k] !== undefined) c[k] = JSON.parse(JSON.stringify(t[k]));
    });
    // ⛔ `memberUids` FICA no documento de propósito: é ele que o ouvinte ao vivo consulta
    // (`array-contains`) pra saber quais torneios são meus. Numa subcoleção, essa consulta
    // deixa de existir e a tela inicial não tem como se montar. São 31 B por pessoa.
    return c;
  };

  // ── ② a prova que autoriza dividir ───────────────────────────────────────
  /* ⛔ ARMADILHA QUE A TRAVA PEGOU (26/ago, na 1ª tentativa real):
   * `dividir` extrai os TRÊS pesados — jogos, inscritos E histórico —, e `partes.config`
   * volta com `participants: []` e `history: []`. Gravar essa config crua teria APAGADO
   * os 148 inscritos e o histórico do documento. Os jogos estavam perfeitos (115/115
   * idênticos); o que não batia era o elenco.
   * ⇒ Só `matches` sai. O que NÃO está no marcador volta pra config antes de qualquer
   * gravação — e a conferência tem que usar a MESMA forma, senão ela aprova a coisa errada.
   * (É a mesma proteção que `_gravaTorneio` e `saveTournament` já tinham; o script de
   * migração não tinha, e foi a prova de remontar que gritou.) */
  const partes = S.dividir(JSON.parse(JSON.stringify(t)));
  const volta = S.remontar(JSON.parse(JSON.stringify(partes)));
  if (!volta || !S.iguais(volta, t)) morre('remontar(dividir(t)) NÃO devolveu o original — este torneio NÃO pode ser dividido');
  console.log('  ✓ remontar(dividir(t)) === t');
  console.log('  documento depois: ' + kb(_configPraGravar(partes)) + '  (de ' + kb(t) + ')   ⬅ com elenco e histórico DENTRO');

  // ── o original do PASSADO, pra conferir que a manutenção de hoje não mudou o que importa
  let orig = null;
  try {
    orig = await db.runTransaction(async (tx) => (await tx.get(ref)).data(),
      { readOnly: true, readTime: admin.firestore.Timestamp.fromDate(new Date(PITR)) });
  } catch (e) { console.log('  ⚠️ não consegui ler o passado (' + PITR + '): ' + ((e && e.message) || e)); }
  if (orig) {
    const jo = jogosDe(orig);
    console.log('  ORIGINAL (' + PITR + '): ' + kb(orig) + ' · ' + jo.length + ' jogos (' +
      comPlacar(jo) + ' com placar) · ' + ((orig.participants || []).length) + ' inscritos');
    if (jo.length > jog.length) morre('o original tem MAIS jogos que agora (' + jo.length + ' > ' + jog.length + ') — parar e investigar');
    if (comPlacar(jo) > comPlacar(jog)) morre('o original tem MAIS placares que agora — parar e investigar');
    console.log('  ✓ nada de jogo nem de placar se perdeu entre o original e agora');
  }
  if (!APLICAR) { console.log('\n(em seco — nada gravado; rode com --aplicar)'); process.exit(0); }

  // ── ① os dois backups, conferidos relendo ────────────────────────────────
  const bcol = db.collection('tournaments_backup');
  const guarda = async (sufixo, dados, origem) => {
    const r = bcol.doc(String(ID) + sufixo);
    const jg = jogosDe(dados);
    await r.set({ doc: dados, origem: origem, em: new Date().toISOString(),
      motivo: 'guardar até o dono dizer que ninguém reclamou (ordem de 26/ago) — SEM PRAZO',
      jogos: jg.length, comPlacar: comPlacar(jg),
      inscritos: (dados.participants || []).length, historico: (dados.history || []).length });
    const lido = (await r.get()).data() || {};
    if (JSON.stringify(lido.doc) !== JSON.stringify(dados)) morre('o backup "' + sufixo + '" releu DIFERENTE — não confie nele');
    console.log('  ✓ backup tournaments_backup/' + ID + sufixo + ' gravado e CONFERIDO relendo (' + kb(dados) + ')');
  };
  await guarda('', t, 'documento vivo, no segundo antes da transferência');
  if (orig) await guarda('__original', orig, 'PITR ' + PITR + ' (não passa por código de manutenção)');

  // ── ③ as subcoleções, e a prova de que elas remontam o original ─────────
  /* ⭐ Uma parte de cada vez, e cada uma chaveada pelo que a IDENTIFICA: jogo por
   * `_chave`, inscrito por `_k` (uid → uids da dupla → nome, cânone do dono).
   * ⛔ NUNCA por posição — foi a armadilha que quase destruiu o histórico. */
  const CHAVE = { matches: (x) => x._chave, participants: (x) => x._k, history: (x) => x._k };
  const lidosPorParte = {};
  const contagem = [];
  for (const nome of FORA) {
    const col = ref.collection(nome);
    let lote = db.batch(), n = 0;
    for (const item of (partes[nome] || [])) {
      lote.set(col.doc(String(CHAVE[nome](item))), item);
      if (++n >= 400) { await lote.commit(); lote = db.batch(); n = 0; }
    }
    if (n) await lote.commit();

    /* ⛔ LIMPA O QUE SOBROU DE CHAVE VELHA — o ensaio pegou isto antes de produção.
     * A subcoleção já existia: o gatilho de espelho vinha escrevendo os inscritos com
     * chave POSICIONAL (`p0`, `p1`). O salto escreve com chave por IDENTIDADE (`uu1`) —
     * e as duas convivem no mesmo lugar. Resultado medido: escrevi 2, li 4. Remontar
     * veria QUATRO inscritos onde existem dois, e o dobro do elenco chegaria na tela.
     * ⭐ Aqui a verdade é o que acabou de ser escrito: o documento é a fonte, e qualquer
     * chave fora deste conjunto é resíduo de formato antigo, por definição.
     * ⛔ NUNCA fazer isto com `history`: lá o espelho tem LEGITIMAMENTE mais do que o
     * documento (é o que foi podado), e apagar o excedente seria destruir o log. */
    const esperadas = new Set((partes[nome] || []).map((x) => String(CHAVE[nome](x))));
    if (nome !== 'history') {
      const tudo = await col.get();
      const sobrando = tudo.docs.filter((d) => !esperadas.has(d.id));
      if (sobrando.length) {
        let l2 = db.batch(), n2 = 0;
        for (const d of sobrando) { l2.delete(d.ref); if (++n2 >= 400) { await l2.commit(); l2 = db.batch(); n2 = 0; } }
        if (n2) await l2.commit();
        console.log('  ⚠️ ' + nome + ': ' + sobrando.length + ' documento(s) de chave ANTIGA removido(s) da subcoleção');
      }
    }

    const snapP = await col.get();
    lidosPorParte[nome] = snapP.docs.map((d) => d.data());
    if (snapP.size !== (partes[nome] || []).length) {
      morre(nome + ': escrevi ' + (partes[nome] || []).length + ' e li ' + snapP.size +
            ' — a subcoleção não bate com o documento. NÃO vou dividir.');
    }
    contagem.push(snapP.size + ' ' + nome);
  }
  // ⭐ remonta com a config QUE VAI SER GRAVADA e as partes LIDAS DE VOLTA do banco — é a
  // única forma de a prova valer pro que vai pro ar.
  const remontado = S.remontar(Object.assign({ config: _configPraGravar(partes) }, lidosPorParte));
  if (!remontado || !S.iguais(remontado, t)) morre('as subcoleções NÃO remontam o original (' + contagem.join(' · ') + ')');
  console.log('  ✓ ' + contagem.join(' · ') + ' nas subcoleções, e remontar DELAS devolve o original byte a byte');

  // ── ④ só agora, o único passo destrutivo ─────────────────────────────────
  const config = _configPraGravar(partes);
  config._semPesados = FORA;
  // ⭐ quantos jogos moram fora — é o que separa "não sorteou" de "não carregou" na tela.
  // Sem ele, todo torneio dividido é acusado de incompleto (e o vazio de verdade também).
  if (FORA.indexOf('matches') !== -1) config._nJogos = (partes.matches || []).length;
  await ref.set(config);
  const conf = (await ref.get()).data();
  console.log('  ✓ documento dividido: ' + kb(t) + ' → ' + kb(conf) +
    '   (cabe ' + (1024 / (Buffer.byteLength(JSON.stringify(conf), 'utf8') / 1024)).toFixed(0) + '× até o teto)');
  console.log('\n✅ TRANSFERIDO.');
  console.log('   consultar o antigo:  node scripts/ver-backup.js ' + ID);
  console.log('   voltar atrás:        node scripts/desfazer-divisao.js ' + ID + ' --aplicar');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
