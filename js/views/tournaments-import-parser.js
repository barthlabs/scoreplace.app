/* External roster sources are suggestions, never identities or writes. */
(function (root) {
  'use strict';
  function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function folded(value) { return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function categoryKey(value) {
    return folded(value).replace(/\b(feminina|feminino|fem)\b/g,'fem')
      .replace(/\b(masculina|masculino|masc)\b/g,'masc').replace(/[^a-z0-9]+/g,' ').trim();
  }
  function categoryFor(value, categories) {
    var source=categoryKey(value);
    if(!source)return '';
    var matches=(categories||[]).filter(function(item){
      var label=categoryKey(item.label||item.name||'');
      return label && label.split(' ').every(function(token){return (' '+source+' ').includes(' '+token+' ');});
    });
    return matches.length===1?matches[0].id:'';
  }
  function splitPair(value) {
    var match = clean(value).replace(/^\d+[.)]\s*/, '').match(/^(.+?)\s+\+\s+(.+)$/);
    return match && clean(match[1]).length > 1 && clean(match[2]).length > 1
      ? [clean(match[1]), clean(match[2])] : null;
  }
  function parsePhotoText(raw, categories) {
    var currentCategory = '', rows = [], ignored = [];
    var lines = String(raw || '').split(/\r?\n/);
    lines.forEach(function (line) {
      var value = clean(line);
      if (!value) return;
      var category = categoryFor(value, categories);
      if (category && !splitPair(value)) { currentCategory = category; return; }
      var pair = splitPair(value);
      if (pair) rows.push({ categoryId: currentCategory, ordinal: Number((value.match(/^(\d+)[.)]/) || [])[1]) || null,
        people: pair.map(function (name) { return { name: name, uid: undefined }; }), source: value });
      else ignored.push(value);
    });
    return { rows: rows, ignored: ignored };
  }
  function parseIndividuals(matrix, categories) {
    var table=(matrix||[]).map(function(row){return (row||[]).map(clean);});
    var width=Math.max(0,...table.map(function(row){return row.length;})), lanes=[],rows=[],ignored=[];
    for(var col=0;col<width;col++){
      var hits=table.filter(function(row){return !!categoryFor(row[col],categories);}).length;
      var header=table.findIndex(function(row){return /^(categoria|category)$/i.test(row[col]||'');});
      if(!hits&&header<0)continue;
      var numberCol=-1,nameCol=col+1;
      if(header>=0){
        var names=table[header].map(function(value,i){return /^(nome|atleta|participante|jogador|name|player)$/i.test(value)?i:-1;}).filter(function(i){return i>=0;});
        if(names.length)nameCol=names.sort(function(a,b){return Math.abs(a-col)-Math.abs(b-col);})[0];
      }
      for(var n=col-1;n>=0;n--){
        if(table.some(function(row){return categoryFor(row[col],categories)&&/^\d+$/.test(row[n]||'');})){numberCol=n;break;}
        if(lanes.some(function(lane){return lane.col===n;}))break;
      }
      var gender=(table.map(function(row){return row[col]||'';}).find(function(value){return /^(feminina?|masculina?)$/i.test(value);})||'');
      lanes.push({col:col,name:nameCol,number:numberCol,header:header,gender:gender});
    }
    lanes.forEach(function(lane){
      var records=[],counts={};
      table.forEach(function(row,i){
        var value=row[lane.name]||'',label=row[lane.col]||'',cat=categoryFor(label,categories)||categoryFor(lane.gender+' '+label,categories);
        var numeric=lane.number>=0&&/^\d+$/.test(row[lane.number]||'')?Number(row[lane.number]):null;
        if(i===lane.header||/^(nome|atleta|participante|jogador|name|player)$/i.test(value))return;
        if(lane.number>=0&&!numeric)return;
        if(lane.number<0&&!value)return;
        if(/^(feminina?|masculina?|categoria|category)$/i.test(value)||categoryFor(value,categories))return;
        if(numeric!==null&&(numeric<1||numeric>10000)){ignored.push('Linha '+(i+1)+': posição inválida');return;}
        records.push({index:i,categoryId:cat,name:value,ordinal:numeric,source:'Linha '+(i+1)+', coluna '+(lane.name+1)});
      });
      // Each numbered run is a separate block. The first empty position may
      // acquire its category from a later labelled row within the SAME run.
      var blocks=[];
      records.forEach(function(record){
        var block=blocks[blocks.length-1],prev=block&&block[block.length-1];
        if(!block||record.ordinal!==null&&prev.ordinal!==null&&record.ordinal<=prev.ordinal||
            record.categoryId&&prev.categoryId&&record.categoryId!==prev.categoryId){block=[];blocks.push(block);}
        block.push(record);
      });
      blocks.forEach(function(block){
        var ids=Array.from(new Set(block.map(function(r){return r.categoryId;}).filter(Boolean)));
        block.forEach(function(record){
          var category=record.categoryId||(ids.length===1?ids[0]:'');
          counts[category]=(counts[category]||0)+1;
          rows.push({kind:'individual',categoryId:category,ordinal:record.ordinal||counts[category],
            placeholder:!record.name,people:[{name:record.name,uid:null}],source:record.source,
            ...(category?{}:{error:'Categoria ambígua em '+record.source+'. Confira o bloco da planilha.'})});
        });
      });
    });
    if(!lanes.length)ignored.push('Não foi possível localizar as colunas de categoria e nome.');
    return {rows:rows,ignored:ignored};
  }
  function parseMatrix(matrix, categories, options) {
    if(options&&options.mode==='individual')return parseIndividuals(matrix,categories);
    var rows = [], ignored = [], currentCategory = '';
    (matrix || []).forEach(function (row) {
      var cells = (Array.isArray(row) ? row : []).map(clean).filter(Boolean);
      if (!cells.length) return;
      if (cells.filter(function (cell) { return /^(categoria|pessoa\s*[12]|jogador\s*[12]|participante\s*[12]|nome\s*[12])$/i.test(cell); }).length >= 2) return;
      var joined = cells.join(' '), category = categoryFor(joined, categories);
      if (category) currentCategory = category;
      var pair = cells.map(splitPair).find(Boolean);
      if (!pair) {
        var names = cells.filter(function (cell) { return !/^\d+$/.test(cell) && !categoryFor(cell, categories) &&
          !/^(dupla|equipe|categoria|atleta|jogador|participante|nome|partner|player)\b/i.test(cell); });
        if (names.length >= 2 && names[0].length > 1 && names[1].length > 1) pair = names.slice(0, 2);
      }
      if (pair) rows.push({ categoryId: category || currentCategory, ordinal: Number((joined.match(/^(\d+)[.)]/) || [])[1]) || null,
        people: pair.map(function (name) { return { name: name, uid: undefined }; }), source: joined });
      else ignored.push(joined);
    });
    return { rows: rows, ignored: ignored };
  }
  var api = { categoryFor: categoryFor, splitPair: splitPair, parsePhotoText: parsePhotoText, parseMatrix: parseMatrix };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TournamentImportParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
