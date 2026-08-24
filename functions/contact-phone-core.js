'use strict';
/*
 * contact-phone-core.js — CAMADA 3: O CELULAR REGISTRADO PELO ORGANIZADOR (puro).
 *
 * ─── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
 * 20/ago/2026, caso Leila Arida. Ela pediu o código de verificação, o Identity
 * Toolkit devolveu 200 (SMS entregue à operadora) e o SMS nunca chegou no aparelho.
 * Sem uma saída, ela ficava PRA SEMPRE fora da campanha de celular da Confra.
 *
 * A primeira ideia — deixar salvar o número sem verificar — foi DERRUBADA pelo dono,
 * com dois argumentos que estão certos:
 *   _"e se a pessoa colocar o numero de outro? sequestra o numero do outro para
 *     contatos. e se errar a digitação, ninguem recebe nada e acha que esta tudo bem"_
 * Número não verificado, auto-declarado e anônimo não vale nada: pode ser de terceiro
 * e pode ser digitação errada — nos dois casos o campo preenchido é PIOR que o vazio,
 * porque parece resolvido.
 *
 * ⭐ O QUE MUDA AQUI É A PROCEDÊNCIA, NÃO A EXIGÊNCIA. O organizador — que já falou com
 * a pessoa, e cujo nome fica gravado no dado — registra o contato. A diferença entre um
 * número anônimo auto-declarado e um número com o uid de quem o colocou é toda a
 * diferença: existe alguém responsável, e a pessoa é NOTIFICADA de que aconteceu.
 *
 * ⛔ ESTE NÚMERO NUNCA É IDENTIDADE. `phoneSource: 'organizer'` é o discriminador único
 * (não existe `phoneVerified`; inventá-lo criaria duas fontes de verdade e exigiria
 * backfill nas 65 contas que já têm celular verificado). Quem consulta telefone pra
 * DECIDIR identidade — recuperação de senha, dedup de conta, fusão — tem que passar por
 * isIdentityPhone() e ignorar o que veio do organizador. Sem isso, um erro de digitação
 * do organizador manda SMS de recuperação de conta pro celular de um estranho.
 *
 * Ver [[project_phone_gate_and_sms_infra]] e [[project_cobranca_de_celular_no_perfil]].
 */

const { computeAdminUids } = require('./cohost-core');
const { computeMemberUids } = require('./enroll-core');

/* Telefone que PROVA identidade: existe e NÃO veio do organizador. Ausência de
 * `phoneSource` = verificado por SMS (é o estado de todas as contas anteriores a esta
 * camada) — o default tem que ser o SEGURO pro dado velho, e aqui o seguro é "vale". */
function isIdentityPhone(profile) {
  const ph = String((profile && profile.phone) || '').replace(/\D/g, '');
  if (ph.length < 8) return false;
  return String((profile && profile.phoneSource) || '') !== 'organizer';
}

/* Telefone pra CONTATO: serve verificado ou registrado pelo organizador. É o que a
 * campanha da Confra e o botão de wa.me querem. */
function contactPhoneOf(profile) {
  const ph = String((profile && profile.phone) || '');
  return ph.replace(/\D/g, '').length >= 8 ? ph : '';
}

/* Normaliza pra E.164 COM '+' — o formato já gravado em users/{uid}.phone
 * (ex.: "+5511999707047"). Devolve '' quando não dá pra afirmar que é número. */
function toE164(raw, country) {
  const bruto = String(raw == null ? '' : raw).trim();
  const temMais = bruto.charAt(0) === '+';
  const d = bruto.replace(/\D/g, '');
  const cc = String(country || '55').replace(/\D/g, '') || '55';
  if (!d) return '';
  // ⭐ 2.1: o DDI passou a ser ESCOLHIDO na tela (ordem do dono, 22/ago: "tem que poder
  // escolher o DDI como em qualquer outra situação de telefone"). Antes esta função exigia
  // 10 ou 11 dígitos — BR-shaped — e Portugal (9), Chile (9) ou Espanha (9) voltavam
  // 'numero-invalido' por mais certos que estivessem.
  //
  // ⚠️ O SINAL de "já tem DDI" é o '+'. Deduzir por prefixo seria uma armadilha: o DDD 55
  // existe (Santa Maria/RS), então 55987654321 é um celular NACIONAL de 11 dígitos, não um
  // número já com o DDI 55 colado. Só a regra legada de 12/13 dígitos em BR fica, porque é
  // como o dado antigo chegava aqui.
  if (temMais) return (d.length >= 8 && d.length <= 15) ? '+' + d : '';
  if (cc === '55' && (d.length === 12 || d.length === 13) && d.indexOf('55') === 0) return '+' + d;
  if (d.length < 6 || d.length > 14) return '';
  const cheio = cc + d;
  return cheio.length <= 15 ? '+' + cheio : '';
}


/* ── A DECISÃO ──────────────────────────────────────────────────────────────
 * Devolve { ok:false, reason } ou { ok:true, update, phone }. A ordem das recusas é a
 * ordem do que dói errar. */
function computeSetContactPhone(input) {
  const inp = input || {};
  const t = inp.tournament;
  const callerUid = String(inp.callerUid || '');
  const targetUid = String(inp.targetUid || '');
  const nowIso = inp.nowIso || new Date().toISOString();

  if (!t) return { ok: false, reason: 'torneio-inexistente' };
  if (!callerUid) return { ok: false, reason: 'sem-login' };
  if (!targetUid) return { ok: false, reason: 'sem-alvo' };

  // Organizador OU co-organizador — mesmo poder, decisão já canônica do projeto.
  if (computeAdminUids(t).indexOf(callerUid) === -1) {
    return { ok: false, reason: 'nao-e-organizador' };
  }
  // Só quem está no elenco DESTE torneio. Sem isto, ser organizador de qualquer
  // torneio viraria licença pra escrever telefone no perfil de qualquer pessoa.
  if (computeMemberUids(t).indexOf(targetUid) === -1) {
    return { ok: false, reason: 'nao-esta-no-elenco' };
  }
  // O organizador registrando o PRÓPRIO número burlaria a verificação pra si mesmo —
  // e o próprio perfil dele tem o caminho certo, com SMS.
  if (targetUid === callerUid) return { ok: false, reason: 'use-o-proprio-perfil' };

  const phone = toE164(inp.phone, inp.country);
  if (!phone) return { ok: false, reason: 'numero-invalido' };

  // ⛔ NUNCA por cima de um número VERIFICADO. Quem provou posse do próprio número
  // manda nele; organizador não sobrescreve pessoa. Corrigir o que o PRÓPRIO
  // organizador registrou antes, sim — é conserto de digitação, não sequestro.
  const alvo = inp.targetProfile || {};
  if (isIdentityPhone(alvo)) return { ok: false, reason: 'ja-tem-verificado' };

  if (contactPhoneOf(alvo) === phone) return { ok: false, reason: 'sem-mudanca' };

  return {
    ok: true,
    phone: phone,
    anterior: contactPhoneOf(alvo) || '',
    update: {
      phone: phone,
      phoneCountry: String(inp.country || '55').replace(/\D/g, '') || '55',
      phoneSource: 'organizer',
      phoneSetBy: callerUid,
      phoneSetAt: nowIso,
      updatedAt: nowIso,
    },
  };
}

/* Texto da notificação pra pessoa. Ela PRECISA saber que alguém colocou um telefone no
 * perfil dela — é o que separa "registro com procedência" de "escreveram no meu cadastro
 * sem me avisar", e é a chance dela corrigir se estiver errado. */
function buildContactPhoneNotice(input) {
  const inp = input || {};
  const orgNome = String(inp.organizerName || 'O organizador').trim();
  const torneio = String(inp.tournamentName || '').trim();
  const mascara = maskTail(inp.phone);
  return {
    type: 'contact_phone_set',
    title: '📱 Seu celular foi registrado',
    message: orgNome + ' registrou seu celular ' + mascara + ' no seu perfil'
      + (torneio ? ' para o torneio "' + torneio + '"' : '') + '.\n'
      + 'Ele serve só para CONTATO. Se não for seu, ou se quiser usá-lo para entrar no app, '
      + 'abra seu perfil e confirme por SMS.',
    createdAt: inp.nowIso || new Date().toISOString(),
    read: false,
  };
}

/* Últimos 4 dígitos. A notificação vai pra própria pessoa, mas notificação é lida em
 * cima de mesa, no ônibus, com gente do lado — número inteiro ali não paga nada. */
function maskTail(e164) {
  const d = String(e164 || '').replace(/\D/g, '');
  return d.length >= 4 ? '****-' + d.slice(-4) : '';
}

/* ── LETZPLAY PELO ORGANIZADOR (2.0.50) ─────────────────────────────────────
 * Ordem do dono (24/ago/2026): _"no botao do contato que o organizador pode colocar o
 * celular da pessoa, vamos permitir que ele coloque tambem o letzplay da pessoa. o
 * letzplay é publico e todos podem consultar."_
 *
 * MESMA arquitetura de procedência do celular: quem registra é o organizador DESTE
 * torneio, o uid dele fica gravado (`letzplaySetBy` + `letzplaySource:'organizer'`) e a
 * pessoa é NOTIFICADA. E o mesmo limite: @ que a PRÓPRIA pessoa indicou no perfil
 * (`letzplaySource` ausente ou 'self') não se sobrescreve — organizador registra o de
 * quem não tem, não corrige o de quem tem. Diferença pro celular: aqui não há
 * verificação por SMS — o dado é público no letzplay, a "prova" é o perfil público. */
function normalizeLzHandle(raw) {
  const h = String(raw == null ? '' : raw).trim().replace(/^@+/, '');
  return /^[A-Za-z0-9_.\-]{2,32}$/.test(h) ? h : '';
}

function computeSetContactLetzplay(input) {
  const inp = input || {};
  const t = inp.tournament;
  const callerUid = String(inp.callerUid || '');
  const targetUid = String(inp.targetUid || '');
  const nowIso = inp.nowIso || new Date().toISOString();

  if (!t) return { ok: false, reason: 'torneio-inexistente' };
  if (!callerUid) return { ok: false, reason: 'sem-login' };
  if (!targetUid) return { ok: false, reason: 'sem-alvo' };
  if (computeAdminUids(t).indexOf(callerUid) === -1) return { ok: false, reason: 'nao-e-organizador' };
  if (computeMemberUids(t).indexOf(targetUid) === -1) return { ok: false, reason: 'nao-esta-no-elenco' };
  if (targetUid === callerUid) return { ok: false, reason: 'use-o-proprio-perfil' };

  const handle = normalizeLzHandle(inp.handle);
  if (!handle) return { ok: false, reason: 'handle-invalido' };

  const alvo = inp.targetProfile || {};
  const atual = String(alvo.letzplayHandle || '');
  // @ da própria pessoa (ausência de letzplaySource = ela indicou, estado de todo dado
  // anterior a esta camada — o default seguro é o que protege o dado velho).
  if (atual && String(alvo.letzplaySource || '') !== 'organizer') {
    return { ok: false, reason: 'ja-tem-proprio' };
  }
  if (atual.toLowerCase() === handle.toLowerCase()) return { ok: false, reason: 'sem-mudanca' };

  return {
    ok: true,
    handle: handle,
    anterior: atual,
    update: {
      letzplayHandle: handle,
      letzplaySource: 'organizer',
      letzplaySetBy: callerUid,
      letzplaySetAt: nowIso,
      updatedAt: nowIso,
    },
  };
}

function buildContactLetzplayNotice(input) {
  const inp = input || {};
  const orgNome = String(inp.organizerName || 'O organizador').trim();
  const torneio = String(inp.tournamentName || '').trim();
  return {
    type: 'contact_letzplay_set',
    title: '🎾 Seu letzplay foi registrado',
    message: orgNome + ' registrou @' + String(inp.handle || '') + ' como sua conta letzplay'
      + (torneio ? ' no torneio "' + torneio + '"' : '') + '.\n'
      + 'O histórico do letzplay é público. Se o @ não for seu, corrija no seu perfil.',
    createdAt: inp.nowIso || new Date().toISOString(),
    read: false,
  };
}

const RECUSA_HUMANA = {
  'torneio-inexistente': 'Torneio não encontrado.',
  'sem-login': 'Entre novamente.',
  'sem-alvo': 'Participante não informado.',
  'nao-e-organizador': 'Só o organizador ou um co-organizador pode registrar contato.',
  'nao-esta-no-elenco': 'Essa pessoa não está inscrita neste torneio.',
  'use-o-proprio-perfil': 'Para o seu próprio celular, use o seu perfil — lá o número é verificado por SMS.',
  'numero-invalido': 'Número inválido. Use DDD + 9 dígitos.',
  'ja-tem-verificado': 'Essa pessoa já verificou um celular por SMS. Só ela pode trocá-lo.',
  'sem-mudanca': 'Esse já é o dado registrado.',
  'handle-invalido': 'Conta letzplay inválida. Use o @ do perfil público (letras, números, ponto, hífen ou _).',
  'ja-tem-proprio': 'Essa pessoa já indicou a própria conta letzplay no perfil. Só ela pode trocá-la.',
};

module.exports = {
  isIdentityPhone, contactPhoneOf, toE164, computeSetContactPhone,
  buildContactPhoneNotice, maskTail, RECUSA_HUMANA,
  normalizeLzHandle, computeSetContactLetzplay, buildContactLetzplayNotice,
};
