'use strict';

/*
 * Enumeração de PARES de conta duplicada dentro do elenco de um torneio — para o
 * ORGANIZADOR ver.
 *
 * ⛔ O DEFEITO QUE ISTO CONSERTA. A detecção de conta duplicada já existe e já pergunta
 * à própria pessoa. Mas `dupSuspect` só é lido em tela de ATLETA: quem tem as duas
 * inscrições lado a lado — o organizador — nunca é avisado. É por isso que a mesclagem
 * falhou em todos os incidentes: a única pessoa capaz de reconhecer as duas não sabe.
 *
 * ⛔ ISTO É SÓ LEITURA. Não funde, não pede fusão, não devolve UID. Fusão continua
 * exigindo prova de controle das duas contas ou decisão humana registrada.
 *
 * Núcleo PURO: não conhece Firestore, Auth nem rede. Quem lê é a Function.
 */

const _dup = require('./duplicate-person-core');
const _slots = require('./vendor/participant-identity');

/* ⛔ NÃO se enumeram dispensados. O "não sou eu" silencia a PERGUNTA para aquela pessoa;
 * ele não encerra o caso para o organizador, que é quem enxerga as duas inscrições. */

/* Mascaramento — o organizador reconhece sem receber o dado. */
function mascararEmail(email) {
  const s = String(email || '').trim();
  const at = s.indexOf('@');
  if (at < 1) return null;
  const nome = s.slice(0, at);
  const dominio = s.slice(at);
  const visivel = nome.slice(0, 1);
  return visivel + '•'.repeat(Math.max(2, nome.length - 1)) + dominio;
}

function mascararTelefone(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (d.length < 4) return null;
  return '•'.repeat(d.length - 4) + d.slice(-4);
}

/* ⭐ O ELENCO SAI DE SLOTS DE PESSOA, não de UIDs.
 *
 * `participantUids()` devolveria só quem tem conta — e o participante incluído pelo
 * organizador SEM conta (`manualParticipantId`), que é exceção prevista, sumiria da
 * contagem em silêncio. Aqui cada slot é contado: com UID vai para a análise; sem UID
 * vira "não medido", que APARECE na tela em vez de virar ausência.
 *
 * ⚠️ `source` serve para auditoria e deduplicação — nunca para apagar alguém da conta.
 * Nome manual entra venha de onde vier; o que o coletor já descarta (UID órfão, resíduo)
 * continua descartado.
 */
function montarElenco(entradas) {
  const uids = [];
  const vistos = new Set();
  let unmeasuredCount = 0;
  (entradas || []).forEach((entrada) => {
    const slots = _slots.participantSlots(entrada);
    slots.forEach((slot) => {
      if (!slot.uid) { unmeasuredCount++; return; }   // convidado sem conta: pessoa, não vaga
      if (vistos.has(slot.uid)) return;
      vistos.add(slot.uid);
      uids.push(slot.uid);
    });
  });
  return { uids: uids, unmeasuredCount: unmeasuredCount };
}

/* A data da dispensa, sobre dado REAL.
 *
 * ⛔ A dispensa é gravada nos DOIS perfis por `Promise.all`: pode existir só de um lado
 * após falha parcial, e o formato legado (`dupDismissed`, array de uid) NÃO tem data.
 * Contrato: a MAIOR data válida dos dois lados; `null` no legado. Nunca se diz QUEM
 * respondeu — a pergunta do organizador é sobre o par, não sobre a pessoa.
 */
function dispensaDoPar(perfilA, perfilB, uidA, uidB) {
  const datas = [];
  let houve = false;
  const olhar = (perfil, alvo) => {
    if (!perfil) return;
    const legado = Array.isArray(perfil.dupDismissed) ? perfil.dupDismissed : [];
    if (legado.indexOf(alvo) !== -1) houve = true;
    const info = Array.isArray(perfil.dupDismissedInfo) ? perfil.dupDismissedInfo : [];
    info.forEach((registro) => {
      if (!registro || registro.uid !== alvo) return;
      houve = true;
      const t = Date.parse(registro.at || '');
      if (!isNaN(t)) datas.push(t);
    });
  };
  olhar(perfilA, uidB);
  olhar(perfilB, uidA);
  if (!houve) return { dispensado: false, dismissedAt: null };
  if (!datas.length) return { dispensado: true, dismissedAt: null };  // legado, sem data
  return { dispensado: true, dismissedAt: new Date(Math.max.apply(null, datas)).toISOString() };
}

/*
 * Enumera os pares. `pessoas` já vem com o adaptador aplicado:
 *   { uid, nome, telefone, telefoneProvado, email, letzplayHandle, perfil }
 *
 * ⛔ `telefoneProvado` e `email` são CREDENCIAL e vêm do Auth, não do perfil — quem monta
 * `pessoas` é quem garante isso. Aqui o núcleo confia no que recebe, porque misturar as
 * duas camadas foi exatamente o erro que o contrato desta leva fecha.
 *
 * ⛔ `rigor: 'torneio'` e `freqTokens` são OBRIGATÓRIOS: sem eles o comparador é mais fraco
 * que a detecção que já roda, e o organizador veria MENOS do que o app já sabe sozinho.
 */
function enumerarPares(input) {
  if (!input || !Array.isArray(input.pessoas)) throw new Error('pessoas é obrigatório');
  if (!input.freqTokens || typeof input.freqTokens !== 'object') {
    throw new Error('freqTokens é obrigatório — sem ele a enumeração acha menos que o detector');
  }
  const pessoas = input.pessoas;
  const opts = { rigor: 'torneio', freqTokens: input.freqTokens };
  const pares = [];
  for (let i = 0; i < pessoas.length; i++) {
    for (let j = i + 1; j < pessoas.length; j++) {
      const a = pessoas[i];
      const b = pessoas[j];
      const r = _dup.compararPessoa(a, b, opts);
      if (!r) continue;
      const disp = dispensaDoPar(a.perfil, b.perfil, a.uid, b.uid);
      pares.push({
        nomes: [a.nome || '', b.nome || ''],
        motivo: r.motivo,
        semelhanca: r.semelhanca || null,
        forca: _dup.forcaDoSinal(r.motivo, r.semelhanca),
        emailMascarado: mascararEmail(a.email) || mascararEmail(b.email) || null,
        telefoneMascarado: mascararTelefone(a.telefone) || mascararTelefone(b.telefone) || null,
        dispensado: disp.dispensado,
        dismissedAt: disp.dismissedAt,
      });
    }
  }
  // Mais forte primeiro: é a ordem em que o organizador quer olhar.
  pares.sort((x, y) => (y.forca - x.forca) || String(x.nomes[0]).localeCompare(String(y.nomes[0])));
  return pares;
}

module.exports = {
  montarElenco, enumerarPares, dispensaDoPar,
  mascararEmail, mascararTelefone,
};
