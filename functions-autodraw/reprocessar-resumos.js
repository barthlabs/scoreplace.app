'use strict';
/* ⛔⛔ REPROCESSAR OS RESUMOS PÚBLICOS — tirar o e-mail e os votos de quem já está gravado.
 *
 * POR QUE EXISTE: a partir da 2.3.101 o resumo público não recebe mais `organizerEmail` nem o
 * mapa de votos das enquetes (cujas CHAVES são e-mails de participantes). Mas o gatilho só
 * regrava o resumo quando algo do CARTÃO muda — tirar um campo do resumo não muda o torneio.
 * Sem este reprocessamento, todo torneio que não for tocado fica com o dado exposto para
 * sempre.
 *
 * ⛔ MORA NESTA CODEBASE, não em `scripts/`: `require('firebase-admin')` resolve a partir da
 * pasta do ARQUIVO, e a dependência só existe aqui. Rodar "de dentro da pasta" não muda isso.
 *
 * ⛔ MONTA O TORNEIO DIVIDIDO ANTES DE RESUMIR. A versão em `scripts/` entregava o documento
 * RAIZ direto ao `buildSummary` — em torneio dividido os pesados moram em subcoleções, então
 * um `--apply` assim regravaria o cartão de TODOS eles com elenco e progresso ZERADOS. Seria
 * trocar um vazamento por um dado mentiroso. Quem monta é a porta canônica `montarDoBanco`.
 *
 * ⛔ TRANSAÇÃO, porque o gatilho está VIVO enquanto isto roda: todas as leituras acontecem
 * antes de qualquer escrita, dentro da transação, e o retry é o nativo do Firestore. Montar de
 * partes lidas em momentos diferentes é como nasce um resumo que nunca existiu.
 *
 * ⛔ Resumo ÓRFÃO (sem torneio) é APAGADO, não ignorado: o gatilho já apaga o derivado quando
 * o torneio some, e um órfão ignorado guarda o e-mail para sempre.
 *
 * ⛔ A verificação é por CAMINHO PROIBIDO, nunca por "parece e-mail": nome de torneio, local e
 * identidade podem legitimamente conter "@", e reprovar por aparência pararia o conserto sem
 * haver vazamento. [[project_email_no_doc_publico]]
 *
 *   node reprocessar-resumos.js            # SECO: só conta
 *   node reprocessar-resumos.js --apply    # grava
 */
const CAMPOS_PROIBIDOS = ['organizerEmail', 'creatorEmail', 'adminEmails'];

/** Caminhos proibidos presentes num resumo. Vazio = limpo. */
function caminhosProibidos(resumo) {
  const achados = [];
  if (!resumo || typeof resumo !== 'object') return achados;
  CAMPOS_PROIBIDOS.forEach((k) => { if (resumo[k] !== undefined) achados.push(k); });
  const polls = Array.isArray(resumo.polls) ? resumo.polls : [];
  polls.forEach((poll, i) => {
    const mapa = (poll && poll.votes && typeof poll.votes === 'object') ? poll.votes : null;
    const n = mapa ? Object.keys(mapa).length : 0;
    if (n) achados.push('polls[' + i + '].votes (' + n + ' chave(s))');
  });
  return achados;
}

/**
 * Reprocessa UM torneio. PURA no que importa: leitor, montador, construtor e escritor entram
 * por parâmetro, então o teste exercita o caminho de verdade sem tocar rede.
 * Devolve { acao: 'limpo'|'gravado'|'apagado'|'abortado', motivo?, antes, depois }.
 */
async function reprocessarUm(id, portas) {
  const { lerRaiz, lerResumo, lerColecao, montar, construir, gravar, apagar, apply } = portas;
  const resumoAtual = await lerResumo(id);
  const antes = caminhosProibidos(resumoAtual);

  const raiz = await lerRaiz(id);
  if (!raiz) {
    /* Órfão: o torneio não existe mais. Ignorar guardaria o e-mail para sempre. */
    if (!antes.length) return { acao: 'limpo', antes, depois: antes, orfao: true };
    if (apply) await apagar(id);
    return { acao: 'apagado', antes, depois: [], orfao: true };
  }
  if (!antes.length) return { acao: 'limpo', antes, depois: antes };

  let completo;
  try {
    completo = await montar(raiz, lerColecao);
  } catch (e) {
    /* ⛔ Resumo velho e VERDADEIRO é melhor que resumo novo e vazio — é a mesma regra que o
     * gatilho segue quando não consegue montar das subcoleções. */
    return { acao: 'abortado', motivo: 'montagem falhou: ' + (e && e.message), antes, depois: antes };
  }
  const novo = construir(completo, id);
  if (!novo) return { acao: 'abortado', motivo: 'buildSummary devolveu vazio', antes, depois: antes };

  const depois = caminhosProibidos(novo);
  if (depois.length) {
    return { acao: 'abortado', motivo: 'o resumo NOVO ainda tem caminho proibido: ' + depois.join(', '), antes, depois };
  }
  if (apply) await gravar(id, novo);
  return { acao: 'gravado', antes, depois };
}

module.exports = { caminhosProibidos, reprocessarUm, CAMPOS_PROIBIDOS };

/* ⛔ Ponto de entrada atrás de `require.main`: sem isto, um `require` num teste dispararia o
 * reprocessamento de verdade contra a base — o teste viraria a execução. */
if (require.main === module) {
  const admin = require('firebase-admin');
  const Split = require('./vendor/tournament-split-core.js');
  const Sum = require('./tournament-summary-core.js');
  const apply = process.argv.indexOf('--apply') !== -1;

  admin.initializeApp();
  const db = admin.firestore();

  (async () => {
    const ids = new Set();
    const [tSnap, rSnap] = await Promise.all([
      db.collection('tournaments').select().get(),
      db.collection('tournaments_summary').select().get()
    ]);
    tSnap.forEach((d) => ids.add(d.id));
    rSnap.forEach((d) => ids.add(d.id));
    console.log((apply ? '▸ APLICANDO' : '▸ SECO (nada será gravado)') + ' — ' + ids.size + ' id(s)');

    const conta = { limpo: 0, gravado: 0, apagado: 0, abortado: 0 };
    const problemas = [];
    for (const id of ids) {
      try {
        /* Uma transação por torneio: todas as leituras antes de qualquer escrita. */
        const r = await db.runTransaction(async (tx) => {
          return reprocessarUm(id, {
            apply: apply,
            lerRaiz: async () => { const d = await tx.get(db.collection('tournaments').doc(id)); return d.exists ? d.data() : null; },
            lerResumo: async () => { const d = await tx.get(db.collection('tournaments_summary').doc(id)); return d.exists ? d.data() : null; },
            lerColecao: async (nome) => {
              const qs = await tx.get(db.collection('tournaments').doc(id).collection(nome));
              return qs.docs.map((d) => Object.assign({ id: d.id }, d.data()));
            },
            montar: (raiz, lerColecao) => Split.montarDoBanco(JSON.parse(JSON.stringify(raiz)), lerColecao),
            construir: (t, tid) => Sum.buildSummary(t, tid, {}),
            gravar: async (tid, novo) => { tx.set(db.collection('tournaments_summary').doc(tid), novo); },
            apagar: async (tid) => { tx.delete(db.collection('tournaments_summary').doc(tid)); }
          });
        });
        conta[r.acao] = (conta[r.acao] || 0) + 1;
        if (r.acao === 'abortado') problemas.push(id + ': ' + r.motivo);
        if (r.antes.length) console.log('  · ' + id + ' → ' + r.acao + ' (tinha: ' + r.antes.join(', ') + ')');
      } catch (e) {
        /* ⛔ Aborta na primeira escrita que falhar, em vez de seguir e dizer que deu certo
         * pela metade. */
        console.error('✗ ' + id + ': ' + (e && e.message));
        process.exit(1);
      }
    }
    console.log('\n  limpos: ' + conta.limpo + ' · gravados: ' + conta.gravado
      + ' · órfãos apagados: ' + conta.apagado + ' · abortados: ' + conta.abortado);
    if (problemas.length) { problemas.forEach((p) => console.error('  ⛔ ' + p)); process.exit(1); }
    if (!apply) { console.log('\n  (seco — rode com --apply para gravar)'); return; }
    /* Verificação final: ninguém pode sobrar com caminho proibido. */
    const fim = await db.collection('tournaments_summary').get();
    let sobraram = 0;
    fim.forEach((d) => { if (caminhosProibidos(d.data()).length) sobraram++; });
    console.log('  conferência final: ' + sobraram + ' resumo(s) ainda com caminho proibido');
    if (sobraram) process.exit(1);
    console.log('✓ nenhum resumo público carrega mais e-mail do organizador nem mapa de votos');
  })().catch((e) => { console.error(e); process.exit(1); });
}
