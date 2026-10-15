/* Importação assistida de inscrições externas. Nenhum arquivo ou OCR grava o torneio. */
(function () {
  'use strict';
  var state = null;
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
  function rowMarkup(row, idx) {
    var disabled = row.saved ? ' disabled' : '';
    var options = '<option value="">Escolha a categoria</option>' + state.categories.map(function (item) {
      return '<option value="' + esc(item.id) + '"' + (item.id === row.categoryId ? ' selected' : '') + '>' + esc(item.label) + '</option>';
    }).join('');
    var available = state.preview.slots;
    var slotOptions = '<option value="">Escolha a dupla-placeholder</option>' + available.map(function (item) {
      var source = state.categories.find(function (cat) { return cat.id === item.categoryId; });
      return '<option value="' + esc(item.pairId) + '"' + (item.pairId === row.pairId ? ' selected' : '') + '>' +
        esc((source ? source.label : item.categoryId) + ' · ' + item.members.map(function (p) { return p.name; }).join(' + ')) + '</option>';
    }).join('');
    if (row.saved && row.sourceSlotLabel) {
      slotOptions += '<option value="' + esc(row.pairId) + '" selected>' + esc(row.sourceSlotLabel) + '</option>';
    }
    var people = row.people.map(function (person, side) {
      var decision = person.uid === undefined ? 'Ainda sem decisão' : (person.uid === null ? 'Nenhum destes' :
        'Conta: ' + (person.chosenName || person.uid) + ' · ' + person.uid);
      var hits = (person.candidates || []).map(function (candidate, candidateIndex) {
        return '<button type="button" class="sp-import-candidate" data-act="choose" data-row="' + idx + '" data-side="' + side + '" data-candidate="' + candidateIndex + '"' + disabled + '>' + esc(candidate.name) + ' · ' + esc(candidate.uid) + '</button>';
      }).join('');
      return '<div class="sp-import-person">' +
        '<label class="sp-import-field">Pessoa ' + (side + 1) + '<input data-act="name" data-row="' + idx + '" data-side="' + side + '" value="' + esc(person.name) + '"' + disabled + '></label>' +
        '<div class="sp-import-decision">' + esc(decision) + '</div>' +
        '<div class="sp-import-search-row"><input data-act="query" data-row="' + idx + '" data-side="' + side + '" value="' + esc(person.query || person.name) + '" aria-label="Buscar conta"' + disabled + '>' +
        '<button type="button" data-act="search" data-row="' + idx + '" data-side="' + side + '"' + disabled + '>Buscar</button>' +
        '<button type="button" data-act="none" data-row="' + idx + '" data-side="' + side + '"' + disabled + '>Nenhum destes</button></div>' + hits +
      '</div>';
    }).join('');
    return '<section class="sp-import-pair">' +
      '<div class="sp-import-pair-head"><strong>Dupla ' + (idx + 1) + (row.saved ? ' · gravada' : '') + '</strong><button type="button" data-act="remove" data-row="' + idx + '"' + (row.saved ? ' disabled' : '') + '>Remover</button></div>' +
      '<div class="sp-import-source">Origem: ' + esc(row.source || 'entrada manual') + '</div>' +
      '<div class="sp-import-fields">' +
        '<label class="sp-import-field">Categoria final<select data-act="category" data-row="' + idx + '"' + disabled + '>' + options + '</select></label>' +
        '<label class="sp-import-field">Vaga de origem<select data-act="slot" data-row="' + idx + '"' + disabled + '>' + slotOptions + '</select></label>' +
      '</div><div class="sp-import-people">' + people + '</div></section>';
  }
  function render() {
    var box = el(); if (!box || !state) return;
    var start = state.page * 8, visible = state.rows.slice(start, start + 8);
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
      '<details class="sp-import-help"><summary>Como funciona</summary><p>Arquivos geram uma prévia. Para cada pessoa, escolha uma conta ou Nenhum destes; depois escolha a vaga de origem e a categoria final. Nada é gravado antes da sua confirmação.</p></details>' +
      '<div class="sp-import-toolbar"><button type="button" data-act="add-row">+ Adicionar dupla manualmente</button>' +
      '<span>' + state.rows.length + ' na prévia · ' + state.rows.filter(function (r) { return r.saved; }).length + ' gravadas</span></div>' +
      visible.map(function (row, i) { return rowMarkup(row, start + i); }).join('') +
      (state.rows.length > 8 ? '<div class="sp-import-pagination"><button type="button" data-act="prev"' + (state.page === 0 ? ' disabled' : '') + '>Anterior</button><span>Página ' + (state.page + 1) + ' de ' + Math.ceil(state.rows.length / 8) + '</span><button type="button" data-act="next"' + (start + 8 >= state.rows.length ? ' disabled' : '') + '>Próxima</button></div>' : '') +
      '<button type="button" class="sp-import-save" data-act="save"' + (state.busy || !state.rows.some(function (r) { return !r.saved; }) ? ' disabled' : '') + '>Gravar duplas revisadas</button>';
    box.innerHTML = '<div class="sp-import-panel">' +
      '<div class="sp-import-header"><h2 id="tournament-import-title">Importar inscritos</h2><button type="button" data-act="close" aria-label="Fechar">×</button></div>' +
      (state.message ? '<p role="status" class="sp-import-status">' + esc(state.message) + '</p>' : '') + content + '</div>';
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
    state.busy = true; report('Lendo ' + files.length + ' arquivo(s)…');
    var added = 0, ignored = 0;
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
          parsed = window.TournamentImportParser.parsePhotoText(result.text, state.categories);
        } else if (/\.(csv|tsv|xlsx|xls)$/i.test(file.name)) {
          if (file.size > 10 * 1024 * 1024) throw new Error(file.name + ': planilha acima de 10 MB');
          var xlsx = await loadXlsx();
          var book = xlsx.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellFormula: false });
          parsed = { rows: [], ignored: [] };
          book.SheetNames.forEach(function (sheetName) {
            var matrix = xlsx.utils.sheet_to_json(book.Sheets[sheetName], { header: 1, raw: false, blankrows: false });
            var next = window.TournamentImportParser.parseMatrix(matrix, state.categories);
            parsed.rows.push.apply(parsed.rows, next.rows);
            parsed.ignored.push.apply(parsed.ignored, next.ignored);
          });
        } else throw new Error(file.name + ': formato não suportado');
        parsed.rows.forEach(function (row) { row.source = file.name + ' · ' + row.source; row.people.forEach(function (p) { p.uid = undefined; }); });
        state.rows.push.apply(state.rows, parsed.rows);
        added += parsed.rows.length; ignored += parsed.ignored.length;
      }
      state.message = added + ' duplas extraídas; revise nomes, categoria, vaga e conta. ' + ignored + ' linha(s) não interpretada(s).';
      state.page = Math.max(0, Math.ceil(state.rows.length / 8) - 1);
    } catch (error) { state.message = error.message + '. Nenhuma inscrição foi gravada.'; }
    state.busy = false; render();
  }
  async function search(rowIndex, side) {
    var person = state.rows[rowIndex].people[side];
    try {
      var result = await callable('searchTournamentImportCandidates', {
        tournamentId: state.tournamentId, query: String(person.query || person.name).trim(),
      });
      person.candidates = result.candidates || [];
      report(person.candidates.length ? 'Escolha a conta correta ou Nenhum destes.' : 'Nenhuma conta encontrada. Selecione Nenhum destes.');
    } catch (error) { person.candidates = []; report('Busca falhou. Não confirme o vínculo até conseguir consultar novamente.'); }
  }
  async function save() {
    var pending = state.rows.filter(function (row) { return !row.saved; });
    if (!pending.length) return;
    var used = new Set();
    for (var row of pending) {
      var slot = state.preview.slots.find(function (item) { return item.pairId === row.pairId; });
      if (!slot || !row.categoryId || used.has(row.pairId) ||
          row.people.some(function (p) { return !p.name.trim() || p.uid === undefined; })) {
        report('Revise categoria, vaga sem repetição e decisão de conta para as duas pessoas de cada dupla.'); return;
      }
      used.add(row.pairId);
    }
    var projected = new Map(state.categories.map(function (category) { return [category.id, Number(category.activeCount) || 0]; }));
    pending.forEach(function (row) {
      var source = state.preview.slots.find(function (slot) { return slot.pairId === row.pairId; });
      if (source.categoryId !== row.categoryId) {
        projected.set(source.categoryId, (projected.get(source.categoryId) || 0) - 2);
        projected.set(row.categoryId, (projected.get(row.categoryId) || 0) + 2);
      }
    });
    var overCapacity = state.categories.filter(function (category) {
      return category.capacity && (projected.get(category.id) || 0) > category.capacity;
    }).map(function (category) {
      return category.label + ': ' + projected.get(category.id) + '/' + category.capacity;
    });
    var warning = overCapacity.length ? '\nATENÇÃO: após a troca, excedem a capacidade configurada: ' + overCapacity.join(', ') +
      '. Esta importação NÃO aumenta as vagas nem altera a agenda. Ajuste o torneio depois.' : '';
    if (!window.confirm('Gravar ' + pending.length + ' dupla(s) revisadas? Cada bloco salvo é definitivo; arquivos e OCR não serão armazenados.' + warning)) return;
    state.busy = true; render();
    try {
      for (var i = 0; i < pending.length; i += 8) {
        var part = pending.slice(i, i + 8);
        var result = await callable('applyTournamentImportBlock', {
          tournamentId: state.tournamentId, importId: state.importId, blockIndex: state.blockIndex,
          fingerprint: state.preview.fingerprint,
          block: part.map(function (row) { return { pairId: row.pairId, categoryId: row.categoryId,
            people: row.people.map(function (p) { return { name: p.name, uid: p.uid }; }) }; }),
        });
        state.preview.fingerprint = result.fingerprint;
        state.preview.count = result.count;
        part.forEach(function (row) {
          var sourceSlot = state.preview.slots.find(function (slot) { return slot.pairId === row.pairId; });
          if (sourceSlot) {
            row.sourceSlotLabel = sourceSlot.members.map(function (member) { return member.name; }).join(' + ');
            if (sourceSlot.categoryId !== row.categoryId) {
              var from = state.categories.find(function (category) { return category.id === sourceSlot.categoryId; });
              var to = state.categories.find(function (category) { return category.id === row.categoryId; });
              if (from) from.activeCount -= 2;
              if (to) to.activeCount += 2;
            }
          }
        });
        var savedIds = new Set(part.map(function (row) { return row.pairId; }));
        state.preview.slots = state.preview.slots.filter(function (slot) { return !savedIds.has(slot.pairId); });
        part.forEach(function (row) { row.saved = true; });
        state.blockIndex++;
      }
      state.message = 'Blocos gravados. Reabra o torneio para conferir o elenco atualizado.';
    } catch (error) { state.message = 'Gravação interrompida: ' + (error.message || error) + '. Os blocos anteriores permanecem salvos; não reinicie a importação às cegas.'; }
    state.busy = false; render();
  }
  window._openTournamentImport = async function (tournamentId) {
    if (typeof window._closeParticipantTools === 'function') window._closeParticipantTools();
    var tournament = window._findTournamentById && window._findTournamentById(tournamentId);
    if (!tournament) return;
    if (el()) el().remove();
    state = { tournamentId: String(tournamentId), categories: categories(tournament), importId: crypto.randomUUID(),
      blockIndex: 0, rows: [], page: 0, preview: null, message: '', busy: false };
    var box = document.createElement('div'); box.id = 'tournament-import-dialog';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'tournament-import-title');
    box.className = 'sp-import-dialog';
    document.body.appendChild(box); render();
    try {
      state.preview = await callable('previewTournamentImport', { tournamentId: state.tournamentId });
      state.categories = state.preview.categories || [];
      render();
    }
    catch (error) { report('Prévia indisponível: ' + (error.message || error) + '. Nenhum dado foi alterado.'); }
  };
  document.addEventListener('change', function (event) {
    if (!state || !el() || !el().contains(event.target)) return;
    if (event.target.id === 'tournament-import-files') { processFiles(Array.from(event.target.files || [])); return; }
    var action = event.target.dataset.act, row = state.rows[Number(event.target.dataset.row)];
    if (!row) return;
    if (action === 'category') { row.categoryId = event.target.value; render(); }
    if (action === 'slot') { row.pairId = event.target.value; render(); }
    if (action === 'name') { var p = row.people[Number(event.target.dataset.side)]; p.name = event.target.value; p.uid = undefined; p.chosenName = ''; p.candidates = []; render(); }
    if (action === 'query') row.people[Number(event.target.dataset.side)].query = event.target.value;
  });
  document.addEventListener('click', function (event) {
    if (!state || !el() || !el().contains(event.target)) return;
    var button = event.target.closest('[data-act]'); if (!button) return;
    var action = button.dataset.act, index = Number(button.dataset.row), side = Number(button.dataset.side);
    if (action === 'close') { el().remove(); state = null; return; }
    if (action === 'prev') { state.page--; render(); return; }
    if (action === 'next') { state.page++; render(); return; }
    if (action === 'add-row') { state.rows.push({ categoryId: '', pairId: '', people: [{ name: '', uid: undefined }, { name: '', uid: undefined }] }); state.page = Math.floor((state.rows.length - 1) / 8); render(); return; }
    if (action === 'remove') { state.rows.splice(index, 1); state.page = Math.min(state.page, Math.max(0, Math.ceil(state.rows.length / 8) - 1)); render(); return; }
    if (action === 'search') { search(index, side); return; }
    if (action === 'none') { state.rows[index].people[side].uid = null; state.rows[index].people[side].chosenName = ''; render(); return; }
    if (action === 'choose') { var selected = state.rows[index].people[side].candidates[Number(button.dataset.candidate)]; state.rows[index].people[side].uid = selected.uid; state.rows[index].people[side].chosenName = selected.name; render(); return; }
    if (action === 'save') save();
  });
})();
