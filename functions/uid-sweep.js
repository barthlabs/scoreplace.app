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
function isPlainContainer(v) {
  if (v === null || typeof v !== "object") return false;
  if (Array.isArray(v)) return true;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
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
      const nk = (k === from) ? (changed = true, to) : k;
      const nv = walk(v[k]);
      // chave-uid colidindo: o valor do sobrevivente (`to`) prevalece
      if (nk in out && k === from) continue;
      if (nk === to && k === from && (to in v)) continue;
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

module.exports = { remapUid, findUidPaths, isPlainContainer };
