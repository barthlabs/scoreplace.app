/* O "+" DIZ "É D, MAS ESTÁ BUSCANDO A C" — e só vale com desempenho sustentando.
 *
 * Definição do dono (17/ago/2026), sobre a Kelly: "na verdade a Kelly seria D+ já que no
 * social disputa C e torneios em D". Ranking na C + torneio na D NÃO são duas categorias:
 * são UMA. E o sinal não é de graça — "se perde tudo na C, mas tambem na D seria D. Se
 * ganha muito na D e na C oscila ganhando umas e perdendo outras reforça o D+".
 *
 * ⚠️ Distinto de `_lzBanda`, que fatia a faixa por PONTOS. Este sinal sai da relação entre
 * onde a pessoa DISPUTA e onde ela SE SUSTENTA.
 *
 * Roda com: node tests/sinal-e-semantico.test.js
 */
const fs = require('fs'); const path = require('path');
const s = fs.readFileSync(path.join(__dirname, '..', 'js/store.js'), 'utf8');
let falhas = 0, testes = 0;
function ok(c, m) { testes++; if (c) console.log('  ✓ ' + m); else { falhas++; console.log('  ✗ ' + m); } }

// ⚠️ começa na PRIMEIRA constante do bloco, não na SP_SINAL_MIN: uma constante nova
// inserida acima dela ficava fora da janela e chegava `undefined` no teste — foi assim que
// a Kelly "falhou" com o código certo.
const i = s.indexOf('window.SP_MIN_PRESENCA');
const f = s.indexOf('\n\n// ── LEITURA FEITA POR MOTOR VELHO');
ok(i > 0 && f > i, 'a regra vive no store.js (fonte única)');
const w = {}; new Function('window', s.slice(i, f))(w);
const cat = (d) => w._lzCategoriaComSinal(d);

// ── os três casos que o dono descreveu, nas palavras dele ──────────────────────────
ok(cat([{ categoria: 'C', tipo: 'ranking', wins: 6, losses: 7 },
        { categoria: 'D', tipo: 'torneio', wins: 9, losses: 2 }]).rotulo === 'D+',
   'Kelly: ranking na C oscilando + torneio na D ganhando → D+');
// "se perde tudo na C, mas tambem na D seria D" — o que essa frase garante é que o "+"
// NÃO se sustenta. Com a regra de base (dita depois), perder quase tudo na D também é
// estar na base da categoria, então o rótulo honesto é D- — e as duas coisas convivem.
{
  const r = cat([{ categoria: 'C', tipo: 'ranking', wins: 0, losses: 9 },
                 { categoria: 'D', tipo: 'torneio', wins: 1, losses: 8 }]);
  ok(r.sinal !== '+', 'perde tudo na C E na D → NÃO ganha "+" (era o ponto da regra)');
  ok(r.categoria === 'D' && r.rotulo === 'D-', 'e como está na base da própria, leva "-"');
}
// ⚠️ CORREÇÃO DO DONO, no mesmo dia: "se ganhar tudo na D ganha o + sim. se estiver no
// topo da tabela ganha o + da mesma forma se estiver na base ganha o -". A versão anterior
// deste teste afirmava o contrário — quem domina a própria categoria ficava SEM sinal, e é
// justamente quem está de saída dela.
ok(cat([{ categoria: 'D', tipo: 'ranking', wins: 8, losses: 2 },
        { categoria: 'D', tipo: 'torneio', wins: 5, losses: 1 }]).rotulo === 'D+',
   'ganhar quase tudo na PRÓPRIA categoria também dá "+"');
ok(cat([{ categoria: 'D', tipo: 'ranking', wins: 5, losses: 4, pos: 2, total: 30 }]).rotulo === 'D+',
   'topo da tabela dá "+" mesmo com aproveitamento equilibrado');
ok(cat([{ categoria: 'D', tipo: 'ranking', wins: 2, losses: 7, pos: 28, total: 30 }]).rotulo === 'D-',
   'base da tabela dá "-"');
ok(cat([{ categoria: 'D', tipo: 'torneio', wins: 1, losses: 9 }]).rotulo === 'D-',
   'perder quase tudo na própria categoria dá "-"');
ok(cat([{ categoria: 'D', tipo: 'ranking', wins: 5, losses: 5, pos: 15, total: 30 }]).rotulo === 'D',
   'meio da tabela e equilibrado fica SEM sinal (nem tudo tem sinal)');
// "+" vence "-": subida manda sobre um aproveitamento ruim pontual
ok(cat([{ categoria: 'C', tipo: 'ranking', wins: 6, losses: 7 },
        { categoria: 'D', tipo: 'torneio', wins: 1, losses: 9 }]).sinal === '+',
   'quem busca a de cima não leva "-" pelo desempenho na de baixo');
// e o PORQUÊ tem que ser legível — sinal sem motivo é caixa-preta
ok(cat([{ categoria: 'D', tipo: 'torneio', wins: 9, losses: 1 }]).porque === 'domina a própria',
   'o motivo do sinal vem junto');

// ── ⚠️ o sinal NÃO é de graça: inscrever-se acima não basta ────────────────────────
ok(cat([{ categoria: 'C', tipo: 'ranking', wins: 1, losses: 1 },
        { categoria: 'D', tipo: 'torneio', wins: 4, losses: 4 }]).rotulo === 'D',
   'disputar a de cima SEM volume não vira "+" (2 jogos não provam nada)');
ok(cat([{ categoria: 'C', tipo: 'ranking', wins: 0, losses: 6 },
        { categoria: 'D', tipo: 'torneio', wins: 4, losses: 4 }]).rotulo === 'D',
   'volume na de cima mas sem ganhar nada → sem sinal');

// ── a BASE é o torneio (é lá que a elegibilidade morde) ────────────────────────────
const k = cat([{ categoria: 'C', tipo: 'ranking', wins: 6, losses: 7 },
               { categoria: 'D', tipo: 'torneio', wins: 9, losses: 2 }]);
ok(k.categoria === 'D', 'a base é a categoria de TORNEIO, não a de ranking');
ok(k.acimaJogos === 13 && k.acimaPct === 46,
   'e o porquê fica legível (13 jogos acima, 46%) — não é caixa-preta');

// ── casos de borda ────────────────────────────────────────────────────────────────
ok(cat([]) === null && cat(null) === null, 'sem disputa nenhuma não se inventa categoria');
ok(cat([{ categoria: 'lixo', tipo: 'torneio', wins: 3, losses: 1 }]) === null,
   'rótulo que não é categoria é ignorado');
ok(cat([{ categoria: 'C', tipo: 'ranking', wins: 5, losses: 5 }]).categoria === 'C',
   'sem torneio nenhum, a base vem do que houver');
ok(cat([{ categoria: 'B', tipo: 'ranking', wins: 5, losses: 4 },
        { categoria: 'D', tipo: 'torneio', wins: 8, losses: 1 }]).rotulo === 'D+',
   'disputar DUAS acima também dá "+" (não existe "++")');

// ── ⛔ O QUE NÃO É CATEGORIA (casos REAIS de produção, 17/ago/2026) ────────────────
// O Fernando Bernacchi tem uma entrada "46 a 50 anos" no histórico — e o **"a"** de
// "46 A 50" era lido como categoria **A**. Ele, que é D+, saía classificado como A.
// A preposição virava nível. É o mesmo defeito de família do nome do torneio ocupando o
// campo da categoria: o letzplay põe coisas nesse campo que não são categoria.
ok(cat([{ categoria: '46 a 50 anos', tipo: 'torneio', wins: 0, losses: 0 },
        { categoria: 'Masc D+', tipo: 'ranking', wins: 4, losses: 11 }]).categoria === 'D',
   'faixa etária "46 a 50 anos" NÃO vira categoria A (caso real do Fernando)');
ok(cat([{ categoria: '46 a 50 anos', tipo: 'torneio', wins: 5, losses: 1 }]) === null,
   'sozinha, a faixa etária não classifica ninguém');
ok(cat([{ categoria: 'Rodada: 131', tipo: 'ranking', wins: 4, losses: 46 },
        { categoria: 'Masc D+', tipo: 'ranking', wins: 4, losses: 11 }]).categoria === 'D',
   '"Rodada: 131" também não é categoria');
ok(cat([{ categoria: '50 anos', tipo: 'torneio', wins: 3, losses: 1 }]) === null,
   'e nenhuma variação de idade entra');
// ⚠️ e o inverso: as categorias de verdade continuam passando
['Masc D+', 'Fem C+', 'Feminina C', 'Masculina D', 'Mista D', 'FUN'].forEach(function (t) {
  ok(cat([{ categoria: t, tipo: 'torneio', wins: 3, losses: 3 }]) !== null,
     '"' + t + '" continua sendo lida como categoria');
});

// ── LIGADA NA TELA (17/ago/2026) ─────────────────────────────────────────────────────
{
  const store = fs.readFileSync(path.join(__dirname, '..', 'js/store.js'), 'utf8');
  const perfil = fs.readFileSync(path.join(__dirname, '..', 'js/views/letzplay-profile.js'), 'utf8');
  const i2 = store.indexOf('window._lzDisputasDoImport');
  const f2 = store.indexOf('\n\n// ── LEITURA FEITA POR MOTOR VELHO');
  ok(i2 > 0 && f2 > i2, 'existe o montador de disputas a partir do import');
  new Function('window', store.slice(i2, f2))(w);

  // o footprint é a fonte: uma linha por competição, com categoria, tipo e saldo
  const disp = w._lzDisputasDoImport({ footprint: [
    { categoryRaw: 'Fem C+', official: false, wins: 7, losses: 2 },
    { categoryRaw: 'Feminina D', official: true, wins: 9, losses: 2, position: 2 },
    { categoryRaw: '46 a 50 anos', official: true, wins: 0, losses: 0 },
    { categoryRaw: null, official: true, wins: 1, losses: 1 },
  ]});
  ok(disp.length === 3, 'linha sem categoria é descartada na origem');
  ok(disp[1].tipo === 'torneio' && disp[0].tipo === 'ranking',
     'official vira torneio; o resto, ranking');
  ok(w._lzCategoriaDoImport({ footprint: [
    { categoryRaw: 'Fem C+', official: false, wins: 7, losses: 2 },
    { categoryRaw: 'Feminina D', official: true, wins: 9, losses: 2 },
  ]}).rotulo === 'D+', 'o atalho do import devolve a categoria com sinal');
  ok(w._lzDisputasDoImport(null).length === 0 && w._lzDisputasDoImport({}).length === 0,
     'import vazio não quebra');

  // ⚠️ a ficha usa o resultado E mostra o porquê — sinal sem motivo é caixa-preta
  ok(/_lzCategoriaDoImport\(imp\)/.test(perfil), 'a ficha chama a categoria com sinal');
  // ⭐ SÓ A CATEGORIA, INTEIRA — "É feminina C+ e acabou porra" (dono, 17/ago/2026).
  ok(/esc\(_gen \+ _cs\.rotulo\)/.test(perfil), 'exibe o rótulo COM gênero: "Feminina C+"');
  ok(/Feminina '/.test(perfil) && /Masculina '/.test(perfil), 'os dois gêneros viram prefixo');
  ok(!/' <span style="font-size:10px;[^']*">' \+ esc\(_cs\.porque\)/.test(perfil),
     'o motivo NÃO fica escrito na tela (só no título, pra quem passar o mouse)');
  ok(!/>faixa</.test(perfil), 'e a "faixa" por pontos saiu da tela');
}

// ── ⭐ OS TRÊS CASOS REAIS DO DONO (17/ago/2026) ──────────────────────────────────
// A regra que os resolve JUNTOS é a que ele deu no começo do dia e eu levei a tarde toda
// pra aplicar: "a categoria de uma pessoa vem dos jogos recentes". A letra é onde a pessoa
// jogou POR ÚLTIMO (com presença mínima) — não onde vai melhor, não a mais forte que já
// disputou. Ponderar por desempenho acertava um caso e quebrava outro, sempre.
{
  // Kelly — torneio recente na D, torneio antigo na C, ranking na C
  const kelly = cat([
    { categoria: 'Feminina D', tipo: 'torneio', wins: 2, losses: 1 },
    { categoria: 'Mista D', tipo: 'torneio', wins: 0, losses: 3 },
    { categoria: 'Feminina C', tipo: 'torneio', wins: 2, losses: 3 },
    { categoria: 'Feminina C', tipo: 'torneio', wins: 4, losses: 2 },
    { categoria: 'Fem C+', tipo: 'ranking', wins: 10, losses: 16 },
  ]);
  ok(kelly.rotulo === 'D+', 'KELLY · joga D hoje e alcança a C → D+ (veio: ' + kelly.rotulo + ')');

  // Camila — joga C hoje (e vai mal lá); os FUN são de 2022
  const camila = cat([
    { categoria: 'Feminina C', tipo: 'torneio', wins: 1, losses: 2 },
    { categoria: 'Feminina C', tipo: 'torneio', wins: 1, losses: 2 },
    { categoria: 'Feminina FUN', tipo: 'torneio', wins: 2, losses: 1 },
    { categoria: 'Feminina C', tipo: 'torneio', wins: 0, losses: 3 },
    { categoria: 'Feminina C', tipo: 'torneio', wins: 0, losses: 3 },
  ]);
  ok(camila.categoria === 'C',
     'CAMILA · vai MELHOR na FUN e mesmo assim é C — é onde ela joga hoje (veio: ' + camila.rotulo + ')');
  // ⚠️ e o sinal dela é "-": está na C e faz 8% lá. Isso ainda NÃO sai no dado real —
  // ver o aviso no fim deste bloco.
  ok(camila.sinal === '-', 'CAMILA · e faz 8% na C → C- (veio: "' + camila.sinal + '")');

  // Bruna — só torneios na D, ranking na C com 78%
  const bruna = cat([
    { categoria: 'Categoria D', tipo: 'torneio', wins: 3, losses: 1 },
    { categoria: 'Feminina P', tipo: 'torneio', wins: 1, losses: 2 },
    { categoria: 'Fem C+', tipo: 'ranking', wins: 7, losses: 2 },
  ]);
  ok(bruna.rotulo === 'D+', 'BRUNA · joga D, ranking na C com 78% → D+ (veio: ' + bruna.rotulo + ')');

  // ⚠️ ASSERÇÃO MINHA CORRIGIDA: eu tinha escrito que "entrar na C e perder não promove".
  // Contradiz a regra — se o torneio MAIS RECENTE é na C, a pessoa é C, com "-". É
  // exatamente o caso da Camila. O que a recência impede é o contrário: uma C ANTIGA
  // continuar mandando depois de a pessoa ter migrado pra D.
  const recenteNaC = cat([{ categoria: 'C', tipo: 'torneio', wins: 0, losses: 3 },
                          { categoria: 'D', tipo: 'torneio', wins: 5, losses: 1 },
                          { categoria: 'D', tipo: 'torneio', wins: 4, losses: 1 }]);
  ok(recenteNaC.rotulo === 'C-', 'jogou C por último e perdeu → C- (veio: ' + recenteNaC.rotulo + ')');
  ok(cat([{ categoria: 'D', tipo: 'torneio', wins: 5, losses: 1 },
          { categoria: 'D', tipo: 'torneio', wins: 4, losses: 1 },
          { categoria: 'C', tipo: 'torneio', wins: 0, losses: 3 }]).categoria === 'D',
     'C ANTIGA não manda depois de a pessoa migrar pra D (é o que a recência resolve)');
  // ⛔ nem mista entrar na conta da letra
  ok(cat([{ categoria: 'Mista D', tipo: 'torneio', wins: 0, losses: 4 },
          { categoria: 'Feminina C', tipo: 'torneio', wins: 3, losses: 1 }]).categoria === 'C',
     'mista não decide a letra (é outra modalidade)');
}

// ── ⭐ POUCOS JOGOS LÁ EM CIMA = AINDA BUSCANDO; MUITOS = JÁ É DE LÁ ───────────────
// Regra do dono (17/ago/2026): _"precisa jogar algumas vezes na C para ser C ainda que C-
// por estar na base"_ e _"com poucos jogos ainda fica como a kelly em D+"_.
// É o que separa as duas: a Kelly aparece pouco na C (ainda buscando → D+); a Camila joga
// C o tempo todo e faz 31% lá (já é C, mas no piso → C-).
{
  const poucos = cat([{ categoria: 'D', tipo: 'torneio', wins: 5, losses: 2 },
                      { categoria: 'C', tipo: 'ranking', wins: 2, losses: 2 }]);
  ok(poucos.rotulo === 'D+', 'poucos jogos na de cima → ainda D+ (veio: ' + poucos.rotulo + ')');
  const muitos = cat([{ categoria: 'C', tipo: 'torneio', wins: 2, losses: 8 },
                      { categoria: 'C', tipo: 'torneio', wins: 3, losses: 9 },
                      { categoria: 'D', tipo: 'torneio', wins: 4, losses: 1 }]);
  ok(muitos.rotulo === 'C-', 'muitos jogos na C, indo mal → C- (veio: ' + muitos.rotulo + ')');
  // ⚠️ o limiar do "-" é 35%: a Camila faz 31% na C e por 1 ponto ficava SEM sinal.
  // Trocar o número por um caso REAL é o que impede isso de virar chute.
  ok(cat([{ categoria: 'C', tipo: 'torneio', wins: 3, losses: 7 }]).sinal === '-',
     '30% na própria categoria dá "-"');
  ok(cat([{ categoria: 'C', tipo: 'torneio', wins: 5, losses: 5 }]).sinal === '',
     'mas 50% não é base — fica sem sinal');
}

// ══ LETRA SEM LASTRO NÃO SE SUSTENTA — E A REGRA VALE PRA TODOS ═══════════════════
// Ordem do dono (18/ago/2026): _"a regra tem que ser geral a aplicada a todos e ter o
// efeito certo"_ · _"nao dá pra mudar pra um e aplicar diferente que depois isso nos pegara
// na esquina"_. Ele disse isso vendo a 1ª versão desta regra, cujo gatilho eu tinha
// calibrado olhando as 14 pessoas da base — passava na amostra e falharia na 15ª.
// Por isso aqui não bastam os casos reais: tem VARREDURA do espaço, cobrando invariantes.
(function () {
  console.log('\n── letra sem lastro (regra geral) ──');

  // ── os três casos reais, que são os extremos do espectro ──────────────────────
  // M.Delia: 1 torneio na C (1V/2D) e 0V/3D na D. Não se firma em nenhuma → é D.
  const delia = cat([{ categoria: 'Feminina C', tipo: 'torneio', wins: 1, losses: 2 },
                     { categoria: 'Consolation D/C', tipo: 'torneio', wins: 0, losses: 1 },
                     { categoria: 'Feminina D', tipo: 'torneio', wins: 0, losses: 2 },
                     { categoria: 'Fem I', tipo: 'ranking', wins: 2, losses: 1 }]);
  ok(delia.rotulo === 'D-', 'M.DELIA · 1 torneio na C perdendo + 0V/3D na D → D- (veio: ' + delia.rotulo + ')');

  // Camila: MUITOS torneios na C, indo mal. Tem lastro → é C mesmo perdendo.
  const camila = cat([{ categoria: 'C', tipo: 'torneio', wins: 0, losses: 4 },
                      { categoria: 'C', tipo: 'torneio', wins: 2, losses: 4 },
                      { categoria: 'C', tipo: 'torneio', wins: 0, losses: 6 },
                      { categoria: 'C', tipo: 'torneio', wins: 2, losses: 4 },
                      { categoria: 'D', tipo: 'torneio', wins: 0, losses: 2 }]);
  ok(camila.rotulo === 'C-', 'CAMILA · muitos torneios na C, indo mal → C- (lastro segura a letra) (veio: ' + camila.rotulo + ')');

  // Quem manda embaixo está SUBINDO — não rebaixa nem sem lastro em cima.
  const subindo = cat([{ categoria: 'C', tipo: 'torneio', wins: 0, losses: 3 },
                       { categoria: 'D', tipo: 'torneio', wins: 5, losses: 1 },
                       { categoria: 'D', tipo: 'torneio', wins: 4, losses: 1 }]);
  ok(subindo.rotulo === 'C-', 'SUBINDO · 1 torneio na C perdendo mas 9-2 na D → C- (veio: ' + subindo.rotulo + ')');

  // ── VARREDURA: o espaço inteiro, cobrando invariantes ────────────────────────
  const ORD = { A: 0, B: 1, C: 2, D: 3, FUN: 4 };
  let casos = 0, subiu = 0, comLastroCaiu = 0, dominouEmbaixoCaiu = 0, semEvidencia = 0, degrauErrado = 0;
  const LETRAS = ['B', 'C', 'D'];
  [0, 1, 2, 3, 5].forEach(function (nTor) {          // torneios na base
    [1, 3, 6].forEach(function (jogosPorTor) {        // volume por torneio
      [0, 0.34, 0.5, 0.9].forEach(function (pctBase) {// desempenho na base
        [0, 2, 6].forEach(function (jogosAbaixo) {    // volume na de baixo
          [0, 0.34, 0.9].forEach(function (pctAbaixo) {
            LETRAS.forEach(function (L) {
              const abaixo = ['A', 'B', 'C', 'D', 'FUN'][ORD[L] + 1];
              const d = [];
              for (let k = 0; k < nTor; k++) {
                const w = Math.round(jogosPorTor * pctBase);
                d.push({ categoria: L, tipo: 'torneio', wins: w, losses: jogosPorTor - w });
              }
              if (jogosAbaixo) {
                const w2 = Math.round(jogosAbaixo * pctAbaixo);
                d.push({ categoria: abaixo, tipo: 'torneio', wins: w2, losses: jogosAbaixo - w2 });
              }
              const r = cat(d);
              if (!r) return;
              casos++;
              // A regra a cobrar é o REBAIXAMENTO — e agora o motor diz quando ele agiu
              // (`basePre` ≠ `categoria`). Medir contra a letra que EU montei no fixture
              // media outra coisa: a escolha da base acontece antes, e às vezes a letra de
              // cima nem chega a ser base (poucos jogos). Foi o que gerou 36 falsas violações.
              const desceu = r.basePre !== r.categoria;
              if (ORD[r.categoria] < ORD[r.basePre]) subiu++;          // 1. nunca sobe
              if (desceu) {
                const naPre = d.filter(function (x) { return x.categoria === r.basePre; });
                const torPre = naPre.filter(function (x) { return x.tipo === 'torneio' && (x.wins + x.losses) > 0; }).length;
                const jogPre = naPre.reduce(function (n, x) { return n + x.wins + x.losses; }, 0);
                if (torPre >= 2 || jogPre >= 6) comLastroCaiu++;        // 2. lastro protege
                const naNova = d.filter(function (x) { return x.categoria === r.categoria; });
                const wN = naNova.reduce(function (n, x) { return n + x.wins; }, 0);
                const jN = naNova.reduce(function (n, x) { return n + x.wins + x.losses; }, 0);
                if (jN > 0 && (wN / jN) > 0.35) dominouEmbaixoCaiu++;   // 3. quem vai bem embaixo sobe, não desce
                if (ORD[r.categoria] - ORD[r.basePre] !== 1) degrauErrado++;  // 5. um degrau, nunca dois
              }
              const jogosNaFinal = d.filter(function (x) { return x.categoria === r.categoria; })
                                    .reduce(function (n, x) { return n + x.wins + x.losses; }, 0);
              if (jogosNaFinal === 0) semEvidencia++;                   // 4. letra final tem jogo
            });
          });
        });
      });
    });
  });
  ok(casos > 500, 'a varredura cobriu o espaço (' + casos + ' perfis)');
  ok(subiu === 0, 'INVARIANTE: a regra nunca SOBE ninguém de categoria (violações: ' + subiu + ')');
  ok(comLastroCaiu === 0, 'INVARIANTE: quem tem lastro na letra não é rebaixado (violações: ' + comLastroCaiu + ')');
  ok(dominouEmbaixoCaiu === 0, 'INVARIANTE: quem manda na de baixo não é rebaixado — está subindo (violações: ' + dominouEmbaixoCaiu + ')');
  ok(semEvidencia === 0, 'INVARIANTE: a letra final sempre tem jogo de verdade nela (violações: ' + semEvidencia + ')');
  ok(degrauErrado === 0, 'INVARIANTE: quando rebaixa, desce UM degrau — nunca dois (violações: ' + degrauErrado + ')');
})();

console.log('\n' + (falhas ? '❌ ' + falhas + ' de ' + testes : '✅ ' + testes + ' asserções, 0 falhas') + '\n');
process.exit(falhas ? 1 : 0);
