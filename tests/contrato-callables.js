'use strict';
/* CONTRATO ÚNICO das chamadas do cliente às Cloud Functions.
 *
 * ⛔ POR QUE EXISTE: duas suítes perguntam coisas diferentes sobre o MESMO conjunto —
 * `uma-porta-para-chamar-a-cf` ("quantas casas de transporte existem?") e
 * `portas-que-o-app-chama-existem` ("todo nome chamado existe como export?"). Cada uma
 * escrevendo a sua lista viraria duas verdades sobre a mesma coisa, que é exatamente a
 * classe de defeito que as duas levas vieram consertar.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');

/* O ÚNICO construtor dinâmico autorizado: monta a URL a partir do parâmetro. */
const CONSTRUTOR_DINAMICO = { arquivo: 'js/views/tournaments-draw.js', funcao: '_callCF' };

/* O wrapper: NÃO monta URL (isso acabou na leva do transporte). A isenção dele vale só
 * para o ENCAMINHAMENTO `name → _callCF(name, …)` — não para a função inteira. */
const WRAPPER_ENCAMINHA = { arquivo: 'js/firebase-db.js', funcao: '_callFn', delega: '_callCF' };

/* As URLs literais que sobreviveram, com a classe de transporte de cada uma. `callable`
 * fala o envelope {data}; `http` é onRequest com corpo próprio. */
const URLS_LITERAIS = [
  { nome: 'checkAccount',         arquivo: 'js/views/auth.js',                 classe: 'callable' },
  { nome: 'mergePhoneAccount',    arquivo: 'js/views/auth.js',                 classe: 'callable' },
  { nome: 'integrateLateEntries', arquivo: 'js/views/tournaments-draw.js',     classe: 'callable' },
  { nome: 'createCheckoutSession', arquivo: 'js/store.js',                     classe: 'http' },
];

/* Os três entrypoints que declaram exports publicáveis. */
const ENTRYPOINTS = [
  { arquivo: 'functions/index.js',           modulo: false },
  { arquivo: 'functions-autodraw/index.js',  modulo: false },
  { arquivo: 'functions-stripe/index.js',    modulo: true  },
];

/* Tipos que TÊM endereço para o cliente chamar. Gatilho não entra. */
const TIPOS_CHAMAVEIS = ['onCall', 'onRequest'];
const TRANSPORTE_EXIGE = { httpsCallable: ['onCall'], _callCF: ['onCall'], _callFn: ['onCall'], url: ['onCall', 'onRequest'] };

module.exports = { ROOT, CONSTRUTOR_DINAMICO, WRAPPER_ENCAMINHA, URLS_LITERAIS, ENTRYPOINTS, TIPOS_CHAMAVEIS, TRANSPORTE_EXIGE };
