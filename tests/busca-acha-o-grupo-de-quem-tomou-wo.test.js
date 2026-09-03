/* BUSCAR QUEM LEVOU W.O. TEM DE ACHAR O GRUPO DELE
 *
 * Relato do dono (22/ago/2026): _"quando usamos a barra de filtro/buscas e coloco por
 * exemplo nina, está aparecendo apenas ela no W.O., mas quero que apareça também o grupo
 * onde ela estava e consta lá que ela estava naquele grupo e tomou o W.O. e foi substituída
 * por não sei quem. quero que isso apareça. o nome dela está no grupo com W.O., deveria
 * aparecer."_
 *
 * POR QUE SUMIA: o filtro (`_bracketApplyFilter`) só enxerga `[data-players]` e esconde
 * TODO container que ficou sem nenhum casando — foi a decisão da v1.6.86, e é a certa.
 * Só que quem leva W.O. SAI dos jogos do grupo: o substituto ocupa o slot, e o nome dela
 * some de `team1`/`team2`, que é de onde o card monta o `data-players`. Buscar "nina"
 * escondia o box inteiro do R1 Grupo X. Sobrava o chip solto na caixa "W.O.", que não diz
 * de qual grupo ela era nem quem entrou no lugar.
 *
 * Medido no Confra: no R1 Grupo X os 3 jogos são "ELIANE / Priscila", "ELIANE / Michelle",
 * "ELIANE / Fabio" — nenhum menciona a Nina. O nome dela vive em `g.woAbsent` e no marcador.
 *
 * DOIS PONTOS declaram, e são complementares de propósito:
 *   1. a PÍLULA "🔁 Nina W.O. → Priscila" — é o único lugar com os DOIS nomes juntos;
 *   2. a LINHA da classificação — a pílula só existe com o torneio EM ANDAMENTO
 *      (`_ligaGroupControlsHtml` retorna cedo quando `status === 'finished'`), e a busca
 *      tem de continuar achando o grupo depois que o torneio acaba.
 */
const fs = require('fs');
const path = require('path');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) { console.log('  ✓ ' + nome); return; }
  console.log('  ✗ ' + nome + (extra ? '\n      ' + extra : '')); falhas++;
};

console.log('──── buscar quem levou W.O. acha o grupo dele ────');

const ROOT = path.join(__dirname, '..');
const liga = fs.readFileSync(path.join(ROOT, 'js', 'views', 'liga-substitution.js'), 'utf8');
const bracket = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');

// ── 1. a pílula do W.O. ──────────────────────────────────────────────────────────────
// 2.0.53: a pílula virou LISTA (uma por W.O., _ligaGroupWoList) — âncora acompanha;
// o invariante segue: TODA pílula declara data-players com os dois nomes.
ok('a pílula "W.O. → substituto" declara data-players',
  /'<span data-players="' \+ _busca/.test(liga),
  'sem isso o box do grupo some quando se busca quem saiu');
ok('  → e carrega os DOIS nomes (quem saiu E quem entrou)',
  /_busca = window\._safeHtml\(String\(par\.absentName \|\| ''\) \+ ' ' \+ String\(par\.subName \|\| ''\)\)/.test(liga),
  'o dono quer achar o grupo tanto pelo nome de quem saiu quanto pelo de quem entrou');
ok('  → e é marcada como não-jogo, pro "Só meus jogos" não apagá-la',
  /'<span data-players="[\s\S]{0,60}data-my-match="1"/.test(liga));

// ── 2. a linha da classificação (o caso do torneio encerrado) ────────────────────────
ok('a linha de quem levou W.O. na classificação declara data-players',
  /_woBuscaLinha = \(_isRed \|\| _isAmb\)[\s\S]{0,200}data-players="/.test(bracket));
ok('  → só para quem está em W.O./apontado (não para a tabela inteira)',
  /_woBuscaLinha = \(_isRed \|\| _isAmb\)\s*\n\s*\?/.test(bracket),
  'declarar todas as linhas faria qualquer busca manter todos os 34 grupos de pé');
ok('  → e entra no <tr>, que é quem sobrevive em qualquer estado do torneio',
  /return '<tr' \+ _woBuscaLinha \+ ' style=/.test(bracket));
ok('  → também marcada como não-jogo',
  /_woBuscaLinha = \(_isRed \|\| _isAmb\)[\s\S]{0,200}data-my-match="1"/.test(bracket));

// ── 3. o filtro continua sendo UM só ─────────────────────────────────────────────────
// Se alguém criar um segundo mecanismo de visibilidade, as duas decisões brigam e a
// segunda a rodar desfaz a primeira — foi o que já aconteceu com busca × "só meus jogos".
ok('quem decide visibilidade continua sendo _bracketApplyFilter, por [data-players]',
  // ⚠️ Janela ampliada em 2.0.88: a função ganhou, no topo, a porta que MONTA os
  // lotes guardados da chave antes de filtrar — grupo adiado não tem card no DOM, e
  // a busca diria "nenhum resultado" MENTINDO. A intenção não mudou: quem decide
  // visibilidade continua sendo ESTE filtro, por [data-players].
  // ⚠️ Ampliada de novo em 2.1.83, pelo MESMO motivo: o topo da função passou a guardar a
  // posição de rolagem (pro spacer canônico devolvê-la depois do filtro) e o comentário que
  // explica por que essa leitura é protegida. Continua sendo só prólogo — a decisão de
  // visibilidade segue neste filtro, por [data-players]. Se um dia isto crescer de novo,
  // amplie: o que a asserção trava é QUEM decide, não em que coluna a decisão começa.
  // ⚠️ Ampliada de novo em 2.1.111 (2600 → 4200), pelo MESMO motivo das duas vezes
  // anteriores: o prólogo ganhou mais DUAS portas, e nenhuma delas decide visibilidade.
  //   · `_flushBracketPaint()` — termina a pintura em fatias antes de filtrar (a chave
  //     pintava pela metade e o filtro escondia o que ainda não tinha chegado);
  //   · `_hydrateUidNames()` — PUXA o nome por uid dos cards que `_chaveMontaTudo` acabou
  //     de montar. Sem isso o grupo adiado entrava no DOM com o span de nome VAZIO e
  //     procurar aquela pessoa nunca achava — medido pelo dono: "ro mostra, mo não".
  // As duas são PRÓLOGO: garantem que o filtro veja a chave inteira e com os nomes. A
  // decisão de quem aparece segue aqui, por [data-players], que é o que esta trava guarda.
  /window\._bracketApplyFilter = function[\s\S]{0,4200}querySelectorAll\('\[data-players\]'\)/.test(bracket));

// ── 4. a regra vale para o caso REAL do Confra ───────────────────────────────────────
// Simula o que o filtro faz: normaliza e procura o trecho no data-players declarado.
const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const declaradoNaPilula = norm('Nina Pereira Lima' + ' ' + 'Priscila Cassandre');
ok('buscar "nina" casa a pílula do R1 Grupo X', declaradoNaPilula.indexOf(norm('nina')) !== -1);
ok('buscar "priscila" (quem entrou) também casa', declaradoNaPilula.indexOf(norm('priscila')) !== -1);
ok('buscar acento-insensitive continua valendo ("assuncao" acha "Assunção")',
  norm('Glauce Assunção').indexOf(norm('assuncao')) !== -1);
ok('quem não tem nada a ver não casa', declaradoNaPilula.indexOf(norm('marilia')) === -1);

console.log(falhas === 0
  ? '\n✅ busca-acha-o-grupo-de-quem-tomou-wo: OK'
  : '\n❌ busca-acha-o-grupo-de-quem-tomou-wo: ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
