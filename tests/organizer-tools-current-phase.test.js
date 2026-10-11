'use strict';

/*
 * Ferramentas do organizador não podem tomar decisões operacionais pelo
 * rótulo de um torneio inteiro: uma classificatória com pareamento por
 * clusters pode manter os campos legados mesmo depois da eliminatória abrir.
 * O botão manual de rodada deve então desaparecer, sem apagar a ponte de
 * leitura para torneios que ainda não possuem fases canônicas.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments.js'), 'utf8');
const utils = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-utils.js'), 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(utils, sandbox, { filename: 'tournaments-utils.js' });

let pass = 0;
let fail = 0;
function ok(value, message) {
  if (value) { pass++; return; }
  fail++;
  console.error('✗ ' + message);
}

const inClassification = {
  format: 'Suíço Clássico', classifyFormat: 'swiss', currentStage: 'swiss', currentPhaseIndex: 0,
  phases: [{ kind: 'classification', classification: { structure: 'round_robin', pairing: {
    strategy: 'ranking_clusters', entryMode: 'fixed', rematchPolicy: 'exhaust_cluster_before_repeat'
  } } }, { kind: 'elimination', elimination: { bracketType: 'single' } }]
};
const inElimination = Object.assign({}, inClassification, { currentPhaseIndex: 1, currentStage: 'swiss' });

ok(sandbox.window._faseCorrenteEhClassificatoriaPorRodadas(inClassification) === true,
  'classificatória canônica por clusters mantém a ação de rodada');
ok(sandbox.window._faseCorrenteEhClassificatoriaPorRodadas(inElimination) === false,
  'eliminatória atual vence o marcador suíço legado do topo');
const hybridLiga = {
  format: 'Liga', ligaOpenEnrollment: true, currentPhaseIndex: 0,
  phases: [{ kind: 'classification', classification: { structure: 'round_robin' } }, { kind: 'elimination' }]
};
ok(sandbox.window._ligaOpenEnrollmentNaFaseAtual(hybridLiga) === true,
  'inscrição contínua de Liga vale enquanto a classificatória estiver ativa');
ok(sandbox.window._ligaOpenEnrollmentNaFaseAtual(Object.assign({}, hybridLiga, { currentPhaseIndex: 1 })) === false,
  'rótulo Liga no topo não mantém inscrição contínua na eliminatória');
ok(sandbox.window._ligaOpenEnrollmentNaFaseAtual({ format: 'Liga', ligaOpenEnrollment: true }) === true,
  'documento legado sem fases preserva inscrição contínua de Liga');
ok(/const isClassificationRounds = typeof window\._faseCorrenteEhClassificatoriaPorRodadas/.test(source),
  'ferramentas usam a porta canônica de fase atual');
ok(/_ligaOpenEnrollmentNaFaseAtual/.test(source),
  'ferramentas consultam a inscrição contínua da fase atual');
ok(/const isAutoDrawFormat = isClassificationRounds \|\| isLigaAutoDraw;/.test(source),
  'auto-sorteio operacional deriva da fase atual, não de um modo suíço paralelo');
ok(/const isCurrentLeaguePhase = Array\.isArray\(t\.phases\)[\s\S]{0,180}_faseCorrenteEhLiga/.test(source),
  'ações manuais distinguem a Liga do torneio da Liga da fase atual');
ok(/else if \(isCurrentLeaguePhase && t\.drawManual\)/.test(source),
  'Próxima Rodada manual só aparece na classificatória corrente');
ok(/\$\{isCurrentLeaguePhase \? '' : startTournamentBanner\}/.test(source),
  'a eliminatória posterior volta a exibir seu indicador de início');
ok(!/const isSuicoFormat = t\.format === 'Suíço Clássico'/.test(source),
  'não restou detecção local por rótulo suíço na ferramenta');
ok(/const isCurrentClassificationPhase = _currentPhaseForTools && _currentPhaseForTools\.kind/.test(source) &&
   /!isCurrentClassificationPhase\) \? `<button class="btn btn-tool-amber/.test(source),
  'encerrar torneio segue a fase atual e continua disponível na eliminatória de torneio híbrido');

console.log((fail ? '❌' : '✅') + ' organizer-tools-current-phase: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
