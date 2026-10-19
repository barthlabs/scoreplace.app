/* Importação assistida de inscrições externas. Nenhum arquivo ou OCR grava o torneio. */
(function () {
  'use strict';
  var state = null;
  var nextViewKey = 1;
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function el() { return document.getElementById('tournament-import-dialog'); }
  function callable(name, data) {
    if (typeof window._callCF !== 'function') return Promise.reject(new Error('Transporte autenticado indisponível'));
    var authMessage = 'Entre na sua conta para importar inscritos.';
    var result;
    if (name === 'previewTournamentImport') result = window._callCF('previewTournamentImport', data, authMessage);
    else if (name === 'extractTournamentImportImage') result = window._callCF('extractTournamentImportImage', data, authMessage);
    else if (name === 'searchTournamentImportCandidates') result = window._callCF('searchTournamentImportCandidates', data, authMessage);
    else if (name === 'applyTournamentImportBlock') result = window._callCF('applyTournamentImportBlock', data, authMessage);
    else return Promise.reject(new Error('Porta de importação desconhecida'));
    return result.then(function (response) { return response.data; });
  }
  function categories(t) {
    return (Array.isArray(t.categoryDefinitions) ? t.categoryDefinitions : []).map(function (item) {
      return { id: String(item.id || ''), label: String(item.label || item.name || item.id || '') };
    }).filter(function (item) { return item.id; });
  }
  function report(message) { if (state) { state.message = message; render(); } }
  function rowMarkup(row, idx, plan) {
    var disabled = row.saved || state.busy ? ' disabled' : '';
    var category = state.categories.find(function (item) { return item.id === row.categoryId; });
    var people = row.people.map(function (person, side) {
      var hasCandidates = (person.candidates || []).length > 0;
      var decision = person.uid ? '✓ Conta vinculada: ' + (person.chosenName || person.uid)
        : person.uid === null ? 'Sem conta vinculada — vínculo só após aceite da pessoa'
          : person.lookupStatus === 'loading' ? 'Buscando conta…'
            : person.lookupStatus === 'error' ? 'Busca falhou — tente novamente'
              : hasCandidates ? 'Conta provável — confirme uma opção'
                : person.lookupStatus === 'invalid' ? 'Digite pelo menos 3 letras para buscar' : 'Nenhuma conta provável';
      var hits = (person.candidates || []).map(function (candidate, candidateIndex) {
        return '<button type="button" class="sp-import-candidate" data-act="choose" data-row="' + idx + '" data-side="' + side + '" data-token="' + esc(person.lookupToken) + '" data-candidate="' + candidateIndex + '"' + disabled + '>' + esc(candidate.name) + '</button>';
      }).join('');
      return '<div class="sp-import-person' + (hasCandidates && person.uid === undefined ? ' sp-import-person-match' : '') + '" data-person="' + row.viewKey + '-' + side + '" tabindex="-1">' +
        '<div class="sp-import-person-name">' + esc(person.name) + '</div>' +
        '<div class="sp-import-decision">' + esc(decision) + '</div>' +
        (!row.saved && !state.busy && person.uid === undefined && hasCandidates ? '<div class="sp-import-candidates">' + hits + '<button type="button" data-act="none" data-row="' + idx + '" data-side="' + side + '">Nenhum destes</button></div>' : '') +
        (!row.saved && !state.busy ? '<details class="sp-import-edit" data-edit-key="' + row.viewKey + '-' + side + '"><summary>Corrigir nome</summary>' +
          '<label class="sp-import-field">Nome<input data-act="name" data-row="' + idx + '" data-side="' + side + '" value="' + esc(person.name) + '"></label></details>' : '') +
      '</div>';
    }).join('');
    return '<section class="sp-import-pair">' +
      '<div class="sp-import-pair-head"><strong>Dupla ' + esc(row.ordinal || idx + 1) + '</strong>' +
      '<span class="sp-import-category">' + esc(category ? category.label : 'Categoria não identificada') + '</span>' +
      (row.saved ? '<span class="sp-import-saved">✓ Gravada</span>' : '<button type="button" data-act="remove" data-row="' + idx + '"' + disabled + '>Remover</button>') + '</div>' +
      '<div class="sp-import-people">' + people + '</div>' +
      (plan && plan.error ? '<p class="sp-import-error" role="alert">' + esc(plan.error) + '</p>' : '') +
      (plan && plan.slot ? '<div class="sp-import-destination">Vaga ' + esc(plan.slot.members.map(function (m) { return m.name; }).sort(function (a, b) {
        return window.TournamentImportAllocation.playerNumber(a) - window.TournamentImportAllocation.playerNumber(b);
      }).join(' + ')) + '</div>' : '') + '</section>';
  }
  function render() {
    var box = el(); if (!box || !state) return;
    var oldPanel = box.querySelector && box.querySelector('.sp-import-panel');
    var oldScroll = oldPanel ? oldPanel.scrollTop : 0;
    var opened = new Set();
    if (oldPanel && oldPanel.querySelectorAll) {
      oldPanel.querySelectorAll('details[open]').forEach(function (detail) {
        opened.add(detail.dataset.editKey || (detail.classList.contains('sp-import-help') ? 'help' : ''));
      });
    }
    var focused = document.activeElement;
    var focusData = focused && box.contains(focused) && focused.dataset ? {
      act: focused.dataset.act, row: focused.dataset.row, side: focused.dataset.side,
      candidate: focused.dataset.candidate, value: focused.value,
      start: focused.selectionStart, end: focused.selectionEnd,
      personKey: focused.closest && focused.closest('[data-person]') && focused.closest('[data-person]').dataset.person,
    } : null;
    var resetScroll = state.resetScroll || state.renderedPage !== state.page;
    var start = state.page * 8, visible = state.rows.slice(start, start + 8);
    var plans = state.preview ? window.TournamentImportAllocation.allocate(state.rows, state.preview.slots) : [];
    var content = !state.preview ? '<p class="sp-import-lead">Consultando vagas atuais…</p>' :
      '<div class="sp-import-summary"><span><strong>' + state.preview.count + '</strong> inscritos</span><span><strong>' + state.preview.slots.length + '</strong> duplas para preencher</span></div>' +
      '<p class="sp-import-lead">Envie fotos ou planilhas. Confira cada dupla antes de gravar.</p>' +
      '<div class="sp-import-upload-area">' +
        '<input id="tournament-import-files" class="sr-only" type="file" multiple accept="' + (state.preview.photoImportEnabled ? 'image/jpeg,image/png,image/webp,' : '') + '.csv,.tsv,.xls,.xlsx" aria-label="Fotos ou planilhas de inscritos">' +
        '<label class="sp-import-upload" for="tournament-import-files">📄 Selecionar arquivos</label>' +
        '<p class="sp-import-disclosure">' + (state.preview.photoImportEnabled
          ? 'Fotos são enviadas ao Google Cloud Vision somente após sua confirmação. Planilhas são lidas neste dispositivo.'
          : 'Fotos indisponíveis no momento. Planilhas são lidas neste dispositivo.') + '</p>' +
      '</div>' +
      '<details class="sp-import-help"><summary>Como funciona</summary><p>As duplas seguem a ordem do arquivo e ocupam as vagas da mesma categoria automaticamente. A importação não vincula contas; cada pessoa decide esse vínculo por convite. Nada é gravado antes da sua confirmação.</p></details>' +
      '<div class="sp-import-toolbar"><span>' + state.rows.length + ' na prévia · ' + state.rows.filter(function (r) { return r.saved; }).length + ' gravadas</span></div>' +
      visible.map(function (row, i) { return rowMarkup(row, start + i, plans[start + i]); }).join('') +
      (state.rows.length > 8 ? '<div class="sp-import-pagination"><button type="button" data-act="prev"' + (state.page === 0 ? ' disabled' : '') + '>Anterior</button><span>Página ' + (state.page + 1) + ' de ' + Math.ceil(state.rows.length / 8) + '</span><button type="button" data-act="next"' + (start + 8 >= state.rows.length ? ' disabled' : '') + '>Próxima</button></div>' : '') +
      '<button type="button" class="sp-import-save" data-act="save"' + (state.busy || !state.rows.some(function (r) { return !r.saved; }) ? ' disabled' : '') + '>Gravar duplas revisadas</button>';
    box.innerHTML = '<div class="sp-import-panel">' +
      '<div class="sp-import-header"><h2 id="tournament-import-title">Importar inscritos</h2><button type="button" data-act="close" aria-label="Fechar"' + (state.saving ? ' disabled' : '') + '>×</button></div>' +
      (state.message ? '<p role="status" class="sp-import-status">' + esc(state.message) + '</p>' : '') + content + '</div>';
    var newPanel = box.querySelector && box.querySelector('.sp-import-panel');
    if (newPanel) {
      newPanel.querySelectorAll('details').forEach(function (detail) {
        if (opened.has(detail.dataset.editKey || (detail.classList.contains('sp-import-help') ? 'help' : ''))) detail.open = true;
      });
      newPanel.scrollTop = resetScroll ? 0 : Math.min(oldScroll, Math.max(0, newPanel.scrollHeight - newPanel.clientHeight));
      if (focusData && focusData.act) {
        var selector = '[data-act="' + focusData.act + '"][data-row="' + focusData.row + '"][data-side="' + focusData.side + '"]';
        if (focusData.candidate !== undefined) selector += '[data-candidate="' + focusData.candidate + '"]';
        var target = newPanel.querySelector(selector);
        if ((!target || target.disabled) && focusData.personKey) target = newPanel.querySelector('[data-person="' + focusData.personKey + '"]');
        if (target && typeof target.focus === 'function') {
          if (target.value !== undefined && focusData.value !== undefined && target.dataset.act === focusData.act) target.value = focusData.value;
          target.focus({ preventScroll: true });
          if (typeof target.setSelectionRange === 'function' && typeof focusData.start === 'number') {
            try { target.setSelectionRange(focusData.start, focusData.end); } catch (_error) {}
          }
        }
      }
      if (state.focusPersonKey) {
        var postRemoval = newPanel.querySelector('[data-person="' + state.focusPersonKey + '"]');
        if (postRemoval) postRemoval.focus({ preventScroll: true });
      }
      newPanel.scrollTop = resetScroll ? 0 : Math.min(oldScroll, Math.max(0, newPanel.scrollHeight - newPanel.clientHeight));
    }
    state.focusPersonKey = '';
    state.renderedPage = state.page;
    state.resetScroll = false;
  }
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'js/vendor/xlsx.full.min.js?v=0.20.3';
      script.onload = function () { window.XLSX ? resolve(window.XLSX) : reject(new Error('Leitor de planilhas indisponível')); };
      script.onerror = function () { reject(new Error('Leitor de planilhas indisponível')); };
      document.head.appendChild(script);
    });
  }
  function imageBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Não foi possível ler a foto')); };
      reader.onload = function () { resolve(String(reader.result || '').split(',')[1] || ''); };
      reader.readAsDataURL(file);
    });
  }
  async function processFiles(files) {
    if (!state.preview) return;
    var session = state;
    state.busy = true; report('Lendo ' + files.length + ' arquivo(s)…');
    var added = 0, ignored = 0, imported = [];
    try {
      for (var file of files) {
        var parsed;
        if (/^image\/(jpeg|png|webp)$/.test(file.type)) {
          if (file.size > 4 * 1024 * 1024) throw new Error(file.name + ': foto acima de 4 MB');
          if (!state.preview.photoImportEnabled) throw new Error('Leitura de fotos indisponível');
          if (!window.confirm('Enviar a foto "' + file.name + '" ao Google Cloud Vision para extrair os nomes? A foto pode conter dados pessoais. Ela não será salva no Scoreplace; revise todos os resultados antes de gravar.')) {
            throw new Error('Envio da foto cancelado');
          }
          var result = await callable('extractTournamentImportImage', {
            tournamentId: state.tournamentId, mime: file.type, visionConsent: true, imageBase64: await imageBase64(file),
          });
          if (state !== session) return;
          parsed = window.TournamentImportParser.parsePhotoText(result.text, state.categories);
        } else if (/\.(csv|tsv|xlsx|xls)$/i.test(file.name)) {
          if (file.size > 10 * 1024 * 1024) throw new Error(file.name + ': planilha acima de 10 MB');
          var xlsx = await loadXlsx();
          var book = xlsx.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellFormula: false });
          if (state !== session) return;
          parsed = { rows: [], ignored: [] };
          book.SheetNames.forEach(function (sheetName) {
            var matrix = xlsx.utils.sheet_to_json(book.Sheets[sheetName], { header: 1, raw: false, blankrows: false });
            var next = window.TournamentImportParser.parseMatrix(matrix, state.categories);
            parsed.rows.push.apply(parsed.rows, next.rows);
            parsed.ignored.push.apply(parsed.ignored, next.ignored);
          });
        } else throw new Error(file.name + ': formato não suportado');
        parsed.rows.forEach(function (row) { row.source = file.name + ' · ' + row.source; row.viewKey = nextViewKey++; row.people.forEach(function (p) { p.uid = null; }); });
        state.rows.push.apply(state.rows, parsed.rows);
        imported.push.apply(imported, parsed.rows);
        added += parsed.rows.length; ignored += parsed.ignored.length;
      }
      state.message = added + ' duplas na ordem dos arquivos, sem vincular contas. Confira os nomes antes de gravar.' +
        (ignored ? ' ' + ignored + ' linha(s) não interpretada(s).' : '');
      state.page = 0;
      state.resetScroll = true;
      render();
    } catch (error) { if (state === session) state.message = error.message + '. Nenhuma inscrição foi gravada.'; }
    if (state !== session) return;
    state.busy = false; render();
  }
  async function searchPerson(row, side) {
    var person = row.people[side];
    if (person.uid === null && person.autoNoAccount) { person.uid = undefined; person.autoNoAccount = false; }
    var query = String(person.query || person.name || '').trim();
    var token = (person.lookupToken || 0) + 1;
    person.lookupToken = token;
    if (query.length < 3 || query.length > 80) { person.candidates = []; person.lookupStatus = 'invalid'; if (!state.busy) render(); return; }
    var key = state.tournamentId + '|' + query.toLocaleLowerCase('pt-BR');
    var cache = state.candidateCache;
    person.lookupStatus = 'loading'; if (!state.busy) render();
    try {
      if (!cache.has(key)) cache.set(key,
        callable('searchTournamentImportCandidates', { tournamentId: state.tournamentId, query: query })
          .catch(function (error) { cache.delete(key); throw error; }));
      var result = await cache.get(key);
      if (!state || !state.rows.includes(row) || row.people[side] !== person || person.lookupToken !== token) return;
      if (!result || typeof result !== 'object' || !Array.isArray(result.candidates)) {
        cache.delete(key);
        person.candidates = []; person.lookupStatus = 'error'; if (!state.busy) render(); return;
      }
      person.candidates = result.candidates;
      if (person.candidates.length && person.uid === null) { person.uid = undefined; person.autoNoAccount = false; }
      if (!person.candidates.length && person.uid === undefined) { person.uid = null; person.autoNoAccount = true; }
      person.lookupStatus = 'done'; if (!state.busy) render();
    } catch (error) {
      if (!state || !state.rows.includes(row) || row.people[side] !== person || person.lookupToken !== token) return;
      person.candidates = []; person.lookupStatus = 'error'; if (!state.busy) render();
    }
  }
  async function discoverCandidates(rows) {
    var jobs = rows.flatMap(function (row) { return [0, 1].map(function (side) { return { row: row, side: side }; }); });
    var next = 0;
    await Promise.all([0, 1, 2].map(async function () {
      while (next < jobs.length) {
        var job = jobs[next++];
        if (!state || !state.rows.includes(job.row)) continue;
        await searchPerson(job.row, job.side);
      }
    }));
  }
  function search(rowIndex, side) {
    var row = state.rows[rowIndex];
    if (row && !row.saved) searchPerson(row, side);
  }
  async function save() {
    var plans = window.TournamentImportAllocation.allocate(state.rows, state.preview.slots);
    var pending = state.rows.map(function (row, index) { return { row: row, plan: plans[index] }; })
      .filter(function (entry) { return !entry.row.saved; });
    if (!pending.length) return;
    for (var entry of pending) {
      if (entry.plan.error || !entry.plan.slot || entry.row.people.some(function (p) { return !p.name.trim() || p.uid === undefined; })) {
        report('Revise as duplas sem vaga e confirme a conta de cada pessoa.'); return;
      }
    }
    if (window.TournamentImportAllocation.repeatedUid(state.rows)) {
      report('A mesma conta foi escolhida para duas pessoas. Corrija antes de gravar.'); return;
    }
    var withoutAccount = pending.flatMap(function (entry) { return entry.row.people.filter(function (p) { return p.uid === null; }).map(function (p) { return p.name; }); });
    if (!window.confirm('Gravar ' + pending.length + ' dupla(s) revisadas nas vagas de suas categorias?\n' +
      withoutAccount.length + ' pessoa(s) ficarão sem conta vinculada' + (withoutAccount.length ? ': ' + withoutAccount.join(', ') : '.') +
      '\nCada bloco salvo é definitivo; arquivos e OCR não serão armazenados.')) return;
    state.busy = true; state.saving = true; render();
    try {
      for (var i = 0; i < pending.length; i += 8) {
        var part = pending.slice(i, i + 8);
        var result = await callable('applyTournamentImportBlock', {
          tournamentId: state.tournamentId, importId: state.importId, blockIndex: state.blockIndex,
          fingerprint: state.preview.fingerprint,
          block: part.map(function (entry) { return { pairId: entry.plan.slot.pairId, categoryId: entry.plan.slot.categoryId,
            people: window.TournamentImportAllocation.peopleForBackend(entry.row, entry.plan.slot)
              .map(function (p) { return { name: p.name, uid: p.uid }; }) }; }),
        });
        state.preview.fingerprint = result.fingerprint;
        state.preview.count = result.count;
        var savedIds = new Set(part.map(function (entry) { return entry.plan.slot.pairId; }));
        state.preview.slots = state.preview.slots.filter(function (slot) { return !savedIds.has(slot.pairId); });
        part.forEach(function (entry) { entry.row.pairId = entry.plan.slot.pairId; entry.row.saved = true; });
        state.blockIndex++;
      }
      state.message = 'Blocos gravados. Reabra o torneio para conferir o elenco atualizado.';
    } catch (error) { state.message = 'Gravação interrompida: ' + (error.message || error) + '. Os blocos anteriores permanecem salvos; não reinicie a importação às cegas.'; }
    state.busy = false; state.saving = false; render();
  }
  window._openTournamentImport = async function (tournamentId) {
    if (typeof window._closeParticipantTools === 'function') window._closeParticipantTools();
    var tournament = window._findTournamentById && window._findTournamentById(tournamentId);
    if (!tournament) return;
    if (el()) el().remove();
    state = { tournamentId: String(tournamentId), categories: categories(tournament), importId: crypto.randomUUID(),
      blockIndex: 0, rows: [], page: 0, renderedPage: -1, resetScroll: true, preview: null, message: '', busy: false, saving: false, candidateCache: new Map() };
    var session = state;
    var box = document.createElement('div'); box.id = 'tournament-import-dialog';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'tournament-import-title');
    box.className = 'sp-import-dialog';
    document.body.appendChild(box); render();
    try {
      var preview = await callable('previewTournamentImport', { tournamentId: session.tournamentId });
      if (state !== session) return;
      state.preview = preview;
      state.categories = state.preview.categories || [];
      render();
    }
    catch (error) { if (state === session) report('Prévia indisponível: ' + (error.message || error) + '. Nenhum dado foi alterado.'); }
  };
  document.addEventListener('input', function (event) {
    if (!state || !el() || !el().contains(event.target)) return;
    var action = event.target.dataset.act;
    if (action !== 'name' && action !== 'query') return;
    var row = state.rows[Number(event.target.dataset.row)]; if (!row || row.saved) return;
    var person = row.people[Number(event.target.dataset.side)]; if (!person) return;
    if (action === 'query') {
      person.query = event.target.value.trim();
      person.lookupToken = (person.lookupToken || 0) + 1;
      person.candidates = []; person.lookupStatus = '';
      if (person.uid === null && person.autoNoAccount) { person.uid = undefined; person.autoNoAccount = false; }
    } else {
      person.name = event.target.value.trim(); person.query = person.name;
      person.uid = null; person.chosenName = ''; person.autoNoAccount = false;
      person.candidates = []; person.lookupStatus = '';
      person.lookupToken = (person.lookupToken || 0) + 1;
      var queryInput = event.target.closest('.sp-import-person').querySelector('[data-act="query"]');
      if (queryInput) queryInput.value = person.query;
      var nameNode = event.target.closest('.sp-import-person').querySelector('.sp-import-person-name');
      if (nameNode) nameNode.textContent = person.name;
    }
    var card = event.target.closest('.sp-import-person');
    if (card) {
      var decisionNode = card.querySelector('.sp-import-decision');
      if (decisionNode && person.uid === undefined) decisionNode.textContent = 'Conta a revisar — use Buscar';
      var candidatesNode = card.querySelector('.sp-import-candidates');
      if (candidatesNode) candidatesNode.remove();
    }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' || !state || !el() || !el().contains(event.target) || event.target.dataset.act !== 'query') return;
    event.preventDefault();
    if (!state.busy) search(Number(event.target.dataset.row), Number(event.target.dataset.side));
  });
  document.addEventListener('change', function (event) {
    if (!state || !el() || !el().contains(event.target)) return;
    if (event.target.id === 'tournament-import-files') { processFiles(Array.from(event.target.files || [])); return; }
  });
  document.addEventListener('click', function (event) {
    if (!state || !el() || !el().contains(event.target)) return;
    var button = event.target.closest('[data-act]'); if (!button) return;
    var action = button.dataset.act, index = Number(button.dataset.row), side = Number(button.dataset.side);
    if (action === 'close' && !state.saving) { el().remove(); state = null; return; }
    if (state.busy) return;
    if (action === 'prev') { state.page--; state.resetScroll = true; render(); return; }
    if (action === 'next') { state.page++; state.resetScroll = true; render(); return; }
    if (action === 'remove') { if (!state.rows[index] || state.rows[index].saved) return;
      state.rows.splice(index, 1); state.page = Math.min(state.page, Math.max(0, Math.ceil(state.rows.length / 8) - 1));
      var nextRow = state.rows[Math.min(index, state.rows.length - 1)];
      state.focusPersonKey = nextRow ? nextRow.viewKey + '-0' : '';
      render(); return; }
    if (action === 'search') { search(index, side); return; }
    if (action === 'none') { if (!state.rows[index] || state.rows[index].saved) return;
      state.rows[index].people[side].uid = null; state.rows[index].people[side].autoNoAccount = false; state.rows[index].people[side].chosenName = ''; render(); return; }
    if (action === 'choose') { if (!state.rows[index] || state.rows[index].saved) return;
      var person = state.rows[index].people[side];
      if (String(person.lookupToken) !== button.dataset.token) return;
      var selected = person.candidates[Number(button.dataset.candidate)]; if (!selected) return;
      person.uid = selected.uid; person.autoNoAccount = false; person.chosenName = selected.name; render(); return; }
    if (action === 'save') save();
  });
})();
