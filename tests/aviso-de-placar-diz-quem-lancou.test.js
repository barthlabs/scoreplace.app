'use strict';
/* ⛔ "JOGADOR LANÇOU:" — O AVISO NÃO DIZIA O NOME DE NINGUÉM.
 *
 * Relato do dono (13/set/2026, e-mail do Confra): _"as notificacoes estao todas assim:
 * jogador lancou. e numa delas eu lancei como organizador. o certo seria dizer o nome de quem
 * lançou com (org.) quando foi na qualidade de organizador."_
 *
 * ⛔ A CAUSA: o nome saía SÓ da PROPOSTA (`proposal.proposedBy`/`proposedByName`). Quando o
 * organizador lança DIRETO — sem etapa de aprovação, que é o caminho dele — não existe
 * proposta: `proposerUid` vira '', `liveNames['']` é `undefined`, e o texto caía no literal
 * `'Jogador'`. O caso mais comum do organizador era justamente o que perdia a autoria.
 *
 * ⭐ Quem lançou é a proposta **OU O ATOR** — sem proposta, quem age é quem lançou, e o dado
 * sempre esteve em `actor`. E o papel vai junto: `(org.)` quando é organizador ou co-org,
 * porque "um jogador lançou o placar do jogo dele" e "a organização lançou por eles" são
 * responsabilidades diferentes sobre o mesmo número.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const SRC = fs.readFileSync(path.join(raiz, 'functions-autodraw/index.js'), 'utf8');
const codigo = SRC.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

console.log('\n──── o aviso de placar diz quem lançou ────\n');

// ── ① quem lançou é a proposta OU o ator ───────────────────────────────────
must(/const autorUid = proposerUid \|\| String\(\(actor && actor\.uid\) \|\| ''\);/.test(codigo),
  '① ⭐⭐ sem proposta, quem lançou é o ATOR — era aqui que o nome se perdia');
must(/ctx\.liveNames && ctx\.liveNames\[autorUid\]\) \|\| \(actor && actor\.name\)/.test(codigo),
  '① ⭐ e o nome vivo é buscado pelo uid do AUTOR, não pelo da proposta inexistente');

// ── ② o papel entra no texto ───────────────────────────────────────────────
must(/const autorEhOrg = _isTournamentAdmin\(t, autorUid\);/.test(codigo),
  '② ⭐ o papel sai da régua canônica de organizador, por uid');
must(/proposerBase \+ ' \(org\.\)'/.test(codigo),
  '② ⭐⭐ quem lançou como organização leva `(org.)` no nome');
must(/confirmerBase \+ ' \(org\.\)'/.test(codigo),
  '② e quem CONFIRMA como organização também — as duas pontas do mesmo aviso');

// ── ③ sem sufixo duplo ─────────────────────────────────────────────────────
must(/proposerBase !== 'Organizador'/.test(codigo) && /confirmerBase !== 'Organizador'/.test(codigo),
  '③ ⛔ quando nem o nome resolveu, o rótulo já É "Organizador" — nada de "Organizador (org.)"');

// ── ④ o texto continua sendo o mesmo em tudo o mais ────────────────────────
must(/proposerName \+ ' lançou:'/.test(codigo),
  '④ a frase segue "<quem> lançou:" — mudou QUEM, não a forma');
must(/confirmerName \+ ' confirmou o resultado lançado por ' \+ proposerName/.test(codigo),
  '④ e a de confirmação continua nomeando os DOIS');

// ── ⑤ CONTROLE: a forma antiga sumiu ───────────────────────────────────────
must(!/_notificationPersonName\(liveProposerName, 'Jogador'\)/.test(codigo),
  '⑤ ⭐ a queda cega no literal "Jogador" não existe mais');
must(!/const proposerUid = String\(proposal && proposal\.proposedBy \|\| ''\);\s*\n\s*const liveProposerName = ctx\.liveNames && ctx\.liveNames\[proposerUid\];/.test(codigo),
  '⑤ ⛔ nem a busca do nome pelo uid da proposta como única fonte');

console.log('\n✅ ' + ok + ' verificações');
