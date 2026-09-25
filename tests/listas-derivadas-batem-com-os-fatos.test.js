'use strict';
/* ⛔⛔ RESPOSTA DERIVADA GUARDADA NO BANCO É ONDE NASCEM DUAS VERDADES (24/set/2026).
 *
 * Pergunta do dono: _"porque vc acha que é a forma certa de trabalhar com um banco de dados?"_
 * O desenho guarda FATOS e deriva as respostas — mas três listas do torneio são derivadas E
 * gravadas, porque a regra do Firestore não percorre lista de objetos filtrando por `status`.
 * É restrição de plataforma, não escolha, e é o único ponto do desenho com duas verdades.
 *
 * MEDIDO em produção, e não era teoria: 1 torneio com a lista de membros fora dos fatos — uma
 * pessoa INSCRITA que a regra tratava como estranha (não lançava o próprio placar e não via o
 * torneio na lista dela) e uma NÃO inscrita que a regra deixava passar. Consertado.
 * Conferidor de banco: functions-autodraw/conferir-derivados.js
 */
const path = require('path');
const V = require(path.join(__dirname, '..', 'functions-autodraw', 'conferir-derivados.js'));
const En = require(path.join(__dirname, '..', 'functions', 'enroll-core.js'));
const Split = require(path.join(__dirname, '..', 'functions-autodraw', 'vendor', 'tournament-split-core.js'));

let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }

console.log('──── listas derivadas batem com os fatos ────');

// ── A. o comparador distingue os DOIS lados, que têm significados diferentes ──
{
  const r = V.conferirLista(['a', 'b'], ['b', 'c']);
  ok(r.falta.length === 1 && r.falta[0] === 'c',
    'FALTA = está no torneio e a regra recusa (a pessoa perde o próprio placar e a lista dela)');
  ok(r.sobra.length === 1 && r.sobra[0] === 'a',
    'SOBRA = não está no torneio e a regra deixa passar');
  ok(V.conferirLista(['a'], ['a']).falta.length === 0, 'iguais não divergem');
  ok(V.conferirLista(undefined, ['a']).falta.length === 1, 'lista ausente conta como faltando tudo');
  ok(V.conferirLista(['a'], null) === null, 'sem como recomputar, devolve nulo em vez de chutar');
}

// ── B. TORNEIO DIVIDIDO: comparar sem montar INVENTA divergência ─────────────
{
  const crus = [];
  for (let i = 1; i <= 5; i++) crus.push({ uid: 'uid-pessoa-000' + i, displayName: 'P' + i });
  const partes = Split.dividir(JSON.parse(JSON.stringify({ id: 'div', creatorUid: 'uid-criador-0001', participants: crus })));
  const magro = Object.assign({}, partes.config, { _semPesados: ['participants'] });
  magro.memberUids = En.computeMemberUids({ creatorUid: 'uid-criador-0001', participants: crus });

  const semMontar = V.conferirLista(magro.memberUids, En.computeMemberUids(magro));
  ok(semMontar.sobra.length === 5,
    '⛔ comparar o documento MAGRO acusa 5 sobrando que NÃO sobram — foi o meu erro na 1ª medição');

  return Split.montarDoBanco(JSON.parse(JSON.stringify(magro)), async (col, campo) => (campo === 'participants' ? partes.participants : []))
    .then((completo) => {
      const montado = V.conferirLista(magro.memberUids, En.computeMemberUids(completo));
      ok(montado.falta.length === 0 && montado.sobra.length === 0,
        'montando as partes, não há divergência nenhuma — é a comparação honesta');
      return resto();
    });
}

function resto() {
  // ── C. as três listas estão cobertas, e o conferidor não inventa uma quarta ──
  const campos = V.LISTAS.map((x) => x[0]);
  ok(campos.indexOf('adminUids') !== -1 && campos.indexOf('memberUids') !== -1
    && campos.indexOf('adminEmails') !== -1, 'as três listas derivadas estão no conferidor');
  ok(V.LISTAS.length === 3, 'e só elas — lista a mais viraria falso positivo');

  // ── D. o conferidor não roda ao ser importado ─────────────────────────────
  const fonte = require('fs').readFileSync(
    path.join(__dirname, '..', 'functions-autodraw', 'conferir-derivados.js'), 'utf8');
  ok(/if \(require\.main === module\)/.test(fonte),
    '⛔ atrás de require.main — importar num teste não pode mexer no banco');
  ok(/montarDoBanco/.test(fonte), 'e ele monta o torneio dividido antes de comparar');
  ok(/PULADO/.test(fonte),
    '⛔ e PULA o torneio cujas partes não montaram, em vez de acusar divergência que não existe');

  /* ── E. AS DUAS CÓPIAS DO JOGO ────────────────────────────────────────────
   * O mesmo jogo vive na cópia do MOTOR (classifica e avança) e na do CARD (a tela e "Meus
   * Resultados"). Divergirem é a tela mostrar um placar e a classificação usar outro.
   * MEDIDO em 24/set: 270 jogos com as duas cópias, ZERO divergência de vencedor ou placar.
   * O risco é real, o caso não estava acontecendo — e dizer qual dos dois é a diferença. */
  ok(V.conferirJogo({ winner: 'A' }, { winner: 'A' }) === null, 'cópias iguais não divergem');
  ok(/vencedor/.test(V.conferirJogo({ winner: 'A' }, { winner: 'B' }) || ''),
    'vencedor diferente entre motor e card é acusado, com os dois lados na mensagem');
  ok(/placar/.test(V.conferirJogo({ winner: 'A', sets: [[6, 4]] }, { winner: 'A', sets: [[6, 3]] }) || ''),
    'mesmo vencedor e placar diferente também é acusado');
  ok(V.conferirJogo({ winner: 'A' }, { winner: 'A', sets: [[6, 4]] }) === null,
    'placar só num lado NÃO é divergência — é dado que a outra cópia não guarda');

  /* ⛔ O motor guarda jogo em TRÊS lugares. Olhar um só inventa órfão: foi assim que eu
   * "achei" 14 e depois 12, e os 12 são de um torneio encerrado sem conta nenhuma. */
  const t = { matches: [{ id: 'm1' }], rounds: [{ matches: [{ id: 'm2' }],
      monarchGroups: [{ matches: [{ id: 'm3' }] }] }], groups: [{ matches: [{ id: 'm4' }] }],
    thirdPlaceMatch: { id: 'm5' }, phaseRounds: { '1': { rounds: [{ matches: [{ id: 'm6' }] }] } } };
  const mapa = V.jogosDoMotor(t);
  ok(mapa.size === 6 && ['m1','m2','m3','m4','m5','m6'].every((k) => mapa.has(k)),
    '⛔ o coletor acha jogo nos SEIS lugares do motor — inclusive terceiro lugar e fase posterior');

  console.log(fail ? `❌ listas-derivadas-batem-com-os-fatos: ${fail} falha(s), ${pass} ok`
                   : `✅ listas-derivadas-batem-com-os-fatos: ${pass} ok`);
  process.exit(fail ? 1 : 0);
}
