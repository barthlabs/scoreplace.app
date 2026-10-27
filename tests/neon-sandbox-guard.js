'use strict';

const ORIGINAL = 'tour_1790628592058_c342a1e8f5068424887f1702a1633a44';

function assertNeonEmulatorTarget({ projectId, firestoreHost, authHost, functionsHost, tournamentId, sandbox }) {
  if (projectId !== 'demo-scoreplace') throw new Error('Projeto de emulador incorreto.');
  if (firestoreHost !== '127.0.0.1:8093' || authHost !== '127.0.0.1:9092' || functionsHost !== '127.0.0.1:5011') {
    throw new Error('Hosts de emulador ausentes ou incorretos.');
  }
  if (sandbox !== true || !new RegExp('^sb_' + ORIGINAL + '_[0-9]+$').test(String(tournamentId || ''))) {
    throw new Error('O teste só pode escrever em uma cópia nova do Neon.');
  }
  return true;
}

module.exports = { ORIGINAL, assertNeonEmulatorTarget };
