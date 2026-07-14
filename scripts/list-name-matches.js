/** list-name-matches.js — READ-ONLY (a menos que --delete). Lista/apaga records de
 * matchHistory de um uid onde QUALQUER jogador tem nome = "Nelson"/"Nelson Barth"
 * (simulações) OU nome puramente numérico ("06","08",...). Mesmo com uid.
 *   node scripts/list-name-matches.js --project scoreplace-app --uid <UID> [--delete]
 */
'use strict';
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
function arg(n, d){ const i=process.argv.indexOf(n); if(i===-1)return d; const v=process.argv[i+1]; return (v&&!v.startsWith('--'))?v:true; }
const PROJECT = arg('--project', 'scoreplace-app');
const UID = arg('--uid', null);
const DELETE = process.argv.includes('--delete');
if(!UID){ console.error('faltou --uid'); process.exit(1); }
admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();

function isNelson(n){ return /^\s*nelson(\s+barth)?\s*$/i.test(String(n||'')); }
function isNumeric(n){ return /^\s*0?\d{1,2}\s*$/.test(String(n||'')); }
function flag(n){ return isNelson(n) || isNumeric(n); }

(async function(){
  const snap = await db.collection('users').doc(UID).collection('matchHistory').get();
  const hits = [];
  snap.forEach(function(doc){
    const r = doc.data();
    const players = Array.isArray(r.players) ? r.players : [];
    const bad = players.filter(function(p){ return p && flag(p.name); });
    if(bad.length){
      hits.push({ id: doc.id, type: r.matchType, fin: r.finishedAt||'', score: r.scoreSummary||'',
        names: players.map(function(p){ return (p&&p.name)||'?'; }).join(' | '),
        why: bad.map(function(p){ return p.name; }).join(',') });
    }
  });
  console.log('== ' + PROJECT + ' · uid ' + UID + ' · total matchHistory:', snap.size, '· hits:', hits.length, '==');
  hits.sort(function(a,b){ return String(a.fin).localeCompare(String(b.fin)); });
  hits.forEach(function(h){ console.log(' ❌', h.id, '|', h.type, '|', h.score, '|', h.why, '||', h.names); });
  if(DELETE && hits.length){
    console.log('\n>>> DELETANDO', hits.length, 'docs...');
    let ok=0;
    for(const h of hits){ await db.collection('users').doc(UID).collection('matchHistory').doc(h.id).delete(); ok++; }
    console.log('>>> apagados:', ok, '/', hits.length);
  }
})().then(()=>process.exit(0)).catch(e=>{ console.error(e); process.exit(1); });
