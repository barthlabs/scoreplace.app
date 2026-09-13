'use strict';
/* ⛔ A MESMA NOVIDADE NÃO SAI DUAS VEZES — E O CONSERTO É NO SERVIDOR.
 *
 * MEDIDO em produção (12/set/2026, leitura direta do Firestore): o aviso
 * "Rodrigo Barth criou o grupo do WhatsApp de «Erika de Paula / Livia Morais vs
 * Loraine Soares / Rodrigo Barth»" saiu para as MESMAS duas pessoas às 00:19, 00:39
 * e 13:34 de 03/ago, corpo idêntico caractere a caractere.
 *
 * A 2.2.94 fechou o DISPARO (salvar o mesmo link parou de avisar de novo). Restava a FILA:
 * `queueNotifEmail` grava com `.add()`, sem identidade — dois itens iguais são dois itens, e
 * em descargas diferentes viram dois e-mails. O conserto tem de ser no SERVIDOR porque o do
 * cliente só alcança quem atualizou, e a Produção Android está treze versões atrás.
 *
 * ⚠️ ERRA PARA O LADO DE MANDAR: se o registro do "já saiu" não puder ser lido, ele chega
 * VAZIO e tudo é enviado. Perder aviso é pior que repetir — mesma regra do accountSummaryEmail.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const D = require(path.join(raiz, 'functions/digest-core.js'));
const FN = fs.readFileSync(path.join(raiz, 'functions/index.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const semComentario = (s) => s.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

const aviso = (extra) => Object.assign({
  level: 'fundamental',
  message: 'Rodrigo Barth criou o grupo do WhatsApp de "Erika / Livia vs Loraine / Rodrigo".',
  tournamentName: 'Confra BT Alta da Clínica 2026',
  tournamentUrl: 'https://scoreplace.app/#tournaments/tour_1780009816637',
  ctaUrl: 'https://chat.whatsapp.com/ABC',
  scoreboard: null,
}, extra || {});

// ── ① a chave vê a NOVIDADE, não o documento ────────────────────────────────
must(D._chaveDoAviso(aviso()) === D._chaveDoAviso(aviso()),
  '① dois itens com o mesmo conteúdo têm a MESMA chave');
must(D._chaveDoAviso(aviso({ _id: 'x1', createdAt: 1 })) === D._chaveDoAviso(aviso({ _id: 'x2', createdAt: 999 })),
  '① id do documento e horário de entrada NÃO entram na chave — é justamente o que diferia');
must(D._chaveDoAviso(aviso()) !== D._chaveDoAviso(aviso({ message: 'outra coisa' })),
  '① texto diferente ⇒ chave diferente');
must(D._chaveDoAviso(aviso()) !== D._chaveDoAviso(aviso({ ctaUrl: 'https://chat.whatsapp.com/ZZZ' })),
  '① botão apontando pra outro lugar ⇒ chave diferente');
must(D._chaveDoAviso(aviso()) !== D._chaveDoAviso(aviso({ scoreboard: { sets: [[6, 4]] } })),
  '① placar embutido conta na chave');

// ── ② dentro da MESMA descarga, o repetido vira UMA linha ───────────────────
const AGORA = 1_760_000_000_000;
const JAN = 2 * 60 * 60 * 1000;
let r = D._semRepetidos([aviso({ _id: 'a' }), aviso({ _id: 'b' })], {}, AGORA, JAN);
must(r.vao.length === 1, '② dois itens iguais na mesma descarga ⇒ UMA linha no e-mail');
must(r.chaves.length === 1, '② e uma chave só a registrar');

r = D._semRepetidos([aviso({ _id: 'a' }), aviso({ _id: 'b', message: 'novidade diferente' })], {}, AGORA, JAN);
must(r.vao.length === 2, '② novidades diferentes continuam as duas');

// ── ③ entre descargas: o de 20 min atrás não sai de novo; o de ontem sai ────
const reg = {}; reg[D._chaveDoAviso(aviso())] = AGORA - 20 * 60 * 1000;
must(D._semRepetidos([aviso({ _id: 'c' })], reg, AGORA, JAN).vao.length === 0,
  '③ ⭐ o caso MEDIDO (20 min depois, corpo igual) NÃO gera segundo e-mail');

const regVelho = {}; regVelho[D._chaveDoAviso(aviso())] = AGORA - 22 * 60 * 60 * 1000;
must(D._semRepetidos([aviso({ _id: 'd' })], regVelho, AGORA, JAN).vao.length === 1,
  '③ o mesmo texto no dia seguinte é novidade de verdade e SAI');

// ── ④ erra para o lado de MANDAR ────────────────────────────────────────────
must(D._semRepetidos([aviso()], null, AGORA, JAN).vao.length === 1,
  '④ registro ilegível (nulo) ⇒ manda');
must(D._semRepetidos([aviso()], {}, AGORA, JAN).vao.length === 1,
  '④ registro vazio ⇒ manda');
must(D._semRepetidos([aviso()], { 'chave:de:outra:pessoa': AGORA }, AGORA, JAN).vao.length === 1,
  '④ registro de outra novidade não cala esta');

// ── ⑤ o registro não cresce pra sempre ──────────────────────────────────────
const podado = D._registroPodado({ velha: AGORA - 5 * 60 * 60 * 1000, nova: AGORA - 60 * 1000 }, ['recem'], AGORA, JAN);
must(!('velha' in podado), '⑤ entrada fora da janela some do registro');
must(podado.nova === AGORA - 60 * 1000, '⑤ entrada dentro da janela fica com o horário dela');
must(podado.recem === AGORA, '⑤ e o que acabou de sair entra carimbado com agora');

// ── ⑥ a fiação: a fila SEMPRE se limpa, e o registro é o último passo ───────
const ini = FN.indexOf('exports.flushNotifEmailDigest');
assert.ok(ini > 0, 'âncora: a descarga do digest');
const fim = FN.indexOf('exports.cleanupOldCasualMatches', ini);
assert.ok(fim > ini, 'âncora: o fim da descarga');
const flush = semComentario(FN.slice(ini, fim));

must(/_semRepetidos\(items, _jaSaiu/.test(flush), '⑥ a descarga passa a fila pela regra');
must(/_buildDigestHtml\(novos, _theme\)/.test(flush) && /_buildDigestText\(novos\)/.test(flush),
  '⑥ o e-mail é montado com o que SOBROU, não com a fila crua');
must(!/_buildDigestHtml\(items|_buildDigestText\(items/.test(flush),
  '⑥ ⛔ não sobrou caminho montando o e-mail com a fila inteira');
must(/if \(novos\.length === 0\) \{[\s\S]{0,200}_limpaAFila\(\)/.test(flush),
  '⑥ ⭐ tudo repetido ⇒ a fila ainda assim se limpa (senão voltaria a cada 5 min pra sempre)');
must(flush.indexOf('_enqueueMail(db, {') < flush.indexOf('_regRef.set('),
  '⑥ ORDEM: o e-mail é enfileirado ANTES de o registro ser gravado');
must(/catch \(e\) \{[\s\S]{0,220}registro do já-enviado ilegível/.test(FN.slice(ini, fim)),
  '⑥ falha ao LER o registro é engolida de propósito — e aí manda tudo');

// ── ⑦ a coleção do registro é do SERVIDOR ───────────────────────────────────
const RULES = fs.readFileSync(path.join(raiz, 'firestore.rules'), 'utf8');
must(!/notifDigestSent/.test(RULES),
  '⑦ ⛔ `notifDigestSent` não tem regra — negada por padrão, só o Admin SDK alcança');

console.log('\n✅ digest não manda a mesma novidade duas vezes — ' + ok + ' verificações');
