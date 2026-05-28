var _t = window._t || function(k) { return k; };
function renderPreDraw(container, tournamentId) {
  // Resolve tournament ID from param or last active
  const tId = tournamentId || window._lastActiveTournamentId;
  const t = tId && window.AppStore ? window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString()) : null;

  if (!t) {
    container.innerHTML = `
      <div class="card" style="text-align:center; padding: 3rem;">
        <h3 style="color: var(--text-bright);">${_t('predraw.notFound')}</h3>
        <p class="text-muted">${_t('predraw.notFoundMsg')}</p>
        <a href="#dashboard" class="btn btn-primary" style="margin-top:1rem; display:inline-block;">${_t('btn.goDashboard')}</a>
      </div>`;
    return;
  }

  const participants = Array.isArray(t.participants) ? [...t.participants] : Object.values(t.participants || {});
  const standby = Array.isArray(t.standbyParticipants) ? [...t.standbyParticipants] : [];

  // Build categories list
  const cats = (t.categories && t.categories.length) ? [...t.categories] : ['Principal'];

  // Group participants by assigned category (or default to first category)
  const catMap = {};
  cats.forEach(c => catMap[c] = []);
  catMap['Standby'] = [...standby];

  participants.forEach((p, idx) => {
    const name = typeof p === 'string' ? p : (p.displayName || p.name || '');
    const assignedCat = (p.category && catMap[p.category]) ? p.category : cats[0];
    catMap[assignedCat].push({ idx, name, original: p });
  });

  const isElim = t.format === 'Eliminatórias Simples' || t.format === 'Dupla Eliminatória';
  const formatLabel = t.format || 'Eliminatórias Simples';
  const totalParticipants = participants.length;

  const renderCatColumns = () => {
    const activeCats = Object.keys(catMap).filter(c => c !== 'Standby');
    return activeCats.map(catName => {
      const players = catMap[catName];
      const countBadge = players.length;
      return `
        <div class="predraw-column" data-cat="${catName}" style="min-width: 220px; flex: 1; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; overflow: hidden;">
          <div style="padding: 1rem; background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div style="display:flex; align-items:center; gap:8px; flex:1;">
              <span class="badge badge-info" style="font-size:0.75rem; min-width:24px; text-align:center;">${countBadge}</span>
              <span style="font-weight:700; color:var(--text-bright);" id="cat-label-${window._safeHtml(catName)}">${window._safeHtml(catName)}</span>
            </div>
            <div style="display:flex; gap:4px;">
              <button class="btn btn-ghost btn-micro" title="Renomear categoria" onclick="window._renameCat('${catName.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')">✏️</button>
              ${activeCats.length > 1 ? `<button class="btn btn-ghost btn-micro" title="Fundir com outra categoria" onclick="window._mergeCat('${catName.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')">🔀</button>` : ''}
            </div>
          </div>
          <div class="predraw-list" data-cat="${catName}" style="padding: 0.75rem; min-height: 80px; display:flex; flex-direction:column; gap:6px;"
            ondragover="event.preventDefault(); event.dataTransfer.dropEffect='move';"
            ondrop="window._dropToCategory(event, '${catName.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')" >
            ${players.length === 0
              ? `<div class="text-muted" style="text-align:center; padding:1rem; font-size:0.85rem; border: 1px dashed rgba(255,255,255,0.1); border-radius:8px;">${_t('predraw.emptyDrop')}</div>`
              : players.map((p, i) => `
                <div class="predraw-card" draggable="true" data-player-idx="${p.idx}" data-cat="${catName}"
                  style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 8px 12px; cursor: grab; display:flex; align-items:center; justify-content:space-between; gap:8px; transition: all 0.15s;"
                  ondragstart="window._dragStartPlayer(event, ${p.idx}, '${catName}')"
                  ondragend="window._dragEndPlayer(event)"
                  onmouseover="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='var(--primary-color)'"
                  onmouseout="this.style.background='rgba(255,255,255,0.04)'; this.style.borderColor='rgba(255,255,255,0.08)'">
                  <span style="font-size:0.9rem; font-weight:500; color:var(--text-bright); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${window._safeHtml(p.name)}</span>
                  <span style="font-size:0.7rem; color:var(--text-muted); flex-shrink:0;">#${p.idx + 1}</span>
                </div>
              `).join('')
            }
          </div>
        </div>
      `;
    }).join('');
  };

  const standbyHtml = catMap['Standby'].length > 0 ? `
    <div style="margin-top: 1.5rem;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:0.75rem;">
        <h4 style="margin:0; color: var(--text-muted); font-size:0.8rem; text-transform:uppercase; letter-spacing:1px;">${_t('predraw.standbySection', {count: catMap['Standby'].length})}</h4>
      </div>
      <div class="predraw-list" data-cat="Standby" style="background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); border-radius:12px; padding:0.75rem; display:flex; flex-wrap:wrap; gap:6px; min-height:48px;"
        ondragover="event.preventDefault();" ondrop="window._dropToCategory(event, 'Standby')">
        ${catMap['Standby'].map((p, i) => {
          const name = typeof p === 'string' ? p : (p.displayName || p.name || '');
          return `<span style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); padding:4px 10px; border-radius:20px; font-size:0.85rem; color:var(--text-muted);">${window._safeHtml(name)}</span>`;
        }).join('')}
      </div>
    </div>
  ` : '';

  container.innerHTML = `
    ${window._renderBackHeader({ href: '#tournaments/' + t.id, label: _t('btn.back') })}

    <div class="d-flex justify-between align-center mb-4" style="flex-wrap:wrap; gap:1rem;">
      <div>
        <h2 style="margin:0;">${_t('predraw.title')}</h2>
        <p class="text-muted" style="margin:4px 0 0;">${window._safeHtml(t.name)} — ${formatLabel} — ${_t('predraw.enrolledCount', {n: totalParticipants})}</p>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn btn-secondary" onclick="window._addCategoryCol('${window._safeHtml(t.id)}')">${_t('predraw.addCategory')}</button>
        <button class="btn btn-primary" onclick="window._runPreDrawConfirm('${window._safeHtml(t.id)}')">
          <svg style="margin-right:0.5rem;" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          ${_t('predraw.runDraw')}
        </button>
      </div>
    </div>

    <!-- Painel de info -->
    <div style="display:flex; gap:12px; margin-bottom:1.5rem; flex-wrap:wrap;">
      <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:10px; padding:0.75rem 1.25rem; flex:1; min-width:140px;">
        <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">${_t('predraw.statEnrolled')}</div>
        <div style="font-size:1.5rem; font-weight:800; color:var(--text-bright);">${totalParticipants}</div>
      </div>
      <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:10px; padding:0.75rem 1.25rem; flex:1; min-width:140px;">
        <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">${_t('predraw.statCategories')}</div>
        <div style="font-size:1.5rem; font-weight:800; color:var(--text-bright);">${cats.length}</div>
      </div>
      ${isElim ? (() => {
        const n = totalParticipants;
        const isPow2 = n > 0 && (n & (n - 1)) === 0;
        let lo = 1; while (lo * 2 <= n) lo *= 2;
        const hi = lo * 2;
        const status = isPow2
          ? `<div style="font-size:0.85rem; font-weight:700; color:#4ade80;">${_t('predraw.pow2Exact')}</div>`
          : `<div style="font-size:0.75rem; color:#fbbf24; margin-top:2px;">${_t('predraw.pow2Gap', {gap: hi - n, excess: n - lo})}</div>`;
        return `
          <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:10px; padding:0.75rem 1.25rem; flex:1; min-width:140px;">
            <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">${_t('predraw.statBracket')}</div>
            ${status}
          </div>`;
      })() : ''}
      <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:10px; padding:0.75rem 1.25rem; flex:1; min-width:140px;">
        <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">${_t('predraw.statResultBy')}</div>
        <div style="font-size:0.85rem; font-weight:600; color:var(--text-bright);">${
          t.resultEntry === 'players' ? _t('predraw.resultPlayers') :
          t.resultEntry === 'referee' ? _t('predraw.resultReferee') : _t('predraw.resultOrganizer')
        }</div>
      </div>
    </div>

    <!-- Alterar formato antes do sorteio -->
    <div style="background:rgba(99,102,241,0.06); border:1px solid rgba(99,102,241,0.15); border-radius:12px; padding:1rem; margin-bottom:1.5rem; display:flex; align-items:center; gap:1rem; flex-wrap:wrap;">
      <span style="font-size:0.85rem; color:#818cf8; font-weight:600;">${_t('predraw.changeFormat')}</span>
      <select id="predraw-format-select" style="background:var(--bg-card); color:var(--text-bright); border:1px solid rgba(99,102,241,0.3); border-radius:8px; padding:6px 12px; font-size:0.85rem;" onchange="window._preDrawChangeFormat('${t.id}', this.value)">
        <option value="Eliminatórias Simples" ${t.format === 'Eliminatórias Simples' ? 'selected' : ''}>Eliminatórias Simples</option>
        <option value="Dupla Eliminatória" ${t.format === 'Dupla Eliminatória' ? 'selected' : ''}>Dupla Eliminatória</option>
        <option value="Fase de Grupos + Eliminatórias" ${t.format === 'Fase de Grupos + Eliminatórias' ? 'selected' : ''}>Fase de Grupos + Eliminatórias</option>
        <option value="Suíço Clássico" ${t.format === 'Suíço Clássico' ? 'selected' : ''}>Suíço Clássico</option>
        <option value="Liga" ${t.format === 'Liga' ? 'selected' : ''}>Liga</option>
      </select>
    </div>

    <!-- Colunas por categoria (DnD) -->
    <div id="predraw-columns" style="display:flex; gap:1rem; overflow-x:auto; padding-bottom:1rem; align-items:flex-start;">
      ${renderCatColumns()}
    </div>

    ${standbyHtml}
  `;

  // ─── DnD State ───
  window._preDraw = {
    tournamentId: tId,
    catMap,
    participants: [...participants],
    cats: [...cats]
  };

  // ─── DnD handlers ───
  window._dragStartPlayer = function (e, playerIdx, fromCat) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ playerIdx, fromCat }));
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => { if (e.target) e.target.style.opacity = '0.4'; }, 0);
  };

  window._dragEndPlayer = function (e) {
    if (e.target) e.target.style.opacity = '1';
  };

  window._dropToCategory = function (e, toCat) {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      const { playerIdx, fromCat } = data;
      if (fromCat === toCat) return;

      const pd = window._preDraw;
      const playerList = pd.catMap[fromCat];
      const pIdx = playerList.findIndex(p => p.idx === playerIdx);
      if (pIdx === -1) return;

      const [player] = playerList.splice(pIdx, 1);

      if (toCat === 'Standby') {
        pd.catMap['Standby'] = pd.catMap['Standby'] || [];
        pd.catMap['Standby'].push(player.original);
      } else {
        player.original = typeof player.original === 'string'
          ? { name: player.original, displayName: player.original, category: toCat }
          : { ...player.original, category: toCat };
        pd.catMap[toCat].push(player);
      }

      _reRenderPreDrawColumns(tId);
    } catch (err) { window._error(err); }
  };

  window._renameCat = function (oldName) {
    showInputDialog(
      _t('predraw.renameCatTitle'),
      _t('predraw.renameCatMsg', {name: oldName}),
      (newName) => {
        if (!newName || newName === oldName) return;
        const pd = window._preDraw;
        if (pd.catMap[newName]) {
          showAlertDialog(_t('predraw.catExistsTitle'), _t('predraw.catExistsNameMsg', { name: newName }), null, { type: 'warning' });
          return;
        }
        pd.catMap[newName] = pd.catMap[oldName];
        delete pd.catMap[oldName];
        pd.cats = pd.cats.map(c => c === oldName ? newName : c);
        _reRenderPreDrawColumns(tId);
      },
      { placeholder: oldName, defaultValue: oldName }
    );
  };

  window._mergeCat = function (srcCat) {
    const pd = window._preDraw;
    const otherCats = pd.cats.filter(c => c !== srcCat);
    if (otherCats.length === 0) return;

    showConfirmDialog(
      _t('predraw.mergeCatTitle'),
      _t('predraw.mergeCatMsg', {src: srcCat}) +
      `<select id="merge-target-select" style="margin-top:8px; background:var(--bg-card); color:var(--text-bright); border:1px solid var(--border-color); border-radius:8px; padding:6px 12px; width:100%;">${otherCats.map(c => `<option value="${c}">${c}</option>`).join('')}</select>`,
      () => {
        const target = document.getElementById('merge-target-select')?.value || otherCats[0];
        pd.catMap[target] = [...(pd.catMap[target] || []), ...(pd.catMap[srcCat] || [])];
        delete pd.catMap[srcCat];
        pd.cats = pd.cats.filter(c => c !== srcCat);
        _reRenderPreDrawColumns(tId);
      },
      null,
      { type: 'info', confirmText: _t('btn.mergeFuse'), cancelText: _t('btn.cancel') }
    );
  };

  window._addCategoryCol = function (tId) {
    showInputDialog(
      _t('predraw.newCatTitle'),
      _t('predraw.newCatMsg'),
      (name) => {
        if (!name) return;
        const pd = window._preDraw;
        if (pd.catMap[name]) {
          showAlertDialog(_t('predraw.catExistsTitle'), _t('predraw.catExistsSingleMsg', { name: name }), null, { type: 'warning' });
          return;
        }
        pd.catMap[name] = [];
        pd.cats.push(name);
        _reRenderPreDrawColumns(tId);
      },
      { placeholder: _t('predraw.newCatPlaceholder') }
    );
  };

  window._preDrawChangeFormat = function (tId, newFormat) {
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
    if (!t) return;
    t.format = newFormat;
    window.AppStore.logAction(tId, `Formato alterado na Janela Pré-Sorteio para: ${newFormat}`);
    window.FirestoreDB.saveTournament(t);
    showNotification(_t('predraw.formatChanged'), _t('predraw.formatChangedMsg', { format: newFormat }), 'info');
    // Re-render to update info panel
    renderPreDraw(container, tId);
  };

  window._runPreDrawConfirm = function (tId) {
    // Save category assignments back to participants
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
    if (!t) return;
    const pd = window._preDraw;

    // Rebuild participants with category assignments
    const newParticipants = [];
    Object.entries(pd.catMap).forEach(([catName, players]) => {
      if (catName === 'Standby') return;
      players.forEach(p => {
        const updated = typeof p.original === 'string'
          ? { name: p.original, displayName: p.original, category: catName }
          : { ...p.original, category: catName };
        newParticipants.push(updated);
      });
    });

    t.participants = newParticipants;
    t.standbyParticipants = pd.catMap['Standby'] || [];
    if (pd.cats.length > 1 || (pd.cats.length === 1 && pd.cats[0] !== 'Principal')) {
      t.categories = pd.cats.filter(c => c !== 'Standby');
    }
    window.AppStore.logAction(tId, `Janela Pré-Sorteio confirmada: ${newParticipants.length} participante(s) nas chaves`);
    window.FirestoreDB.saveTournament(t);

    window.showIncompleteTeamsPanel(tId);
  };
}

function _reRenderPreDrawColumns(tId) {
  const container = document.getElementById('view-container');
  if (!container) return;
  renderPreDraw(container, tId);
}
