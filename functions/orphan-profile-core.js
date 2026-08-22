'use strict';
/*
 * orphan-profile-core.js — CONTA NO AUTH SEM PERFIL NO FIRESTORE (puro, sem I/O).
 *
 * O BURACO, MEDIDO em produção (22/ago/2026): 236 contas no Firebase Auth × 248
 * docs em `users/` → 2 contas SEM perfil, ambas Apple com e-mail oculto
 * (@privaterelay), ambas com `lastSignInTime == creationTime` — entraram uma vez
 * e nunca voltaram. Sem doc de perfil a pessoa NÃO EXISTE pro app: não aparece
 * na busca, não entra em lista de espera, não se inscreve, e o organizador vê
 * "Jogador sem perfil (XXXX)".
 *
 * POR QUE O CLIENTE NÃO BASTA: o doc só nasce se o navegador sobreviver ao
 * caminho inteiro depois do OAuth. As pendências de rede ganharam prazo e a
 * escrita ganhou espera/retry/Sentry (js/views/auth.js), mas se o Firestore
 * RECUSAR a escrita — ou a aba morrer no meio — não sobra ninguém pra tentar de
 * novo, porque essas pessoas não voltam. Reproduzido com o código REAL em
 * tests/apple-nao-deixa-conta-orfa.test.js: a escrita recusada continua deixando
 * a conta órfã, e é só isso que esta varredura existe pra cobrir.
 *
 * ⚠️ E TEM PRAZO DE VALIDADE: a `cleanupAbandonedAuth` APAGA do Auth toda conta
 * sem doc com mais de 30 dias. Órfã não consertada não fica órfã pra sempre —
 * vira conta deletada em silêncio.
 *
 * ⛔ A REGRA QUE NÃO PODE SER QUEBRADA (o desenho de v1.8.40): NÃO criar o doc de
 * quem tem entrada em `loginRedirects`. Esse doc é o que faz a CF
 * `resolveLoginRedirect` agir — ela só resgata quem NÃO tem perfil. Criar o
 * perfil pra essa pessoa a prende para sempre numa conta vazia, longe dos
 * torneios dela. Aqui isso é decidido com o Admin SDK lendo `loginRedirects`
 * direto, sem a ambiguidade que o cliente tem quando a callable não responde.
 *
 * ⛔ E-MAIL NÃO É NOME num login social: a pessoa nunca pediu pra publicar o
 * endereço dela na lista do organizador, e o e-mail oculto da Apple não
 * identifica ninguém. Mesma regra do cliente (_seedProfileFromAuth).
 *
 * PURO de propósito: quem lê/escreve é orphan-profile-run.js; a REGRA mora aqui e
 * é exercitada pelo teste com o CÓDIGO REAL.
 */

// Janela de carência: o cliente ainda pode estar terminando o login (a semente é
// gravada logo depois do resgate responder, mas há retries e rede lenta no meio).
var CARENCIA_MS = 15 * 60 * 1000;

var SOCIAL_PROVIDERS = ['apple.com', 'google.com', 'facebook.com'];
var PLACEHOLDER_EMAIL = /@phone\.scoreplace\.app$/i;
var NOMES_RUINS = ['usuário', 'usuario', 'user', 'teste', 'test', 'undefined', 'null', 'anon', 'anônimo', 'visitante'];

function isSocial(pid) {
  return SOCIAL_PROVIDERS.indexOf(String(pid || '').toLowerCase()) !== -1;
}
function emailReal(email) {
  var e = String(email || '').trim();
  if (!e || PLACEHOLDER_EMAIL.test(e)) return '';
  return e;
}
function nomeUtil(nome) {
  var n = String(nome || '').trim();
  if (!n) return '';
  if (NOMES_RUINS.indexOf(n.toLowerCase()) !== -1) return '';
  return n;
}

/* A semente: só o que veio do provedor. NADA que o gate de termos leia como
 * "uso passado" (friends/preferredSports/plan/…) — conta nova TEM que ver os
 * termos quando finalmente voltar. `createdAt` é o nascimento REAL da conta no
 * Auth, não a hora da varredura: carimbar "agora" faria a pessoa aparecer como
 * cadastro recente meses depois. */
function montarSemente(conta) {
  var pid = String((conta && conta.providerId) || '').toLowerCase();
  var email = emailReal(conta && conta.email);
  var nome = nomeUtil(conta && conta.displayName);
  if (!nome && email && !isSocial(pid)) nome = email;   // e-mail/senha e magic link: o endereço é o identificador digitado

  var nasceu = new Date(conta && conta.creationTimeMs ? conta.creationTimeMs : Date.now()).toISOString();
  var semente = {
    authProvider: pid || 'unknown',
    createdAt: nasceu,
    updatedAt: nasceu,
    profileCreatedBy: 'orphan-sweep',
  };
  if (email) {
    semente.email = email;
    semente.email_lower = email.toLowerCase();
    semente.notifyEmail = true;
  }
  if (nome) {
    semente.displayName = nome;
    // A BUSCA usa o campo _lower: sem ele a pessoa segue invisível, que é
    // metade do problema que esta varredura veio resolver.
    semente.displayName_lower = nome.toLowerCase();
  }
  if (conta && conta.phoneNumber) semente.phone = conta.phoneNumber;
  if (conta && conta.photoURL) semente.photoURL = conta.photoURL;
  return semente;
}

/* A DECISÃO, na ordem do que dói errar.
 *   conta            — {uid, email, phoneNumber, displayName, photoURL, providerId,
 *                       creationTimeMs}
 *   temPerfil        — o doc users/{uid} existe?
 *   donoDoRedirect   — uid dono da credencial em `loginRedirects` (ou null)
 *   agoraMs          — relógio injetado (testes)
 * → { acao: 'pular'|'criar', motivo, semente? }
 */
function decidir(conta, temPerfil, donoDoRedirect, agoraMs) {
  var agora = agoraMs == null ? Date.now() : agoraMs;
  if (!conta || !conta.uid) return { acao: 'pular', motivo: 'sem_uid' };
  if (temPerfil) return { acao: 'pular', motivo: 'ja_tem_perfil' };

  var nasceu = conta.creationTimeMs || 0;
  if (!nasceu) return { acao: 'pular', motivo: 'sem_data_de_criacao' };
  if ((agora - nasceu) < CARENCIA_MS) return { acao: 'pular', motivo: 'muito_recente' };

  // ⛔ o resgate de conta absorvida precisa que o doc NÃO exista
  if (donoDoRedirect && donoDoRedirect !== conta.uid) {
    return { acao: 'pular', motivo: 'resgate_pendente' };
  }

  return { acao: 'criar', motivo: 'orfa', semente: montarSemente(conta) };
}

/* As chaves de `loginRedirects` que servem pra esta conta (o run lê cada uma).
 * Mesma identidade que a CF resolveLoginRedirect usa: e-mail e telefone. */
function chavesDeRedirect(conta) {
  var chaves = [];
  var e = emailReal(conta && conta.email);
  if (e) chaves.push(e.toLowerCase());
  if (conta && conta.phoneNumber) chaves.push(String(conta.phoneNumber));
  return chaves;
}

module.exports = { decidir, montarSemente, chavesDeRedirect, isSocial, emailReal, nomeUtil, CARENCIA_MS };
