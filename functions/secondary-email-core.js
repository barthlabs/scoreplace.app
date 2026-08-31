/* secondary-email-core.js — DECISÕES do e-mail secundário, puras e testáveis  (2.1.65)
 *
 * ⛔ O QUE ISTO SUBSTITUI, e por que era grave. Até a 2.1.64 o fluxo inteiro rodava no
 * CLIENTE (js/views/auth.js):
 *   · o TOKEN nascia com `Math.random()` — não é CSPRNG, é previsível o bastante para ser
 *     adivinhado (auth.js:9605, duas chamadas de Math.random + Date.now em base36);
 *   · o token ia CRU pro banco como ID do documento, e `firestore.rules:735` dava
 *     `allow read: if true` — ou seja, qualquer um podia LISTAR/LER a coleção e colher
 *     tokens válidos de outras pessoas;
 *   · `allow update: if true` deixava QUALQUER UM (inclusive anônimo) marcar `verified`;
 *   · a vinculação era um `update` do cliente em `users/{ownerUid}.linkedEmails`.
 *
 * ⚠️ POR QUE ISSO NÃO ERA "SÓ" UM E-MAIL A MAIS NO PERFIL: `linkedEmails` é PROVA DE POSSE
 * de conta. `functions/index.js:5967` aceita `via: "email-vinculado"` como prova numa fusão,
 * e `_uidByProfileEmail` (index.js:4282) resolve LOGIN por ele. Vincular um e-mail é mexer
 * em quem entra na conta.
 *
 * ⭐ AGORA: token nasce no servidor com CSPRNG, o banco guarda só o HASH (o id do documento
 * É o hash), e a confirmação é uma transação que marca uso e vincula ao `ownerUid` gravado
 * no pedido — nunca ao uid de quem clica.
 *
 * ⛔ O QUE ESTE NÚCLEO **NÃO** FAZ, de propósito: bloquear e-mail já vinculado a OUTRA conta.
 * Varri o repositório e essa regra NÃO EXISTE hoje em lugar nenhum — nem no cliente
 * (auth.js:9588-9597 compara só com o e-mail principal e a lista DO PRÓPRIO usuário), nem em
 * Function alguma. Inventá-la aqui seria criar comportamento novo escondido numa migração, e
 * ela tem consequência real: dois membros de uma família que usam a mesma caixa deixariam de
 * conseguir vincular. Fica como está, e o controle que sustenta o fluxo é outro e continua
 * de pé — o link só chega em quem CONTROLA a caixa de entrada.
 *
 * Puro: não lê nem escreve nada. Quem faz I/O é functions/index.js.
 */
'use strict';
const crypto = require('crypto');

const PRAZO_MS = 24 * 60 * 60 * 1000;      // 24h, como o fluxo antigo prometia no e-mail
const COOLDOWN_MS = 2 * 60 * 1000;         // 2 min entre pedidos do MESMO par (uid, e-mail)

const normalizaEmail = (raw) => String(raw == null ? '' : raw).trim().toLowerCase();
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/* ⭐ CSPRNG, não Math.random. 32 bytes = 256 bits: adivinhar não é caminho. */
function novoToken() { return crypto.randomBytes(32).toString('base64url'); }

/* ⛔ O BANCO NUNCA VÊ O TOKEN. O id do documento é o hash; quem tem o link tem o token, e
 * quem tem o banco não tem como voltar dele pro link. Era exatamente o contrário antes. */
function hashToken(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }

/* Chave do cooldown: por PESSOA e por E-MAIL. Global por pessoa bloquearia vincular dois
 * endereços em seguida; global por e-mail deixaria um terceiro travar o pedido de outro. */
function chaveDeThrottle(uid, emailNorm) {
  return crypto.createHash('sha256').update(String(uid) + ':' + emailNorm).digest('hex');
}

/**
 * Decide se o PEDIDO pode seguir. `perfil` é o doc de users/{uid} (ou {}).
 * ⚠️ Preserva exatamente as validações que o cliente já fazia — formato, e-mail principal e
 * já-vinculado —, agora do lado de cá, onde não dá pra pular.
 */
function decidePedido(args) {
  const a = args || {};
  const email = normalizaEmail(a.email);
  if (!email || !emailValido(email)) return { ok: false, motivo: 'invalido' };
  const perfil = a.perfil || {};
  const principal = normalizaEmail(perfil.email || a.emailDoToken || '');
  if (principal && email === principal) return { ok: false, motivo: 'principal' };
  const linked = Array.isArray(perfil.linkedEmails) ? perfil.linkedEmails.map(normalizaEmail) : [];
  if (linked.indexOf(email) !== -1) return { ok: false, motivo: 'ja-vinculado' };
  /* ⛔ REENVIO EM RAJADA é abuso de caixa alheia: o endereço candidato pode ser de outra
   * pessoa, e sem freio o formulário vira ferramenta de flood. */
  const ultimo = Number(a.ultimoEnvioMs || 0);
  const agora = Number(a.agora || 0);
  if (ultimo && agora && (agora - ultimo) < COOLDOWN_MS) {
    return { ok: false, motivo: 'cooldown', faltamMs: COOLDOWN_MS - (agora - ultimo) };
  }
  return { ok: true, email: email };
}

/** O registro gravado em emailVerifications/{hash}. ⛔ Sem o token. */
function novoRegistro(args) {
  const a = args || {};
  const agora = Number(a.agora || Date.now());
  return {
    ownerUid: String(a.uid),
    emailToVerify: normalizaEmail(a.email),
    createdAt: new Date(agora).toISOString(),
    expiresAt: new Date(agora + PRAZO_MS).toISOString(),
    used: false,
    origem: 'requestSecondaryEmail'
  };
}

/**
 * Decide a CONFIRMAÇÃO a partir do registro lido. `reg` null = token não existe.
 * ⚠️ `used` é o campo novo; `verified` é o do fluxo antigo. Registros criados antes desta
 * versão têm `verified` e não `used` — aceitar os dois evita invalidar link já enviado a
 * alguém que ainda não clicou. [[feedback_dont_break_working_features]]
 */
function decideConfirmacao(reg, agoraMs) {
  if (!reg) return { ok: false, motivo: 'invalido' };
  if (reg.used === true || reg.verified === true) return { ok: false, motivo: 'usado' };
  const exp = Date.parse(reg.expiresAt || '');
  if (!exp || !isFinite(exp)) return { ok: false, motivo: 'invalido' };
  if (Number(agoraMs || Date.now()) > exp) return { ok: false, motivo: 'expirado' };
  const ownerUid = String(reg.ownerUid || '');
  const email = normalizaEmail(reg.emailToVerify || '');
  if (!ownerUid || !email) return { ok: false, motivo: 'invalido' };
  /* ⭐ O DONO SAI DO REGISTRO, nunca de quem chama. É isto que impede alguém logado em outra
   * conta clicar no link e levar o e-mail pra conta dele. */
  return { ok: true, ownerUid: ownerUid, email: email };
}

/** O HTML do e-mail é FIXO e mora aqui — o cliente não fornece assunto, corpo nem destino. */
function montaEmail(emailCandidato, urlConfirmacao) {
  const alvo = normalizaEmail(emailCandidato);
  const url = String(urlConfirmacao || '');
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return {
    to: [alvo],
    message: {
      subject: 'Confirme seu e-mail no scoreplace.app',
      html:
        '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px;">' +
          '<div style="text-align:center;margin-bottom:24px;">' +
            '<img src="https://scoreplace.app/icons/icon-192.svg" width="48" height="48" style="border-radius:10px;">' +
            '<h2 style="color:#fbbf24;margin:12px 0 4px;">scoreplace.app</h2>' +
          '</div>' +
          '<p style="font-size:1rem;margin-bottom:8px;">Olá!</p>' +
          '<p style="color:#94a3b8;margin-bottom:20px;">Clique no botão abaixo para confirmar que <b style="color:#e2e8f0;">' + esc(alvo) + '</b> é seu e-mail e vinculá-lo à sua conta.</p>' +
          '<div style="text-align:center;margin:24px 0;">' +
            '<a href="' + esc(url) + '" style="background:#6366f1;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;display:inline-block;">Confirmar e-mail</a>' +
          '</div>' +
          '<p style="font-size:0.8rem;color:#64748b;text-align:center;">Este link expira em 24 horas. Se você não solicitou isso, ignore este e-mail.</p>' +
        '</div>'
    },
    createdAt: new Date().toISOString()
  };
}

function urlDeConfirmacao(token) {
  return 'https://scoreplace.app/?verify_email=' + encodeURIComponent(String(token));
}

module.exports = {
  PRAZO_MS, COOLDOWN_MS,
  normalizaEmail, emailValido, novoToken, hashToken, chaveDeThrottle,
  decidePedido, novoRegistro, decideConfirmacao, montaEmail, urlDeConfirmacao
};
