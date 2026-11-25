// Structural participant replacement and standings projection, shared by UI and Functions.
(function(root){
  'use strict';
  function key(identity){return identity?.uid?'uid:'+identity.uid:identity?.manualParticipantId?'manual:'+identity.manualParticipantId:'';}
  function sourceOf(edit){return edit.source.participantKind==='account'?{uid:edit.source.participantUid}:{manualParticipantId:edit.source.manualParticipantId};}
  function finished(m){return !!(m && (m.winner || m.winnerId || m.wo || m.draw || m.finishedAt || m.completedAt || m.endedAt || m.courtEndedAt || m.resultAt));}
  function scored(m){return !!(m && (m.liveScored === true || m.setsProgressAt || m.pendingResult || m.score ||
    (Array.isArray(m.sets) && m.sets.length) ||
    ['scoreP1','scoreP2','setsWonP1','setsWonP2','totalGamesP1','totalGamesP2'].some(k=>Number(m[k])>0)));}
  function patchTree(value,change,options){
    options=options || {};
    if(Array.isArray(value)) return value.map(item=>patchTree(item,change,options));
    if(!value || typeof value!=='object' || (Object.getPrototypeOf(value)!==null && Object.getPrototypeOf(value).constructor?.name!=='Object')) return value;
    if(change.categoryId && value.categoryId && String(value.categoryId)!==String(change.categoryId)) return value;
    if(change.category && typeof value.category==='string' && value.category && value.category!==change.category && value.category!==change.categoryId) return value;
    var game=value.id!=null && ('p1' in value || 'team1' in value) && ('p2' in value || 'team2' in value);
    if(game && !options.includeCompleted && finished(value)) return value;
    if(game && options.includeCompleted && change.phaseIndex!=null && Number(value.phaseIndex || 0)!==change.phaseIndex) return value;
    var from=change.from || sourceOf(change),to=change.to || change.newIdentity,old=key(from),target=key(to);
    if(!old || !target) throw new Error('Identidade estrutural obrigatória.');
    var out={};
    Object.keys(value).forEach(function(k){
      out[k]=k==='participantSlotReplacements' || !options.includeCompleted && ['classifCongelada','standings','classification','rankingRows'].includes(k)
        ? value[k] : patchTree(value[k],change,options);
    });
    var hit=false;
    if(from.uid ? value.uid===from.uid : value.manualParticipantId===from.manualParticipantId){
      delete out.uid;delete out.manualParticipantId;
      Object.assign(out,to);out.name=change.newName;out.displayName=change.newName;
      ['email','phone','photoURL','photo','avatarUrl'].forEach(k=>delete out[k]);
      if(out.key===old) out.key=target;if(out.participantKey===old) out.participantKey=target;hit=true;
    }
    function positional(namesKey,uidsKey,slotsKey){
      var names=value[namesKey],uids=value[uidsKey],slots=value[slotsKey];
      if(!Array.isArray(names) && !Array.isArray(uids) && !Array.isArray(slots)) return;
      var localHit=false,n=Array.isArray(names)?names.slice():[],u=Array.isArray(uids)?uids.slice():[],s=Array.isArray(slots)?slots.slice():[];
      for(var i=0;i<Math.max(n.length,u.length,s.length);i++){
        var matches=from.uid ? u[i]===from.uid || s[i]===old : s[i]===old ||
          (!u[i] && !s[i] && change.allowManualNameFallback && n[i]===change.oldName);
        if(!matches) continue;
        n[i]=change.newName;u[i]=to.uid || null;s[i]=target;hit=true;localHit=true;
      }
      if(localHit){out[namesKey]=n;out[uidsKey]=u;out[slotsKey]=s;}
    }
    positional('players','playersUids','playersSlotIds');
    positional('team1','team1Uids','team1SlotIds');positional('team2','team2Uids','team2SlotIds');
    ['p1','p2'].forEach(function(slot){
      var match=from.uid ? value[slot+'Uid']===from.uid : value[slot+'ManualId']===from.manualParticipantId || value[slot+'SlotId']===old;
      if(match){
        delete out[slot+'Uid'];delete out[slot+'ManualId'];
        if(to.uid) out[slot+'Uid']=to.uid;else out[slot+'ManualId']=to.manualParticipantId;
        if(slot+'SlotId' in value) out[slot+'SlotId']=target;
        if(slot+'Name' in value) out[slot+'Name']=change.newName;
        ['Email','Phone','Photo','PhotoURL'].forEach(k=>delete out[slot+k]);
        if(typeof value[slot]==='string' && !Array.isArray(value['team'+slot.slice(1)])) out[slot]=change.newName;
        hit=true;
      }
      var teamKey='team'+slot.slice(1)+'Obj';
      if(game && out[teamKey] && JSON.stringify(out[teamKey])!==JSON.stringify(value[teamKey]))
        out[slot]=out[teamKey].displayName || out[teamKey].name || out[slot];
      var members=out['team'+slot.slice(1)];
      if(Array.isArray(members) && JSON.stringify(members)!==JSON.stringify(value['team'+slot.slice(1)])) out[slot]=members.join(' / ');
    });
    if(change.source?.fixedPairId && change.newPairId && value.fixedPairId===change.source.fixedPairId) out.fixedPairId=change.newPairId;
    if(hit && !game && (value.p1Name || value.p2Name)){
      if('name' in value) out.name=[out.p1Name,out.p2Name].filter(Boolean).join(' / ');
      if('displayName' in value) out.displayName=[out.p1Name,out.p2Name].filter(Boolean).join(' / ');
    }
    if(game && options.includeCompleted) {
      if(value.winner===value.p1) out.winner=out.p1;
      else if(value.winner===value.p2) out.winner=out.p2;
    }
    if(game && Array.isArray(value.playerUids) && JSON.stringify(out)!==JSON.stringify(value))
      out.playerUids=Array.from(new Set([...(out.team1Uids || []),...(out.team2Uids || []),out.p1Uid,out.p2Uid].filter(Boolean)));
    var changed=JSON.stringify(out)!==JSON.stringify(value);
    if(game && changed && !options.allowPlaying && !finished(value) && scored(value)) throw new Error('Há uma partida com placar parcial. Termine ou corrija a partida antes da troca.');
    return out;
  }
  function projectStandings(group,t,category){
    var events=t?.participantSlotReplacements?.events || [];
    var games=group.matches || group.rounds?.[0]?.matches || [];
    var phase=Number(games[0]?.phaseIndex || group.phaseIndex || 0),result=group;
    events.forEach(function(event){
      if(!['inherit','reset'].includes(event.pointsPolicy) || (group.phaseIndex!=null && event.phaseIndex!==phase) ||
          ((category || group.category || group.categoryId) && String(event.category || '')!==String(category || group.category || '') && String(event.categoryId)!==String(category || group.categoryId || ''))) return;
      // A campanha retirada conserva a identidade na cópia de cálculo. O rótulo
      // temporário separa homônimos nos agregadores que ainda indexam duplas por nome.
      // Nenhum desses rótulos é escrito no torneio ou exibido como classificado.
      var projection=event.pointsPolicy==='reset' ? Object.assign({},event,{to:event.from,newName:retiredLabel(event)}) : event;
      result=patchTree(result,projection,{includeCompleted:true,allowPlaying:true});
    });
    return result;
  }
  function retiredLabel(event){return event.oldName+' · inscrição anterior ('+key(event.from)+')';}
  function eligibleRows(rows,t,category){
    var events=t?.participantSlotReplacements?.events || [];
    return rows.filter(function(row){return !events.some(function(event){
      if(event.phaseIndex!==Number(t.currentPhaseIndex || 0) ||
          (category && String(event.category || '')!==String(category || '') && String(event.categoryId)!==String(category || ''))) return false;
      if(row.uid) return event.from.uid===row.uid;
      var members=[1,2,3,4].filter(i=>row['p'+i+'Uid'] || row['p'+i+'ManualId']);
      if(members.length) return members.some(i=>event.from.uid ? row['p'+i+'Uid']===event.from.uid : row['p'+i+'ManualId']===event.from.manualParticipantId);
      return row.name===retiredLabel(event) || String(row.name || '').split(' / ').includes(retiredLabel(event));
    });});
  }
  function appendEvent(t,event){
    var events=t.participantSlotReplacements?.events || [];
    if(events.length>=200) throw new Error('Limite de substituições atingido; nenhuma alteração foi gravada.');
    if(!['inherit','reset'].includes(event.pointsPolicy) || !key(event.from) || !key(event.to) || key(event.from)===key(event.to)) throw new Error('Escolha a política de pontuação e as identidades da troca.');
    if(events.some(e=>e.phaseIndex===event.phaseIndex && e.categoryId===event.categoryId && key(e.from)===key(event.to))) throw new Error('A troca formaria um ciclo de identidades.');
    return {schema:1,events:events.concat(event)};
  }
  function assertBudget(writes,documents){
    if(!Number.isSafeInteger(writes) || writes>450) throw new Error('A troca excede o limite de uma transação; nenhuma alteração foi gravada.');
    if(documents.some(doc=>{var json=JSON.stringify(doc),bytes=0;for(var ch of json){var cp=ch.codePointAt(0);bytes+=cp<128?1:cp<2048?2:cp<65536?3:4;}return bytes*2+(json.match(/"[^"]*"\s*:/g) || []).length*32+4096>900000;})) throw new Error('Um documento excede o limite seguro para esta troca; nenhuma alteração foi gravada.');
  }
  var api={key:key,sourceOf:sourceOf,finished:finished,scored:scored,patchTree:patchTree,projectStandings:projectStandings,eligibleRows:eligibleRows,appendEvent:appendEvent,assertBudget:assertBudget};
  root.ScoreplaceParticipantSlots=api;
  if(typeof module!=='undefined' && module.exports) module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
