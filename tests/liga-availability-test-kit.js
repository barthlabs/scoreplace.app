'use strict';
const { applyLigaAvailability } = require('../functions/liga-availability-core');
const win = require('../functions-autodraw/draw-core')._window;
function ok(v,m,state){if(v){state.pass++;console.log('  ✓ '+m);}else{state.fail++;console.error('  ✗ '+m);}}
function base(opts={}) { return { id:'T', participants:opts.participants||[{uid:'u-a',displayName:'Ana',ligaActive:false}], standbyParticipants:opts.standbyParticipants||[], waitlist:opts.waitlist||[], monarchWaitlist:opts.monarchWaitlist||{}, rounds:opts.rounds===undefined?[{matches:[],monarchGroups:[]}]:opts.rounds }; }
function run(t,uid,active){return applyLigaAvailability(t,uid,active,win);}
module.exports={ok,base,run,win};
