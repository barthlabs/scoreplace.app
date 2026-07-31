/* Letzplay sintético — FONTE ÚNICA, usada pelo harness simulado e pelo teste que roda a
 * extensão de verdade. Duas cópias divergiriam, e aí um dos dois provaria outra coisa.
 */
const FIXTURE = `
const CLUB = 'paineiras-bt';
const PER_PAGE = 20;   // medido na página real de /matches

function mkCard(g) {
  // ESTRUTURA MEDIDA na página real (letzplay.me/camilacalia/matches, 30/jul/2026):
  // .match-title > a[/{club}/(tournaments|rankings)/{id}] · .row.match-player ×2 ·
  // .match-results-points (o placar) · span.match-{ID}-schedule (data + ID DA PARTIDA)
  const href = g.tid ? ('/' + CLUB + '/tournaments/' + g.tid) : ('/' + CLUB + '/rankings/' + g.rid);
  const catText = g.tid ? ('Grupos • Finals ' + g.tid + ' - Feminina C')
                        : ('Competitivo Fem C | 2026 2a Etapa • Rodada: ' + ((g.i % 9) + 1));
  const meWin = g.i % 3 !== 0;
  const s1 = meWin ? 6 : 4, s2 = meWin ? 3 : 6;
  const mid = 10000000 + g.i;
  return \`<div class="row match">
    <div class="col-xs-10 match-title small"><a class="text-muted" href="\${href}">\${catText}</a></div>
    <div class="col-xs-12" style="padding:0px;">
      <div class="row match-player">
        <div class="col-xs-11">
          <div class="match-player-info"><a href="/CamilaExemplo">av</a></div>
          <div class="match-player-info"><a href="/Parceira\${g.i % 40}">av</a></div>
          <span class="match-players-double">Camila Exemplo Parceira\${g.i % 40} Sobrenome</span>
        </div>
        <div class="match-results-points">\${s1}</div>
      </div>
      <div class="row match-player">
        <div class="col-xs-11">
          <div class="match-player-info"><a href="/AdvUm\${g.i % 90}">av</a></div>
          <div class="match-player-info"><a href="/AdvDois\${g.i % 77}">av</a></div>
          <span class="match-players-double">AdvUm\${g.i % 90} Sobrenome AdvDois\${g.i % 77} Sobrenome</span>
        </div>
        <div class="match-results-points">\${s2}</div>
      </div>
    </div>
    <div class="col-xs-12 match-footer small"><span class="match-\${mid}-schedule">\${g.date}</span></div>
  </div>\`;
}
function pager(page, max) {
  let h = '';
  for (let p = 2; p <= max; p++) h += '<a href="?page=' + p + '">' + p + '</a>';
  return h + (page < max ? '<a href="?page=' + (page + 1) + '">Próxima</a>' : '');
}
// O universo: N_GAMES jogos, N_TOUR torneios (4 jogos cada), resto em N_RANK rankings.
function build(cfg) {
  const games = [];
  let i = 0;
  for (let t = 0; t < cfg.tours && i < cfg.games; t++) {
    for (let k = 0; k < cfg.gamesPerTour && i < cfg.games; k++, i++) {
      games.push({ i, date: 'Sábado, ' + String(1 + (i % 28)).padStart(2,'0') + '/' + String(1 + (i % 12)).padStart(2,'0') + '/26 às 08:00hs', tid: 300000 + t });
    }
  }
  for (let r = 0; i < cfg.games; i++, r++) {
    games.push({ i, date: 'Sábado, ' + String(1 + (i % 28)).padStart(2,'0') + '/' + String(1 + (i % 12)).padStart(2,'0') + '/26 às 08:00hs', rid: 90000 + (r % cfg.ranks) });
  }
  return games;
}

window.__LZ = {
  hits: {},          // url → quantas vezes foi pedida
  cfg: null,
  games: null,
  bloqueio: null, nReq: 0, nBloqueios: 0,
  // pararApos: quantas páginas do HISTÓRICO servir antes de derrubar tudo. Simula a rodada
  // que morre no meio (rate-limit, aba fechada) — o caso em que a limpeza pode perder dado.
  pararApos: 0, pagesServidas: 0,
  init(cfg, bloqueio) {
    this.cfg = cfg; this.games = build(cfg); this.hits = {};
    this.bloqueio = bloqueio || null; this.nReq = 0; this.nBloqueios = 0;
    this.pagesServidas = 0;
  },
  serve(url) {
    const u = url.replace('https://letzplay.me', '');
    this.hits[u] = (this.hits[u] || 0) + 1;
    if (this.pararApos && u.indexOf('/matches') >= 0) {   // sem regex: dentro do template, \/ vira / e viraria comentário
      this.pagesServidas++;
      if (this.pagesServidas > this.pararApos) return null;   // fetch falha daqui pra frente
    }
    const m = {};
    // perfil: /{handle}
    if (/^\\/CamilaExemplo$/.test(u)) {
      return '<html><head><title>Camila Exemplo - Letzplay</title></head><body>' +
        this.cfg.games + ' Jogos ' + this.cfg.ranks + ' Rankings ' + this.cfg.tours + ' Torneios' +
        '</body></html>';
    }
    // ÍNDICE JSON DO HISTÓRICO: /{handle}/matches.json[?page=]
    // MEDIDO no letzplay real (31/jul/2026): Rails, toda rota responde JSON com .json;
    // 20 por página; a página seguinte à última devolve []. É de onde sai o total REAL de
    // partidas (o contador do perfil conta CARDS) e o fim de lista explícito.
    let mj = u.match(/^\\/CamilaExemplo\\/matches\\.json(?:\\?page=(\\d+))?$/);
    if (mj) {
      const page = +(mj[1] || 1);
      const ini = (page - 1) * PER_PAGE;
      const fatia = this.games.slice(ini, ini + PER_PAGE);
      return JSON.stringify(fatia.map(function (g) {
        return { id: 10000000 + g.i, date: '2026-07-' + String((g.i % 28) + 1).padStart(2, '0'),
          matchable_id: g.tid ? (300000 + (g.i % 40)) : (55000 + (g.i % 29)),
          matchable_type: g.tid ? 'Tournament' : 'Ranking',
          round: (g.i % 7) + 1, status: 3 };
      }));
    }
    // lista de torneios: /{handle}/tournaments[?page=]
    let mm = u.match(/^\\/CamilaExemplo\\/tournaments(?:\\?page=(\\d+))?$/);
    if (mm) {
      const page = +(mm[1] || 1), perPage = 12;
      const maxPage = Math.ceil(this.cfg.tours / perPage);
      let h = '<html><body>';
      for (let t = (page-1)*perPage; t < Math.min(this.cfg.tours, page*perPage); t++) {
        // a página REAL repete cada torneio em 3 links (/id, /id/players, /id/matches) —
        // verificado em letzplay.me/camilacalia/tournaments: 59 links pra ~20 torneios
        h += '<a href="/' + CLUB + '/tournaments/' + (300000+t) + '">Interno Ciclo ' + t + ' - Feminina C</a>'
           + '<a href="/' + CLUB + '/tournaments/' + (300000+t) + '/players">Jogadores</a>'
           + '<a href="/' + CLUB + '/tournaments/' + (300000+t) + '/matches">Jogos</a>';
      }
      h += pager(page, maxPage) + '</body></html>';
      return h;
    }
    // lista de rankings: /{handle}/rankings[?page=]
    mm = u.match(/^\\/CamilaExemplo\\/rankings(?:\\?page=(\\d+))?$/);
    if (mm) {
      // 7 por página e SEM links de paginação — é o caso real que travou a barra em
      // "7 de 29": a detecção de paginação não pega, e só insistir página a página resolve.
      const page = +(mm[1] || 1), perPage = 7;
      let h = '<html><body>';
      for (let r = (page-1)*perPage; r < Math.min(this.cfg.ranks, page*perPage); r++) {
        h += '<a href="/' + CLUB + '/rankings/' + (90000+r) + '/table">Social Fem C / B ' + r + '</a>';
      }
      return h + '</body></html>';
    }
    // histórico geral: /{handle}/matches[?page=]
    mm = u.match(/^\\/CamilaExemplo\\/matches(?:\\?page=(\\d+))?$/);
    if (mm) {
      const page = +(mm[1] || 1);
      const maxPage = Math.ceil(this.games.length / PER_PAGE);
      const slice = this.games.slice((page-1)*PER_PAGE, page*PER_PAGE);
      return '<html><body>' + slice.map(mkCard).join('') + pager(page, maxPage) + '</body></html>';
    }
    // página do torneio: /{club}/tournaments/{id}  → nome + classificação + logo
    mm = u.match(/^\\/([^\\/]+)\\/tournaments\\/(\\d+)$/);
    if (mm) {
      const tid = mm[2];
      const mine = this.games.filter(g => String(g.tid) === tid);
      const v = mine.filter(g => g.i % 3 !== 0).length, d = mine.length - v;
      let rows = '<div class="row"><div class="points">1º</div><div class="break-line">Camila Exemplo<br>Parceira 1</div>' +
        '<a href="/CamilaExemplo">c</a><a href="/Parceira1">p</a><span>' + v + ' Vitórias ' + d + ' Derrotas</span></div>';
      for (let p = 2; p <= 4; p++) {
        rows += '<div class="row"><div class="points">' + p + 'º</div><div class="break-line">Outra ' + p + '<br>Dupla ' + p + '</div>' +
          '<a href="/Outra' + p + '">o</a><a href="/Dupla' + p + '">d</a><span>1 Vitórias 2 Derrotas</span></div>';
      }
      return '<html><body><h2 class="title with-avatar">Interno Ciclo ' + tid + ' - Feminina C</h2>' +
        '<div><img src="https://res.cloudinary.com/lptennis/x.jpg"></div>' +
        '<div class="table-group"><div class="table-field-title"><b>Grupo 1</b></div>' + rows + '</div>' +
        '</body></html>';
    }
    // jogos do torneio: /{club}/tournaments/{id}/matches[?page=]
    mm = u.match(/^\\/([^\\/]+)\\/tournaments\\/(\\d+)\\/matches(?:\\?page=(\\d+))?$/);
    if (mm) {
      const tid = mm[2], page = +(mm[3] || 1), per = 3;
      const mine = this.games.filter(g => String(g.tid) === tid);
      const maxPage = Math.max(1, Math.ceil(mine.length / per));
      const slice = mine.slice((page-1)*per, page*per);
      return '<html><body>' + slice.map(mkCard).join('') + pager(page, maxPage) + '</body></html>';
    }
    // página do ranking: /{club}/rankings/{id} → nome + classificação (110 duplas)
    mm = u.match(/^\\/([^\\/]+)\\/rankings\\/(\\d+)$/);
    if (mm) {
      let rows = '';
      for (let p = 1; p <= 110; p++) {
        const nome = (p === 40) ? 'Camila Exemplo' : ('Atleta ' + p);
        const h = (p === 40) ? 'CamilaExemplo' : ('Atleta' + p);
        rows += '<div class="row"><a href="/' + h + '">' + nome + '</a>' +
          '<div class="break-line">' + nome + '<br>Dupla ' + p + '</div>' +
          '<div class="points">' + (2000 - p*7) + '</div></div>';
      }
      return '<html><body><h2 class="title with-avatar">Competitivo Fem B | 2026 Etapa ' + mm[2] + '</h2>' +
        '<div><img src="https://res.cloudinary.com/lptennis/y.jpg"></div>' +
        '<div class="table-ranking">' + rows + '</div></body></html>';
    }
    return '<html><body></body></html>';
  }
};
`;

module.exports = { FIXTURE };
