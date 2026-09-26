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

/* ══════════════════════════════════════════════════════════════════════════════
 * ⑦ E A CAMPANHA NÃO ESTÁ LIGADA — isto é ESTADO DECLARADO, não esquecimento.
 *
 * ⛔⛔ A revisão de 25/set/2026 apontou como defeito que a campanha "não tem efeito". Tem razão no
 * fato e o fato é PROPOSITAL: falta a COLETA do rosto (câmera, prova de vida, vetor no cofre), que é
 * leva própria. Ligar a exigência antes da coleta barraria todo mundo sem oferecer o cadastro.
 * ⇒ Em vez de deixar a ausência calada — que é como este projeto acumulou proteção inexistente —,
 * ela é AFIRMADA aqui. No dia em que a coleta existir, estas duas asserções ficam vermelhas e a
 * próxima pessoa é obrigada a trocá-las pela asserção contrária: que a porta CHAMA a política.
 * ⚠️ É a lição de [[feedback_tela_parcial_se_diz_pronta]]: o não-medido aparece MARCADO, nunca ausente.
 * ════════════════════════════════════════════════════════════════════════════ */
const _fs = require('fs');
const _path = require('path');
const _RAIZ = _path.join(__dirname, '..');
const _fonteTs = _fs.readFileSync(_path.join(_RAIZ, 'src/domain/face-rollout.ts'), 'utf8');
ok(/NÃO ESTÁ LIGADO, E A AUSÊNCIA É DELIBERADA/.test(_fonteTs),
  '⑦ ⛔⛔ o próprio contrato declara, em cima, que ainda não está ligado');
ok(/enrollParticipant/.test(_fonteTs),
  '⑦ ⭐ e NOMEIA a única porta onde vai ser ligado — no servidor, porque bloqueio no cliente não bloqueia');
const _consumidores = ['functions/index.js', 'js/views/auth.js', 'js/firebase-db.js']
  .filter((f) => /faceRollout|face-rollout|_campanhaDoRosto/.test(_fs.readFileSync(_path.join(_RAIZ, f), 'utf8')));
ok(_consumidores.length === 0,
  '⑦ ⛔ e hoje NENHUMA porta o chama — achei ' + _consumidores.length + '. Quando chamar, troque esta asserção pela contrária');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
