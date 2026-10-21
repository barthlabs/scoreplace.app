// Identifica lados definidos para a agenda e para o próximo jogo da TV.
(function () {
  'use strict';
  function knownSide(side) {
    var value = String(side || '').trim();
    return !!value && !/^(?:TBD|BYE|a definir|(?:vencedor|vencedora|perdedor|perdedora) d[oea] jogo\b|(?:winner|loser) of match\b)/i.test(value);
  }
  window.ScoreplaceNextMatch = { knownSide: knownSide };
})();
