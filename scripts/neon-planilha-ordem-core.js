'use strict';

const CATEGORY_LABELS = new Map([
  ['LIGHT FEMININO', 'Fem Light'], ['POWER FEMININO', 'Fem Power'],
  ['EXTREME FEMININO', 'Fem Extreme'], ['LIGHT MASCULINO', 'Masc Light'],
  ['POWER MASCULINO', 'Masc Power'], ['EXTREME MASCULINO', 'Masc Extreme'],
  ['POWER FEMININA', 'Fem Power'], ['POWER FEMINNA', 'Fem Power'],
]);
const CATEGORY_ORDER = ['Fem Light', 'Fem Power', 'Fem Extreme', 'Masc Light', 'Masc Power', 'Masc Extreme'];
const EXPECTED_PAIRS = [24, 8, 8, 8, 8, 8];

function normalized(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function nameScore(a, b) {
  const left = normalized(a), right = normalized(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.82;
  const stop = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
  const aa = new Set(left.split(' ').filter(x => !stop.has(x)));
  const bb = new Set(right.split(' ').filter(x => !stop.has(x)));
  const shared = [...aa].filter(x => bb.has(x)).length;
  return shared ? shared / Math.max(aa.size, bb.size) : 0;
}
function pairScore(row, pair) {
  const straight = nameScore(row.members[0], pair.members[0].name) +
    nameScore(row.members[1], pair.members[1].name);
  const reverse = nameScore(row.members[0], pair.members[1].name) +
    nameScore(row.members[1], pair.members[0].name);
  return { score: Math.max(straight, reverse), reversed: reverse > straight,
    orientationGap: Math.abs(straight - reverse) };
}
function workbookRows(workbook) {
  const rows = [];
  for (const sheetName of workbook.SheetNames) {
    const xlsx = require('xlsx');
    const sheet = workbook.Sheets[sheetName];
    const end = xlsx.utils.decode_range(sheet['!ref']).e;
    const range = xlsx.utils.encode_range({ s: { r: 0, c: 0 }, e: end });
    const grid = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null, range });
    grid.forEach((row, index) => {
      if (!Number.isInteger(row[1])) return;
      const category = CATEGORY_LABELS.get(String(row[2] || '').trim().toUpperCase());
      const next = grid[index + 1] || [];
      if (!category || !String(row[5] || '').trim() || !String(next[5] || '').trim() ||
          CATEGORY_LABELS.get(String(next[2] || '').trim().toUpperCase()) !== category) {
        throw new Error(`linha inválida em ${sheetName}:${index + 1}`);
      }
      rows.push({ category, sheetName, row: index + 1, localNumber: row[1],
        members: [String(row[5]).trim(), String(next[5]).trim()] });
    });
  }
  for (const [index, category] of CATEGORY_ORDER.entries()) {
    if (rows.filter(row => row.category === category).length !== EXPECTED_PAIRS[index])
      throw new Error(`quantidade inesperada em ${category}`);
  }
  if (rows.length !== 64) throw new Error('planilha não contém 64 duplas');
  return CATEGORY_ORDER.flatMap(category => rows.filter(row => row.category === category));
}
function align(rows, pairs) {
  if (rows.length !== 64 || pairs.length !== 64) throw new Error('elenco não tem 64 duplas');
  const result = [];
  for (const [index, category] of CATEGORY_ORDER.entries()) {
    const todo = rows.filter(row => row.category === category);
    const available = pairs.filter(pair => pair.category === category);
    if (available.length !== EXPECTED_PAIRS[index]) throw new Error(`categoria atual diverge: ${category}`);
    for (const row of todo) {
      const ranked = available.map(pair => ({ pair, ...pairScore(row, pair) }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0], runner = ranked[1];
      if (!best || best.score < 0.45 || best.orientationGap < 0.12 ||
          (runner && best.score - runner.score < 0.16)) {
        throw new Error(`pareamento ambíguo em ${row.sheetName}:${row.row}: ` +
          JSON.stringify(ranked.slice(0, 2).map(x => ({ id: x.pair.id, score: x.score }))));
      }
      result.push({ row, pair: best.pair, reversed: best.reversed, score: best.score });
      available.splice(available.indexOf(best.pair), 1);
    }
    if (available.length) throw new Error(`sobraram duplas em ${category}`);
  }
  if (new Set(result.map(x => x.pair.id)).size !== 64) throw new Error('dupla repetida');
  return result.map((entry, index) => ({ ...entry,
    first: entry.pair.members[entry.reversed ? 1 : 0],
    second: entry.pair.members[entry.reversed ? 0 : 1],
    seq: index * 2 + 1 }));
}

function alignedDayAssignments(aligned, slots, schedule) {
  if (!schedule || schedule.originDayPolicy !== 'female-light-organization-final')
    throw new Error('política final de dias Fem Light ausente');
  const days = [...new Set((slots || []).filter(slot => slot.category === 'Fem Light')
    .map(slot => String(slot.day || '').slice(0, 10)))].sort();
  const current = schedule.pairDayAssignments || [];
  const byId = new Map(current.map(item => [String(item.fixedPairId || ''), String(item.day || '').slice(0, 10)]));
  const light = aligned.filter(entry => entry.row.category === 'Fem Light');
  if (days.length !== 2 || light.length !== 24 || current.length !== 24 || byId.size !== 24 ||
      byId.has(''))
    throw new Error('plano dos dias Fem Light incompleto ou ambíguo');
  const wanted = new Map(light.map(entry => [entry.pair.id,
    entry.row.sheetName === 'LIGHT MASC' ? days[1] : days[0]]));
  const orphanIds = [...byId.keys()].filter(id => !wanted.has(id));
  const missingIds = [...wanted.keys()].filter(id => !byId.has(id));
  if (orphanIds.length > 1 || missingIds.length > 1 || orphanIds.length !== missingIds.length)
    throw new Error('plano de dias diverge demais das duplas atuais');
  if ([...wanted.values()].filter(day => day === days[1]).length !== 8)
    throw new Error('planilha não possui oito duplas Fem Light de sexta');
  const changes = light.filter(entry => byId.get(entry.pair.id) !== wanted.get(entry.pair.id));
  const corrected = light.map(entry => ({ fixedPairId: entry.pair.id, day: wanted.get(entry.pair.id) }));
  return { changes: changes.length, staleIds: orphanIds.length, assignments: corrected, fridayPairIds: light
    .filter(entry => entry.row.sheetName === 'LIGHT MASC').map(entry => entry.pair.id) };
}

function validateNumbering(registrations, root) {
  const active = registrations.filter(x => x.status === 'confirmed');
  const other = registrations.filter(x => x.status !== 'confirmed');
  const seq = active.map(x => x.enrollSeq).sort((a, b) => a - b);
  if (seq.length !== 128 || seq.some((value, index) => value !== index + 1))
    throw new Error('inscrições ativas não são a permutação 1–128');
  if (other.some(x => x.status !== 'withdrawn') || (root.waitlist || []).length ||
      (root.standbyParticipants || []).length ||
      (root.monarchWaitlist && Object.keys(root.monarchWaitlist).length))
    throw new Error('há fila ou inscrição pendente; renumeração cancelada');
  // Inscrições retiradas guardam a numeração histórica. Já podem repetir os
  // números das ativas; não entram na projeção da lista nem nesta migração.
  return { active: active.length, withdrawn: other.length };
}
function reorderedMirror(item, firstKey, nextSeq) {
  const key = side => item[side + 'Uid'] ? 'uid:' + item[side + 'Uid'] :
    item[side + 'ManualId'] ? 'manual:' + item[side + 'ManualId'] : '';
  const reversed = key('p1') !== firstKey;
  const next = { ...item };
  if (reversed) {
    const prefixes = new Set(Object.keys(item).filter(field => /^p[12]/.test(field)).map(field => field.slice(2)));
    for (const suffix of prefixes) {
      const a = 'p1' + suffix, b = 'p2' + suffix;
      if (Object.prototype.hasOwnProperty.call(item, b)) next[a] = item[b]; else delete next[a];
      if (Object.prototype.hasOwnProperty.call(item, a)) next[b] = item[a]; else delete next[b];
    }
    for (const field of ['name', 'displayName']) {
      if (typeof item[field] === 'string' && item[field].includes(' / '))
        next[field] = item[field].split(' / ').reverse().join(' / ');
    }
  }
  next.p1Seq = nextSeq;
  next.p2Seq = nextSeq + 1;
  const nextKey = side => next[side + 'Uid'] ? 'uid:' + next[side + 'Uid'] :
    next[side + 'ManualId'] ? 'manual:' + next[side + 'ManualId'] : '';
  if (nextKey('p1') !== firstKey) throw new Error('troca de lados não preservou a primeira identidade');
  return next;
}

module.exports = { CATEGORY_ORDER, EXPECTED_PAIRS, normalized, nameScore, pairScore, workbookRows,
  align, alignedDayAssignments, validateNumbering, reorderedMirror };
