/* A ANÁLISE NUNCA PODE GRAVAR NA PESSOA ERRADA
 * node tests/analise-nunca-grava-na-pessoa-errada.test.js
 *
 * O DEFEITO (relato do dono, 05/ago/2026): _"análise continua não funcionando. Grava uma
 * parte e o resto não"_ → e o detalhe que virou a chave: _"coloquei 3 mulheres da D em FUN
 * ou sem habilidade e Vivi Hirata, que era uma delas, acabou indo para C… sem qualquer
 * justificativa"_.
 *
 * MEDIDO na base: "Vivi Hirata" e "Vivian" foram gravadas no MESMO SEGUNDO (18:31:23) com
 * valores DIFERENTES (C e D), e NENHUMA das três terminou em FUN. Não era edição perdida —
 * era edição pousando em OUTRA PESSOA.
 *
 * CAUSA: `_erFindParticipant` terminava com `if (!p) p = parts[order - 1]`. E:
 *   • `order` vem da lista de LINHAS (inclui espera, membros de dupla, ordenação própria),
 *     NÃO de `t.participants` — os índices não se correspondem; e
 *   • o casamento por nome lia `cp.displayName`, APAGADO de toda entrada com uid desde a
 *     v1.3.52 (identity-core._stripUidEntryNames).
 * Bastava o uid não bater pra cair no índice e escrever em quem estivesse ali.
 *
 * O cliente montava o lote CERTO (verificado no navegador: 3 assignments, sport correto) —
 * o estrago era na resolução de QUEM recebia cada um.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'views',
  'tournaments-enrollment-report.js'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, m, extra) { if (cond) pass++; else { fail++; console.error('  ✗ ' + m + (extra ? '  → ' + extra : '')); } }

// Extrai a função REAL do arquivo (não uma réplica — réplica verde já mascarou bug aqui).
const ini = SRC.indexOf('function _erFindParticipant');
const fim = SRC.indexOf('\n  }', SRC.indexOf('return null;\n  }', ini)) + 4;
const fonte = SRC.slice(ini, fim);
ok(/function _erFindParticipant/.test(fonte), 'extraiu a função real do arquivo');
const _erFindParticipant = eval('(' + fonte.replace('function _erFindParticipant', 'function') + ')');

// ── O CASO REAL: duas pessoas de nome parecido, o roster STRIPPADO (sem displayName) ──
// É assim que o doc de produção realmente é: entrada com uid não guarda nome.
const parts = [
  { uid: 'uid_vivian', categories: ['Fem D'] },       // índice 0
  { uid: 'uid_vivi_hirata', categories: ['Fem D'] },  // índice 1
  { uid: 'uid_terceira', categories: ['Fem D'] },     // índice 2
];

(() => {
  // A linha da Vivi Hirata resolve por uid — tem que achar ELA, não a vizinha.
  const p = _erFindParticipant(parts, { uid: 'uid_vivi_hirata', name: 'Vivi Hirata' }, 1);
  ok(p && p.uid === 'uid_vivi_hirata', 'linha com uid resolve na PESSOA certa',
    p ? p.uid : 'null');
})();

(() => {
  // O CORAÇÃO DO BUG: uid que NÃO está no roster (pessoa da espera, dupla desfeita, doc
  // recém-mudado). Antes, `parts[order-1]` entregava a vizinha e a edição pousava nela.
  const p = _erFindParticipant(parts, { uid: 'uid_que_nao_esta_no_roster', name: 'Alguém' }, 1);
  ok(p === null, 'uid que não está no roster → NÃO cai na vizinha (retorna null)',
    p ? ('caiu em ' + p.uid) : '');
  // A prova do estrago: o índice 1-1=0 é a Vivian. Era ela que recebia o valor da outra.
  ok(parts[0].uid === 'uid_vivian', '  (o índice que o fallback usaria é a Vivian — o caso real)');
})();

(() => {
  // Nome NÃO pode casar com entrada que tem uid: o nome dela foi strippado do doc, então
  // qualquer casamento por nome ali é coincidência de outra fonte.
  const p = _erFindParticipant(parts, { name: 'Vivi Hirata' }, 2);
  ok(p === null, 'linha só-com-nome NÃO casa com entrada que tem uid (nome é strippado)',
    p ? ('casou com ' + p.uid) : '');
})();

(() => {
  // Fictício (sem uid) continua funcionando por nome — é a única identidade que ele tem.
  const comFicticio = parts.concat([{ displayName: 'Jogador Convidado', categories: [] }]);
  const p = _erFindParticipant(comFicticio, { name: 'Jogador Convidado' }, 4);
  ok(p && p.displayName === 'Jogador Convidado', 'fictício (sem uid) segue casando por nome');
})();

(() => {
  // Membro de DUPLA: o uid mora em p1Uid/p2Uid — o alvo é o doc da dupla.
  const comDupla = [{ p1Uid: 'uid_a', p2Uid: 'uid_b', p1Name: 'A', p2Name: 'B' }];
  ok(_erFindParticipant(comDupla, { uid: 'uid_b' }, 1) === comDupla[0],
    'uid de membro de dupla resolve no doc da dupla');
  ok(_erFindParticipant(comDupla, { uid: 'uid_zzz' }, 1) === null,
    '  → e uid estranho à dupla NÃO cai nela');
})();

// ── Trava de código: o fallback posicional não pode voltar ───────────────────
(() => {
  // Mira CÓDIGO, não comentário — o comentário que documenta o defeito é justamente o que
  // impede alguém de reintroduzi-lo.
  ok(!/^\s*(if \([^)]*\)\s*)?p = parts\[order ?- ?1\];/m.test(SRC),
    'o fallback POSICIONAL não existe mais como CÓDIGO (era ele que trocava a pessoa)');
  ok(/Resolução SÓ por uid|SÓ por uid|NUNCA MAIS RESOLVE POR POSIÇÃO/.test(SRC),
    'a regra está escrita no arquivo, pra não voltar por descuido');
})();

console.log(fail === 0
  ? `✅ analise-nunca-grava-na-pessoa-errada: ${pass} ok, 0 falharam`
  : `❌ analise-nunca-grava-na-pessoa-errada: ${fail} falharam, ${pass} ok`);
process.exit(fail ? 1 : 0);
