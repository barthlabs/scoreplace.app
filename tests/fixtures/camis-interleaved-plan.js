'use strict';
const block = (kind, category, startTime, courts, extra = {}) =>
  ({ kind, category, startTime, courts, ...extra });
const allCourts = [1,2,3,4,5,6,7,8];
module.exports = { schema:1, day:'2026-11-13', courts:8,
  eliminationMinutes:35, eliminationPlayMinutes:25, totalGames:144,
  blocks:[
    block('groups', 'Fem Diamante', '08:00', allCourts, { groupStart:1 }),
    block('groups', 'Fem Ouro', '09:40', allCourts, { groupStart:1 }),
    block('groups', 'Fem Ouro', '11:20', allCourts, { groupStart:9 }),
    block('elimination', 'Fem Diamante', '13:00', [1,2,3,4], { round:1 }),
    block('elimination', 'Fem Ouro', '13:00', [5,6,7,8], { round:1 }),
    block('elimination', 'Fem Diamante', '13:40', [1,2], { round:2 }),
    block('elimination', 'Fem Ouro', '13:40', [3,4,5,6], { round:1 }),
    block('elimination', 'Fem Diamante', '14:20', [1,2], { round:3 }),
    block('elimination', 'Fem Ouro', '14:20', [3,4,5,6], { round:2 }),
    block('elimination', 'Fem Ouro', '15:00', [1,2], { round:3 }),
    block('groups', 'Fem Prata', '15:00', [3,4,5,6,7,8], { groupStart:1 }),
    block('elimination', 'Fem Ouro', '15:40', [1,2], { round:4 }),
    block('groups', 'Fem Prata', '16:40', [1,2,3,4,5,6], { groupStart:7 }),
    block('elimination', 'Fem Prata', '18:20', [1,2,3,4], { round:1 }),
    block('elimination', 'Fem Prata', '19:00', [1,2,3,4], { round:2 }),
    block('elimination', 'Fem Prata', '19:40', [1,2], { round:3 }),
    block('elimination', 'Fem Prata', '20:20', [1,2], { round:4 })
  ] };
