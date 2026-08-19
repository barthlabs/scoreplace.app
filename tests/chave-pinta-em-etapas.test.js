/* A CHAVE PINTA EM FATIAS — conteúdo REAL na 1ª tacada, e nenhuma fica pelo caminho.
 *
 * HISTÓRIA (as três encarnações, cada uma paga):
 *   • 1.9.40 — "duas tacadas": cabeçalho primeiro, corpo depois. Rápida, MAS entre as
 *     tacadas havia um quadro quase vazio = piscada preta no escuro (dono mediu).
 *   • 1.9.42 — DESLIGADA por isso; voltou a pintar de uma vez (~1.500ms até aparecer
 *     qualquer coisa na chave do Confra, 102 jogos / ~6.000 nós).
 *   • 1.9.74 — o desenho que a própria 1.9.42 encomendou: a 1ª tacada leva o cabeçalho
 *     + as PRIMEIRAS caixas de grupo (conteúdo real, sem quadro vazio); o resto entra
 *     em LOTES por quadro, ACRESCENTANDO (nunca reconstruindo). O HTML pesado é
 *     parseado num <template> DESTACADO — paga parse, não paga layout.
 *
 * O que este teste trava (a INTENÇÃO, não a letra):
 *   1. fatia só ACRESCENTA — e só com o container VAZIO (navegação); re-render pinta
 *      de uma vez (os restauradores de details/placar-digitado/âncora leem o DOM
 *      logo após o render e fatiar quebraria os três);
 *   2. agendador DUPLO (rAF + timeout) com trava de uma-vez-só — rAF não dispara em
 *      aba de fundo, e sozinho deixaria a pessoa com meia lista pra sempre;
 *   3. se o anexo falhar, cai pro HTML INTEIRO — nunca meia tela;
 *   4. render que assumiu a tela mata a pintura antiga (guard de isConnected);
 *   5. existe descarga síncrona (_flushBracketPaint) que DRENA os passos em fila —
 *      é o que o headless usa pra ver a chave inteira;
 *   6. o "depois" (filtro/DnD/scroll) roda após a ÚLTIMA fatia, nunca entre elas;
 *   7. a ordem na tela não muda (lista de espera segue DEPOIS dos grupos);
 *   8. loader global só quando a tela está VAZIA — re-render com conteúdo é MUDO
 *      (era o "mostra, volta a carregar, mostra de novo" do dono);
 *   9. ⛔ content-visibility não volta (corta a lista no scroll e come o 1º toque).
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

console.log('\n== a chave pinta em fatias ==');

// pega a função inteira (contando chaves não dá com regex simples; janela generosa)
const iFn = src.indexOf('function _pintarEmEtapas');
const fn = src.slice(iFn, src.indexOf('function _agendarPasso'));
const agendador = src.slice(src.indexOf('function _agendarPasso'), src.indexOf('window._flushBracketPaint'));

// 1. fatia acrescenta, e só com container vazio
ok(/appendChild\(tarde\[i\]\)/.test(fn), 'a fatia ACRESCENTA (appendChild), nunca reconstrói');
ok(/_fatiar\s*=\s*_temTemplate\s*&&\s*!\(container && container\.firstElementChild\)/.test(fn),
   'só fatia com o container VAZIO — re-render (details/placar digitado/âncora) pinta de uma vez');
ok(/<?template/.test(fn) && /createElement\('template'\)/.test(fn),
   'o HTML pesado parseia num <template> destacado (parse sem layout)');

// 2. agendador duplo + trava de uma vez
ok(/requestAnimationFrame/.test(agendador), 'agenda por quadro (rAF)');
ok(/setTimeout\(/.test(agendador), 'E por timeout (rAF não dispara em aba de fundo)');
ok(/if \(feito\) return; feito = true;/.test(agendador), 'trava de uma-vez-só nos dois agendadores');

// 3. rede contra meia tela
ok(/catch[\s\S]{0,200}innerHTML = leve \+ _tudo/.test(fn), 'anexo falhou → HTML inteiro, nunca meia tela');

// 4. pintura antiga morre quando outro render assume
ok(/if \(!bulk\.isConnected\) return;/.test(fn), 'render novo mata a pintura antiga (isConnected)');

// 5. descarga síncrona drena a FILA (passos encadeados incluídos)
ok(/window\._flushBracketPaint\s*=\s*function/.test(src), 'há porta síncrona pra pintar tudo agora');
ok(/while \(_pendentes\.length\)/.test(src), 'e ela DRENA a fila (passos que agendam passos saem juntos)');

// 6. o "depois" roda após a última fatia
ok(/i < tarde\.length[\s\S]{0,60}return;[\s\S]{0,600}depois\(\)/.test(fn),
   'o "depois" (filtro/DnD/scroll) roda depois da ÚLTIMA fatia');

// os ramos pesados continuam passando pela pintura em etapas, com o filtro de "depois"
const nEtapas = (src.match(/(?<!function )_pintarEmEtapas\(container/g) || []).length;
const nDepois = (src.match(/,\s*_applyMyMatchesFilter\);/g) || []).length;
ok(nEtapas >= 3, 'os ramos pesados usam a pintura em etapas (achei ' + nEtapas + ')');
ok(nDepois === nEtapas, 'todo ramo entrega o filtro como "depois" (' + nDepois + '/' + nEtapas + ')');

// 7. ordem preservada: a lista de espera viaja com o corpo, atrás dos grupos
ok(/return renderGroupStage\([^)]*\) \+ standbyHtml;/.test(src),
   'lista de espera não pula pra cima dos grupos');

// 8. loader global só com a tela vazia (o "volta a carregar" morreu aqui)
const iEQ = src.indexOf('function _entregarQuandoPronto');
const eq = src.slice(iEQ, iFn);
ok(/_mostraLoader\s*=\s*!\(container && container\.firstElementChild\)/.test(eq),
   '"Carregando o torneio…" só sobe com a tela VAZIA — reconciliação é muda');
ok(/_mostraLoader && typeof window\._showLoading/.test(eq),
   'e o showLoading respeita o gate');

// 9. ⛔ content-visibility não volta (regressões pagas: dica sem posição, lista cortada
// no scroll, 1º toque engolido). O CSS guarda as regras DESLIGADAS + o porquê.
const cssComp = fs.readFileSync(path.join(__dirname, '..', 'css', 'components.css'), 'utf8');
const cssVivo = cssComp.replace(/\/\*[\s\S]*?\*\//g, '');
const cvAtivo = (cssVivo.match(/content-visibility:\s*auto/g) || []);
ok(cvAtivo.length === 0, 'nenhum content-visibility ATIVO no CSS — achei ' + cvAtivo.length);

console.log((fail ? '❌' : '✅') + ' chave-pinta-em-etapas: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
