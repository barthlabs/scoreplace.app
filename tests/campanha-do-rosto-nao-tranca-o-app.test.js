'use strict';

/* ⛔⛔ A CAMPANHA DO ROSTO NÃO TRANCA O APP, E O PRAZO É UM SÓ PARA TODOS.
 *
 * Ordem do dono (25/set/2026): novo já cadastra sem lambuja; quem já tem conta é avisado e tem
 * 1 mês; depois endurece.
 *
 * ⛔ DUAS DECISÕES MINHAS, travadas aqui:
 * ① prazo é DATA ÚNICA, não um mês por pessoa — por pessoa, a base nunca fecharia: quem passa três
 *   meses fora ganharia prazo novo ao voltar, e sempre haveria alguém no prazo;
 * ② endurecer barra ENTRAR EM TORNEIO, nunca abrir o app. Trancar o app cria a pessoa fora da
 *   própria conta no domingo do torneio, sem ninguém a quem recorrer.
 *
 * ⛔⛔ NÃO EXISTE RECUSA — ordem do dono: "tem que cadastrar ou não entra. item de segurança".
 * ⭐ ERRO MEU, corrigido e registrado: eu havia afirmado que sem caminho de recusa o consentimento
 * não seria livre e a base seria ilegal. Isso vale quando a base legal é CONSENTIMENTO. A LGPD
 * NOMEIA esta hipótese entre as que dispensam consentimento para dado sensível: prevenção à fraude
 * e segurança do titular na identificação e autenticação de cadastro. Como item de segurança,
 * exigir é legítimo. Continuam obrigatórios: informar, minimizar, proteger e apagar com a conta.
 *
 * ⛔ O QUE NÃO SAI é o atendimento humano, e não é jurídico: quem não TEM câmera ou não dá conta do
 * gesto precisa de caminho — portaria tem porteiro por isso. A marca é posta por QUEM ATENDE, nunca
 * pela própria pessoa, senão vira a porta de fuga que o dono fechou.
 */
const assert = require('assert/strict');
const path = require('path');
const R = require(path.join(__dirname, '..', 'js', 'domain', 'face-rollout.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── a campanha do rosto ────\n');

const CAMPANHA = { comecaEm: '2026-10-01T00:00:00.000Z', terminaEm: '2026-11-01T00:00:00.000Z' };
const dia = (iso) => Date.parse(iso);

// ── ① quem já cadastrou, e quem recusou ──────────────────────────────────────
ok(R.estadoDaPessoa({ temRosto: true }, CAMPANHA, dia('2026-12-01T00:00:00Z')) === 'pronto',
  '① quem cadastrou está pronto, mesmo depois do prazo');
/* ⛔ A RECUSA NÃO EXISTE: quem "recusou" é tratado como quem não cadastrou. Esta asserção existe
 * para que ninguém reintroduza a porta de fuga achando que é direito da pessoa. */
ok(R.estadoDaPessoa({ recusouRosto: true }, CAMPANHA, dia('2026-12-01T00:00:00Z')) === 'endurecido',
  '① ⛔ "recusar" não é estado: quem não cadastrou endurece como qualquer outro');
ok(R.podeSeInscrever({ recusouRosto: true }, CAMPANHA, dia('2026-12-01T00:00:00Z')) === false,
  '① ⛔⛔ e NÃO entra em torneio — cadastrar é item de segurança, não escolha');

/* ⭐ O caminho que FICA, e é operacional: quem não CONSEGUE cadastrar. */
ok(R.estadoDaPessoa({ analiseManual: true }, CAMPANHA, dia('2026-12-01T00:00:00Z')) === 'emAnalise',
  '① quem não consegue cadastrar fica em análise — sem câmera, aparelho emprestado, idade');
ok(R.podeSeInscrever({ analiseManual: true }, CAMPANHA, dia('2026-12-01T00:00:00Z')) === true,
  '① ⭐ e joga enquanto o atendimento corre — barrar seria punir por não ter câmera');

// ── ② conta NOVA: sem lambuja, e não depende de prazo ────────────────────────
const nova = { criadoEm: '2026-10-05T00:00:00.000Z' };
ok(R.estadoDaPessoa(nova, CAMPANHA, dia('2026-10-06T00:00:00Z')) === 'novo',
  '② conta nascida depois do início da campanha: exigência imediata');
ok(R.podeSeInscrever(nova, CAMPANHA, dia('2026-10-06T00:00:00Z')) === false,
  '② ⛔ e ela NÃO entra em torneio sem rosto, ainda dentro do prazo dos outros');

// ── ③ conta ANTIGA: pede, insiste, endurece ──────────────────────────────────
const antiga = { criadoEm: '2026-06-01T00:00:00.000Z' };
ok(R.estadoDaPessoa(antiga, CAMPANHA, dia('2026-10-02T00:00:00Z')) === 'pedir',
  '③ no começo do prazo: pede');
ok(R.estadoDaPessoa(antiga, CAMPANHA, dia('2026-10-28T00:00:00Z')) === 'insistir',
  '③ na reta final (7 dias ou menos): insiste');
ok(R.estadoDaPessoa(antiga, CAMPANHA, dia('2026-11-02T00:00:00Z')) === 'endurecido',
  '③ passado o prazo: endurece');
ok(R.podeSeInscrever(antiga, CAMPANHA, dia('2026-10-28T00:00:00Z')) === true,
  '③ ⭐ DENTRO do prazo ela se inscreve normalmente — a campanha avisa, não castiga');
ok(R.podeSeInscrever(antiga, CAMPANHA, dia('2026-11-02T00:00:00Z')) === false,
  '③ ⛔ passado o prazo, não entra em torneio');

// ── ④ o que NUNCA tranca ─────────────────────────────────────────────────────
ok(R.podeUsarOApp() === true,
  '④ ⭐⭐ o app NUNCA tranca — nem para quem endureceu. Abrir, ver resultados e falar com o organizador seguem');

// ── ⑤ conta sem data de nascimento conta como ANTIGA ─────────────────────────
/* Medido: há contas em produção sem data de criação. Tratá-las como novas exigiria rosto na hora de
 * quem já usa o app há meses — endurecer por falta de um campo NOSSO, não por escolha da pessoa. */
ok(R.estadoDaPessoa({}, CAMPANHA, dia('2026-10-02T00:00:00Z')) === 'pedir',
  '⑤ ⛔ conta SEM data de criação é tratada como antiga — não se endurece por falta de campo nosso');

// ── ⑥ a contagem de dias que a tela mostra ───────────────────────────────────
ok(R.diasRestantes(CAMPANHA, dia('2026-10-31T00:00:00Z')) === 1, '⑥ falta 1 dia na véspera');
ok(R.diasRestantes(CAMPANHA, dia('2026-11-05T00:00:00Z')) === 0, '⑥ e nunca conta negativo');
ok(R.diasRestantes(CAMPANHA, dia('2026-10-01T00:00:00Z')) === 31, '⑥ um mês cheio no primeiro dia');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
