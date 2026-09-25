'use strict';

/* ⛔⛔ O PASSKEY SÓ VALE PELO QUE ELE RECUSA.
 *
 * Por que existe: medido em 25/set/2026, 4 dos 9 pares de conta duplicada são Apple + Google —
 * gente que voltou, não achou a própria conta e criou outra. A chave descobrível tira a pergunta
 * "qual conta eu usei". Mas uma entrada sem senha só é melhor que senha se recusar o que tem que
 * recusar; se aceitar, ela é pior que senha nenhuma, porque parece segura.
 *
 * ⛔ CADA ASSERÇÃO AQUI É UMA FALHA REAL DE SISTEMAS DE VERDADE, não hipótese de manual:
 *   · origem não conferida → site alheio pede a assinatura e entra na conta da pessoa;
 *   · desafio reusável → assinatura interceptada vale para sempre;
 *   · contador ignorado → a MESMA assinatura entra duas vezes.
 *
 * ⚠️ A conferência da assinatura em si NÃO é testada aqui, e é de propósito: ela mora na biblioteca
 * (análise de estrutura binária e de assinatura). O que este arquivo trava são as decisões que
 * ficariam espalhadas e erram caladas.
 */
const path = require('path');
const P = require(path.join(__dirname, '..', 'functions', 'passkey-core.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── o passkey vale pelo que recusa ────\n');

// ── ① ORIGEM ─────────────────────────────────────────────────────────────────
ok(P.origemAceita('https://scoreplace.app') === true, '① a nossa origem passa');
ok(P.origemAceita('https://www.scoreplace.app') === true, '① e a variante com www também');
ok(P.origemAceita('https://evil.com') === false, '① ⛔ site alheio NÃO passa — é o ataque que o campo origem existe para barrar');
ok(P.origemAceita('http://scoreplace.app') === false, '① ⛔ nem o mesmo domínio SEM https');
ok(P.origemAceita('https://scoreplace.app.evil.com') === false, '① ⛔ nem domínio que só COMEÇA igual');
ok(P.origemAceita('https://scoreplace.app ') === true, '① espaço à volta não muda a origem (o texto é aparado)');
ok(P.origemAceita('') === false && P.origemAceita(null) === false, '① ⛔ vazio e ausente não passam');

// ── ② DESAFIO: uso único e prazo ─────────────────────────────────────────────
const agora = 1_800_000_000_000;
ok(P.desafioValido({ desafio: 'x', criadoEmMs: agora }, agora).ok === true, '② desafio novo vale');
ok(P.desafioValido(null, agora).motivo === 'inexistente',
  '② ⛔ assinatura SEM desafio nosso é recusada — ela veio de outro lugar');
ok(P.desafioValido({ desafio: 'x', criadoEmMs: agora, usadoEm: 'já' }, agora).motivo === 'ja-usado',
  '② ⛔⛔ desafio JÁ USADO é recusado — sem isto, assinatura interceptada vale para sempre');
ok(P.desafioValido({ desafio: 'x', criadoEmMs: agora - P.DESAFIO_VALE_MS - 1 }, agora).motivo === 'vencido',
  '② ⛔ desafio vencido é recusado');
ok(P.desafioValido({ desafio: 'x', criadoEmMs: agora + 600000 }, agora).motivo === 'futuro',
  '② ⛔ e desafio com data no FUTURO também — relógio torto não é credencial');
ok(P.desafioValido({ desafio: '', criadoEmMs: agora }, agora).motivo === 'inexistente',
  '② desafio vazio conta como inexistente');

// ── ③ CONTADOR: a defesa contra reuso ────────────────────────────────────────
ok(P.contadorAvancou(5, 6) === true, '③ contador que avança passa');
ok(P.contadorAvancou(5, 5) === false, '③ ⛔⛔ contador IGUAL é recusado — é a MESMA assinatura chegando de novo');
ok(P.contadorAvancou(5, 4) === false, '③ ⛔ e contador que retrocede também');
ok(P.contadorAvancou(0, 0) === true,
  '③ ⚠️ MAS zero nos dois lados PASSA — vários aparelhos (Apple entre eles) não implementam contador; recusar trancaria a maioria dos iPhones');
ok(P.contadorAvancou(0, 1) === true, '③ e de zero para um passa');

// ── ④ TETO POR CONTA ─────────────────────────────────────────────────────────
ok(P.podeCadastrarMais(0) === true && P.podeCadastrarMais(P.MAX_POR_CONTA - 1) === true,
  '④ dá para cadastrar aparelhos até o teto');
ok(P.podeCadastrarMais(P.MAX_POR_CONTA) === false,
  '④ ⛔ no teto, para — conta invadida não acumula dezenas de chaves que a pessoa não reconhece');

// ── ⑤ O QUE SE GUARDA — e o que NÃO ──────────────────────────────────────────
const reg = P.registroDaCredencial({ credentialId: 'abc', publicKey: 'PUB', counter: 3,
  transports: ['internal', ''], deviceType: 'multiDevice', backedUp: true }, '2026-09-25T00:00:00.000Z');
ok(reg.publicKey === 'PUB' && reg.counter === 3, '⑤ guarda a chave PÚBLICA e o contador');
ok(JSON.stringify(reg.transports) === '["internal"]', '⑤ e limpa entrada vazia da lista de transportes');
ok(reg.backedUp === true && reg.deviceType === 'multiDevice',
  '⑤ guarda se a chave SINCRONIZA — é o que diz se trocar de aparelho mantém a entrada');
ok(Object.keys(reg).indexOf('privateKey') === -1,
  '⑤ ⛔ e não existe campo de chave privada: ela nunca sai do aparelho da pessoa');

// ── ⑥ AS QUATRO CORREÇÕES DA REVISÃO, cada uma com o defeito nomeado ─────────
/* ⛔ Os quatro foram achados na revisão de 25/set/2026 e cada um tornava a entrada sem senha inútil
 * ou insegura. Ficam travados aqui para não voltarem. */
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const idx = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
const cli = fs.readFileSync(path.join(ROOT, 'js', 'views', 'passkey.js'), 'utf8');
const dbjs = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');
const auth = fs.readFileSync(path.join(ROOT, 'js', 'views', 'auth.js'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'js', 'ui.js'), 'utf8');

/* ① O transporte RECUSAVA sem login — as duas etapas da entrada eram CÓDIGO MORTO, nunca chegariam
 * ao servidor. A entrada é, por natureza, de quem ainda não entrou. */
ok(/!user && !msgs\.semLogin/.test(dbjs),
  '⑥① ⛔⛔ o transporte aceita chamada DESLOGADA quando a porta pede — sem isso a entrada era código morto');
ok((cli.match(/semLogin: true/g) || []).length >= 2,
  '⑥① e as DUAS etapas da entrada pedem isso explicitamente');

/* ② O desafio era lido e só depois queimado: duas chamadas paralelas leem "não usado" AS DUAS. */
ok(/_passkeyConsumirDesafio/.test(idx) && /runTransaction/.test(idx),
  '⑥② ⛔⛔ o desafio é consumido em TRANSAÇÃO — ler-e-depois-queimar deixava duas chamadas passarem juntas');
ok(!/await dRef\.update\(\{ usadoEm/.test(idx),
  '⑥② e a queima fora de transação não existe mais');

/* ③ O contador tinha a MESMA corrida. */
ok(/const avancou = await db\.runTransaction/.test(idx),
  '⑥③ ⛔ o contador também avança em transação — é a mesma corrida do desafio');

/* ④ O abortador da oferta estava DEFINIDO e nunca chamado. Definir sem ligar é não ter. */
const chamadas = (auth.match(/_passkeyPararOferta/g) || []).length + (ui.match(/_passkeyPararOferta/g) || []).length;
ok(chamadas >= 4,
  '⑥④ ⛔⛔ a oferta é abortada nos caminhos alternativos e no fechar da tela — achei ' + chamadas + ' pontos');
ok(/modalId === 'modal-login'/.test(ui),
  '⑥④ ⭐ inclusive ao FECHAR a tela, que cobre o X, o toque fora e o Esc — os que não passam por botão');

/* ⑤ A porta pública não tinha teto nem prazo. */
ok(/maxInstances: 10/.test(idx),
  '⑥⑤ ⛔ a porta pública tem teto de instâncias — CORS não protege chamada fora do navegador');
ok((idx.match(/expiraEm: new Date/g) || []).length >= 2,
  '⑥⑤ e os desafios morrem sozinhos, senão cada tentativa deixaria lixo para sempre');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
