const fs=require('fs');const s=fs.readFileSync('js/views/tournaments-draw-prep.js','utf8');let fail=0;
function ok(v,m){if(v)console.log('✓ '+m);else{fail++;console.error('✗ '+m)}}
function body(name,next){const a=s.indexOf('window.'+name+' = function');const b=s.indexOf(next,a);return s.slice(a,b)}
const create=body('_showPollCreationDialog','// ── Poll Voting UI'),vote=body('_castPollVote','// ── Check for active polls'),close=body('_closePollEarly','// ── Restore enrollments'),reopen=body('_reopenPoll','// ── Apply poll result'),apply=body('_applyPollResult','window._handleP2Option');
[['criação',create],['voto',vote],['fechamento',close],['reabertura',reopen],['aplicação',apply]].forEach(([n,b])=>{ok(/AppStore\.mutate\(/.test(b),n+' usa mutação fresca');ok(!/saveTournament\(|AppStore\.sync\(/.test(b),n+' não grava snapshot inteiro')});
ok(/freshParts/.test(create)&&/pollNotifications/.test(create),'criação deriva destinatários do elenco fresco');
ok(/freshWinner/.test(apply)&&/Promise\.resolve\(resolutionSave\)/.test(apply),'aplicação espera o vencedor fresco antes de disparar ação');
const voteDialog=s.slice(s.indexOf('window._showPollVotingDialog = function'),s.indexOf('// ── Cast a vote'));
ok(/commitTournamentTx/.test(voteDialog)&&/freshPoll/.test(voteDialog)&&!/saveTournament\(/.test(voteDialog),'fechamento automático localiza e fecha a enquete fresca');
if(fail)process.exit(1);
