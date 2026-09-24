'use strict';

/* A renomeação do organizador não é cosmética: nomes antigos existem no elenco,
 * jogos, classificação e listas auxiliares. Este núcleo puro é usado só pela CF,
 * para que uma aba atrasada nunca regrave a fotografia inteira do torneio. */
function _same(v, oldName) { return typeof v === 'string' && v.trim() === oldName; }
function _replaceLabel(v, oldName, newName) {
  if (typeof v !== 'string') return v;
  if (_same(v, oldName)) return newName;
  if (v.indexOf(' / ') === -1) return v;
  return v.split(' / ').map(x => _same(x, oldName) ? newName : x.trim()).join(' / ');
}
function _replaceNameFields(obj, oldName, newName, fields) {
  let changed = false;
  if (!obj || typeof obj !== 'object') return changed;
  fields.forEach((field) => {
    const next = _replaceLabel(obj[field], oldName, newName);
    if (next !== obj[field]) { obj[field] = next; changed = true; }
  });
  return changed;
}
function _matchesIdentity(p, oldName, uid) {
  if (typeof p === 'string') return !uid && p.split(' / ').some(x => _same(x, oldName));
  if (!p || typeof p !== 'object') return false;
  const ids = [p.uid, p.p1Uid, p.p2Uid].concat(Array.isArray(p.participants) ? p.participants.map(x => x && x.uid) : []).filter(Boolean).map(String);
  if (uid) return ids.indexOf(uid) !== -1;
  const names = [p.displayName, p.name, p.p1Name, p.p2Name].concat(Array.isArray(p.participants) ? p.participants.map(x => x && (x.displayName || x.name)) : []).filter(Boolean);
  return names.some(x => _same(x, oldName));
}
function _forEachMatch(t, fn) {
  const seen = new Set();
  const visit = (m) => { if (m && typeof m === 'object' && !seen.has(m)) { seen.add(m); fn(m); } };
  (Array.isArray(t.matches) ? t.matches : []).forEach(visit);
  (Array.isArray(t.rounds) ? t.rounds : []).forEach(r => {
    if (!r) return;
    if (Array.isArray(r.matches)) r.matches.forEach(visit);
    if (Array.isArray(r.monarchGroups)) r.monarchGroups.forEach(g => { if (g && Array.isArray(g.matches)) g.matches.forEach(visit); });
  });
  (Array.isArray(t.groups) ? t.groups : []).forEach(g => {
    if (!g) return;
    if (Array.isArray(g.matches)) g.matches.forEach(visit);
    if (Array.isArray(g.monarchGroups)) g.monarchGroups.forEach(mg => { if (mg && Array.isArray(mg.matches)) mg.matches.forEach(visit); });
    if (Array.isArray(g.rounds)) g.rounds.forEach(gr => {
      if (Array.isArray(gr)) gr.forEach(visit); else if (gr && Array.isArray(gr.matches)) gr.matches.forEach(visit);
    });
  });
  if (t.phaseRounds && typeof t.phaseRounds === 'object') Object.keys(t.phaseRounds).forEach(k => {
    const slot = t.phaseRounds[k];
    if (slot && Array.isArray(slot.rounds)) slot.rounds.forEach(r => { if (r && Array.isArray(r.matches)) r.matches.forEach(visit); });
  });
  if (t.thirdPlaceMatch) visit(t.thirdPlaceMatch);
  (Array.isArray(t.rodadas) ? t.rodadas : []).forEach(r => {
    if (Array.isArray(r)) r.forEach(visit);
    else if (r && Array.isArray(r.matches)) r.matches.forEach(visit);
    else if (r && Array.isArray(r.jogos)) r.jogos.forEach(visit);
  });
}
/* ⛔⛔ ENTRADA-OBJETO MUDA POR DENTRO — COMPARAR REFERÊNCIA NÃO VÊ (24/set/2026).
 * Esta função renomeia o objeto NO LUGAR e devolve o MESMO objeto. Quem detectava a
 * mudança por `next !== antes` só enxergava as entradas que são STRING. Nas listas
 * auxiliares (espera, reservas, sorteio realizado) a entrada pode ser objeto: o nome era
 * trocado na memória e a raiz ficava FORA do `update` — ou seja, a gravação não levava
 * a lista, e quem estava na espera continuava com o nome velho no banco.
 * ⛔ Por isso a mudança é REPORTADA, não deduzida. [[feedback_a_defesa_vaza_pela_borda]] */
function _renameEntradaComAviso(p, oldName, newName) {
  if (typeof p === 'string') { const v = _replaceLabel(p, oldName, newName); return { valor: v, mudou: v !== p }; }
  if (!p || typeof p !== 'object') return { valor: p, mudou: false };
  let mudou = _replaceNameFields(p, oldName, newName, ['displayName', 'name', 'p1Name', 'p2Name']);
  if (Array.isArray(p.participants)) p.participants.forEach(x => { if (_replaceNameFields(x, oldName, newName, ['displayName', 'name'])) mudou = true; });
  return { valor: p, mudou: mudou };
}
function _renameParticipantEntry(p, oldName, newName) {
  return _renameEntradaComAviso(p, oldName, newName).valor;
}
/* ⛔⛔ O RÓTULO TEM DE SER DE UMA PESSOA SÓ (24/set/2026).
 * A substituição abaixo é GLOBAL por rótulo: ela troca `oldName` em cada entrada do
 * elenco, em cada jogo, dupla, grupo e mapa. O `uid` só servia para ACHAR o alvo —
 * depois dele, o laço não olhava uid nenhum. Dois inscritos chamados "Ana", com contas
 * diferentes, tinham os DOIS rótulos trocados: perda de dado, silenciosa, em jogo já
 * realizado. Dado histórico que só guarda NOME não permite escolher qual lado do jogo
 * muda — por isso a recusa é a resposta certa, e não um palpite.
 * ⛔ Falhar FECHADO, ANTES de tocar em qualquer estrutura. [[project_uid_identity_canon_locked]] */
function _uidsQueCarregamORotulo(t, oldName) {
  const uids = new Set();
  let semUid = 0;
  /* ⛔ O rótulo não mora só no elenco. A substituição global também varre a lista de
   * espera, as reservas e o sorteio realizado — se um homônimo estiver LÁ e só o elenco
   * fosse conferido, a trava passava e o nome de outra pessoa era trocado assim mesmo.
   * Conferir exatamente as mesmas listas que a mutação alcança.
   * [[feedback_enumerar_todos_os_caminhos_antes_de_dar_por_pronto]] */
  /* ⚠️ Entrada SEM uid só conta como "outra pessoa" quando vem do ELENCO. Nas listas
   * auxiliares o normal é a entrada ser um RÓTULO de texto ("Fulano / Beltrano") da mesma
   * pessoa que já está no elenco — contá-la como principal recusaria toda renomeação de
   * quem já foi sorteado, que é quase todo mundo. Uid diferente, esse sim, conta de onde
   * quer que venha. */
  const listas = [];
  if (t && typeof t === 'object' && !Array.isArray(t)) {
    if (Array.isArray(t.participants)) listas.push({ arr: t.participants, elenco: true });
    ['waitlist', 'standbyParticipants', 'sorteioRealizado'].forEach((k) => {
      if (Array.isArray(t[k])) listas.push({ arr: t[k], elenco: false });
    });
  } else if (Array.isArray(t)) { listas.push({ arr: t, elenco: true }); }
  listas.forEach((lista) => lista.arr.forEach((p) => {
    const contaSemUid = lista.elenco;
    if (typeof p === 'string') { if (contaSemUid && p.split(' / ').some(x => _same(x, oldName))) semUid++; return; }
    if (!p || typeof p !== 'object') return;
    const pares = [[p.displayName, p.uid], [p.name, p.uid], [p.p1Name, p.p1Uid], [p.p2Name, p.p2Uid]];
    if (Array.isArray(p.participants)) p.participants.forEach(x => { if (x) pares.push([x.displayName || x.name, x.uid]); });
    pares.forEach(([nome, u]) => {
      if (!_same(nome, oldName)) return;
      if (u) uids.add(String(u)); else if (contaSemUid) semUid++;
    });
  }));
  return { uids: Array.from(uids), semUid: semUid };
}
function renameTournamentParticipant(t, input) {
  const oldName = String(input && input.oldName || '').trim();
  const newName = String(input && input.newName || '').trim();
  const uid = String(input && input.uid || '').trim();
  if (!oldName || !newName) throw new Error('nome inválido');
  if (oldName === newName) return { changed: false, update: {} };
  if (newName.length > 160) throw new Error('nome muito longo');
  const roster = Array.isArray(t.participants) ? t.participants : [];
  const candidates = roster.filter(p => _matchesIdentity(p, oldName, uid));
  if (!candidates.length) throw new Error('participante não está inscrito');
  if (!uid && candidates.length !== 1) throw new Error('nome ambíguo: selecione o participante pelo cadastro');
  /* Recusa fechada ANTES de qualquer mutação — ver o bloco acima. */
  const _portadores = _uidsQueCarregamORotulo(t, oldName);
  const _outros = _portadores.uids.filter(u => u !== uid);
  if (uid && (_outros.length > 0 || _portadores.semUid > 0)) {
    throw new Error('há mais de um inscrito com esse nome: renomeie pelo cadastro de cada um, um de cada vez');
  }
  if (!uid && (_portadores.uids.length + _portadores.semUid) > 1) {
    throw new Error('há mais de um inscrito com esse nome: renomeie pelo cadastro de cada um, um de cada vez');
  }
  /* O nome NOVO também não pode ser de outra pessoa: a troca global fundiria os dois
   * rótulos e nenhum dos dois jogos saberia mais de quem era. */
  const _donosDoNovo = _uidsQueCarregamORotulo(t, newName);
  if (_donosDoNovo.uids.some(u => u !== uid) || (_donosDoNovo.semUid > 0 && !uid) ||
      (_donosDoNovo.semUid > 0 && uid)) {
    throw new Error('já há outro inscrito com esse nome neste torneio');
  }
  const changed = new Set();
  const mark = k => changed.add(k);
  roster.forEach((p, i) => { const next = _renameParticipantEntry(p, oldName, newName); if (next !== p) { roster[i] = next; mark('participants'); } else if (typeof p === 'object' && p && _matchesIdentity(p, oldName, uid)) mark('participants'); });
  let matchChanged = false;
  _forEachMatch(t, m => {
    if (_replaceNameFields(m, oldName, newName, ['p1', 'p2', 'winner'])) matchChanged = true;
    ['team1', 'team2'].forEach(k => {
      if (!Array.isArray(m[k])) return;
      const next = m[k].map(n => _replaceLabel(n, oldName, newName));
      if (next.some((x, i) => x !== m[k][i])) { m[k] = next; matchChanged = true; }
    });
  });
  // Jogos podem morar em qualquer uma destas árvores. Persistir todas as raízes
  // afetadas deixa o tradutor de partes calcular o diff sem adivinhar a origem.
  if (matchChanged) ['matches', 'rounds', 'groups', 'phaseRounds', 'thirdPlaceMatch', 'rodadas'].forEach(k => { if (t[k] !== undefined) mark(k); });
  (Array.isArray(t.groups) ? t.groups : []).forEach(g => {
    if (g && Array.isArray(g.players)) { const next = g.players.map(n => _replaceLabel(n, oldName, newName)); if (next.some((x, i) => x !== g.players[i])) { g.players = next; mark('groups'); } }
  });
  ['checkedIn', 'absent', 'vips', 'classification'].forEach(k => {
    const map = t[k]; if (!map || typeof map !== 'object' || Array.isArray(map)) return;
    Object.keys(map).forEach(key => { const next = _replaceLabel(key, oldName, newName); if (next !== key) { map[next] = map[key]; delete map[key]; mark(k); } });
  });
  if (Array.isArray(t.standings)) t.standings.forEach(s => { if (_replaceNameFields(s, oldName, newName, ['name', 'player'])) mark('standings'); });
  ['sorteioRealizado', 'waitlist', 'standbyParticipants'].forEach(k => {
    if (!Array.isArray(t[k])) return;
    const before = t[k];
    let mudouAlguma = false;
    const next = before.map((p) => { const r = _renameEntradaComAviso(p, oldName, newName); if (r.mudou) mudouAlguma = true; return r.valor; });
    if (mudouAlguma) { t[k] = next; mark(k); }
  });
  const update = {};
  changed.forEach(k => { update[k] = t[k]; });
  return { changed: changed.size > 0, update };
}
module.exports = { renameTournamentParticipant };
