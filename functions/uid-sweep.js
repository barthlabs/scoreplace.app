// scoreplace.app — VARREDURA CANÔNICA DE UID (módulo puro, sem side effects)
//
// PROBLEMA QUE ISTO RESOLVE
// A identidade de uma pessoa é o uid, e ele aparece espalhado pelo doc: slot de inscrição
// (uid/p1Uid/p2Uid/sub-participants), array de query (memberUids), dono (creatorUid/
// organizerUid/adminUids), CHAVE de mapa por-pessoa (checkedIn/absent/vips/sitOutHistory/
// woHistory/ligaGhosts), voto de enquete (opinionPolls[].votes/polls[].votes), slots de jogo
// (p1Uid/p2Uid/team1Uids/team2Uids/winnerUid(s)), grupos (playersUids), convites, amigos…
//
// Merge e exclusão listavam esses campos À MÃO — e a lista SEMPRE ficou incompleta:
//   • jul/2026: o merge não via membro de DUPLA (p1Uid/p2Uid) → uid órfão
//   • jul/2026: o merge não via mapa por uid → a pessoa perdia check-in e voto, em silêncio
//   • jul/2026: a exclusão de conta só via o slot solo → inscrição órfã
// Cada um foi achado de forma reativa, um de cada vez, sempre depois do estrago. Campo novo
// com uid nasce fora da lista e ninguém percebe até alguém sumir de um torneio.
//
// REGRA DO DONO (jul/2026): "onde estiver o uid, merja ou exclui. TUDO." E: "o ideal é
// canonizar o merge e o excluir pra que sempre que houver mudança no sistema criando/
// excluindo campo isso vá pro cânone, que vai saber onde procurar o uid e trocar/excluir."
//
// Daí este módulo: a varredura é GENÉRICA (percorre o doc inteiro e acha o uid onde ele
// estiver), então campo novo já nasce coberto — sem ninguém lembrar de atualizar lista.

// Valores que NÃO são JSON puro (Timestamp, GeoPoint, DocumentReference, Buffer…) precisam
// passar INTACTOS: um deep-walk ingênuo os converteria em objeto plano e corromperia o campo
// silenciosamente (o save aceita, o dado apodrece). Detecta por construtor não-plain.
//
// CROSS-REALM: `proto === Object.prototype` sozinho é frágil — um objeto criado noutro realm
// (vm.createContext, worker, outro módulo com seu próprio globals) tem um Object.prototype
// DIFERENTE, e o check reprovaria um objeto plano legítimo. Isso não é teórico: pegou no
// E2E desta função, onde `Object.assign({}, doc)` feito dentro de um vm sandbox era tratado
// como Timestamp e devolvido intacto — o purge silenciosamente não limpava nada. Na CF real
// roda tudo num realm só, mas um check de identidade não pode depender disso: se ele errar
// pra MENOS, corrompe Timestamp; pra MAIS, deixa dado sujo passar. Por isso o fallback
// estrutural: proto cujo constructor se chama "Object" e que não herda de mais nada.
function isPlainContainer(v) {
  if (v === null || typeof v !== "object") return false;
  if (Array.isArray(v)) return true;
  const proto = Object.getPrototypeOf(v);
  if (proto === null || proto === Object.prototype) return true;
  // outro realm: reconhece um Object.prototype "estrangeiro" pela forma, não pela identidade
  return Object.getPrototypeOf(proto) === null &&
         !!proto.constructor && proto.constructor.name === "Object";
}

/**
 * Troca `from` → `to` em QUALQUER profundidade: valores string, itens de array e CHAVES de
 * mapa. Usado pelo merge — a troca é segura porque os dois uids são a mesma pessoa.
 *
 * - chave de mapa: se `to` já existe, o valor DELE prevalece (estado atual > estado velho)
 * - array: dedup depois da troca (se os dois uids estavam no mesmo array, vira um)
 * - não-plain (Timestamp etc.): devolvido por referência, intacto
 *
 * @returns {{ value: *, changed: boolean }} — `value` é uma CÓPIA quando muda algo
 */
function remapUid(node, from, to) {
  let changed = false;

  function walk(v) {
    if (typeof v === "string") {
      if (v === from) { changed = true; return to; }
      // ⚠️ uid EMBUTIDO em string maior (chave/valor COMPOSTO). Achado em produção 05/ago/2026:
      // `opponentHistory` do Confra guarda o par de adversários numa chave
      // `uid:<A>|||uid:<B>` — e a troca por igualdade exata não a enxergava. Resultado: depois
      // da fusão o motor "esquecia" que a pessoa já tinha enfrentado aquelas 3, e podia
      // repetir o confronto. Substituir é seguro porque um uid é token de 28 caracteres de
      // alta entropia: ele não aparece por acaso dentro de outro texto.
      if (v.indexOf(from) !== -1) { changed = true; return v.split(from).join(to); }
      return v;
    }
    if (!isPlainContainer(v)) return v;          // Timestamp/GeoPoint/Ref: intactos

    if (Array.isArray(v)) {
      const out = v.map(walk);
      // dedup só de strings (uids repetidos após a troca); objetos ficam como estão
      const strs = out.filter((x) => typeof x === "string");
      if (strs.length !== new Set(strs).size) {
        const seen = new Set();
        const ded = out.filter((x) => {
          if (typeof x !== "string") return true;
          if (seen.has(x)) { changed = true; return false; }
          seen.add(x); return true;
        });
        return ded;
      }
      return out;
    }

    const out = {};
    for (const k of Object.keys(v)) {
      // chave exata OU composta (`uid:<A>|||uid:<B>` do opponentHistory)
      const nk = (k === from) ? to : (k.indexOf(from) !== -1 ? k.split(from).join(to) : k);
      if (nk !== k) changed = true;
      const nv = walk(v[k]);
      // chave remapeada colidindo com uma que JÁ existe: o valor do sobrevivente prevalece
      // (estado atual > estado da conta absorvida)
      if (nk !== k && (nk in out || Object.prototype.hasOwnProperty.call(v, nk))) continue;
      out[nk] = nv;
    }
    return out;
  }

  const value = walk(node);
  return { value, changed };
}

/**
 * Acha TODOS os caminhos onde `uid` aparece — para auditoria/dry-run e para a exclusão
 * decidir o que fazer em cada contexto. Não muda nada.
 * @returns {string[]} ex.: ["participants[3].p2Uid", "checkedIn.{key}", "opinionPolls[0].votes.{key}"]
 */
function findUidPaths(node, uid) {
  const paths = [];
  (function walk(v, path) {
    if (typeof v === "string") { if (v === uid) paths.push(path || "(raiz)"); return; }
    if (!isPlainContainer(v)) return;
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, path + "[" + i + "]"));
    for (const k of Object.keys(v)) {
      if (k === uid) paths.push((path ? path + "." : "") + "{key}");
      walk(v[k], (path ? path + "." : "") + k);
    }
  })(node, "");
  return paths;
}

/* ─── ARRAYS PAREADOS: nome[i] ↔ uid[i] ──────────────────────────────────────
 * FALHA REAL (Confra, 08/ago/2026): a exclusão de conta da Denise Mamesso rodou
 * `team1Uids.filter(x => x !== uid)` — tirou o uid e DEIXOU o nome em `team1`.
 * Resultado: 4 nomes / 3 uids no grupo, e o app parou de reconhecer o grupo dela.
 * Ela era a ÚLTIMA do array, então os outros ainda casavam por sorte. Se fosse a
 * PRIMEIRA, o filter teria deslocado tudo e CADA NOME passaria a apontar pro uid
 * do vizinho — placar e identidade do grupo inteiro trocados.
 *
 * REGRA: array de uids NUNCA é filtrado sozinho. Ou some junto com o nome do
 * MESMO índice, ou os dois ficam. Ver [[project_uid_identity_canon_locked]].
 */
const PARES_NOME_UID = { playersUids: "players", team1Uids: "team1", team2Uids: "team2" };

/* Índices a remover de um objeto que tem os dois arrays. Devolve
 * { <chaveUids>: [i,...] } — vazio quando não há par ou o uid não está lá. */
function paresParaRemover(obj, uid) {
  const out = {};
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const kUid of Object.keys(PARES_NOME_UID)) {
    const kNome = PARES_NOME_UID[kUid];
    const uids = obj[kUid];
    if (!Array.isArray(uids)) continue;
    const idx = [];
    uids.forEach((u, i) => { if (u === uid) idx.push(i); });
    if (!idx.length) continue;
    // Só remove em PAR quando os dois arrays existem e estão alinhados. Fora
    // disso (folga só-uid, doc legado) mexer às cegas piora: deixa como está.
    const nomes = obj[kNome];
    if (!Array.isArray(nomes) || nomes.length !== uids.length) continue;
    out[kUid] = idx;
  }
  return out;
}

/* Aplica a remoção pareada: devolve {<chave>: arrayNovo} pros DOIS lados. */
function removerPares(obj, uid) {
  const alvo = paresParaRemover(obj, uid);
  const novo = {};
  for (const kUid of Object.keys(alvo)) {
    const drop = new Set(alvo[kUid]);
    const kNome = PARES_NOME_UID[kUid];
    novo[kUid] = obj[kUid].filter((_, i) => !drop.has(i));
    novo[kNome] = obj[kNome].filter((_, i) => !drop.has(i));
  }
  return novo;
}

module.exports = { remapUid, findUidPaths, isPlainContainer, PARES_NOME_UID, paresParaRemover, removerPares };
