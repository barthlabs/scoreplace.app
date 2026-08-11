/* A página do letzplay abre NO CLIQUE — node tests/letzplay-open-profile.test.js
 * Relato do dono (30/jul/2026): "continua não abrindo a página do letzplay assim que
 * clica no buscar. isso tem que ser instantâneo". A navegação era ENFILEIRADA junto com
 * as buscas e esperava o passo aprendido da fila (medido: 10–25 s por operação).
 */
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const app = R('js/views/tournaments-enrollment-report.js');
const cnt = R('extension/content.js');
const bg = R('extension/background.js');

// 1) o app pede a abertura no clique, ANTES de qualquer validação que possa desistir
const i = app.indexOf("__sp_lp: 'lz-open-profile'");
ok(i > 0, 'o app dispara lz-open-profile');
ok(i < app.indexOf("Este inscrito não tem @ do letzplay"),
  'a abertura vem ANTES do caminho de erro — clicou, a página abre');

// 2) a extensão traduz pra uma navegação IMEDIATA
ok(/lz-open-profile[\s\S]{0,400}lp-nav-now/.test(cnt), 'content.js manda lp-nav-now');
ok(/'lp-nav-now'[\s\S]{0,300}navLetzplayTab/.test(bg), 'background.js navega direto');

// 3) e essa navegação NÃO passa pela fila de trabalho
const bloco = bg.slice(bg.indexOf("'lp-nav-now'"), bg.indexOf("'lp-nav-now'") + 400);
ok(!/enqueue\(/.test(bloco), 'lp-nav-now NÃO é enfileirado (era isso que travava)');
const blocoAntigo = bg.slice(bg.indexOf("msg.type === 'lp-nav'"), bg.indexOf("msg.type === 'lp-nav'") + 400);
ok(/enqueue\(/.test(blocoAntigo), 'o lp-nav de trabalho continua serializado (não vira rajada)');

// 4) a ETAPA 0 não enfileira navegação de novo
const etapa0 = cnt.slice(cnt.indexOf('ETAPA 0'), cnt.indexOf('ETAPA 1'));
ok(!/type: 'lp-nav'\s*,/.test(etapa0), 'ETAPA 0 não gasta um passo da fila navegando');

// 5) o piso da fila decai — senão um bloqueio antigo deixa tudo lento pra sempre
const faster = bg.slice(bg.indexOf('function _qFaster'), bg.indexOf('function _qFaster') + 800);
ok(/_q\.floor\s*=/.test(faster), 'sucessos seguidos derrubam também o PISO aprendido');
ok(/_Q_DEFAULTS\.floor/.test(faster), 'o piso nunca desce abaixo do piso de fábrica');

// ── A ABA JÁ ESTÁ NA PÁGINA → NÃO NAVEGA E NÃO ESPERA ────────────────────────
// "porque fica 1min abrindo o perfil que já está aberto?" — navegar pra mesma URL
// recarrega a página E ainda cobra a espera de renderização derivada do passo aprendido.
{
  const nav = bg.slice(bg.indexOf('function navLetzplayTab'), bg.indexOf('// EXTRATOR do PERFIL'));
  ok(/chrome\.tabs\.get\(/.test(nav), 'navLetzplayTab confere a URL atual da aba antes de navegar');
  ok(/jaEstava/.test(nav), 'e responde na hora quando já está na página');
  ok(/t\.status === 'complete'/.test(nav), 'só considera "já está" com a página carregada');
  ok(/function seguir\(\)/.test(nav) && /[^n]seguir\(\);/.test(nav),
    'o caminho normal de navegação continua existindo pra quando NÃO está');
}

// ── O CASTIGO APRENDIDO EXPIRA ───────────────────────────────────────────────
// Sem prazo, uma tarde ruim deixava a leitura lenta pra sempre — medido: letzplay
// respondendo em 0,3–2,2 s e a fila esperando 10–25 s por causa de um bloqueio antigo.
{
  ok(/blockAt/.test(bg), 'a fila registra QUANDO apanhou');
  const carga = bg.slice(bg.indexOf('chrome.storage.local.get([_Q_KEY]'), bg.indexOf('var _qSaveT'));
  ok(/6 \* 3600000/.test(carga), 'sem bloqueio nas últimas 6 h, o passo volta ao de fábrica');
  ok(/return;/.test(carga), 'e o castigo vencido é simplesmente descartado');
  const dump = bg.slice(bg.indexOf('function _qDump'), bg.indexOf('function _qDump') + 220);
  ok(/blockAt/.test(dump), 'o instante do bloqueio é persistido junto com o passo');
  const slower = bg.slice(bg.indexOf('function _qSlower'), bg.indexOf('function _qSlower') + 420);
  ok(/_q\.blockAt = Date\.now\(\)/.test(slower), 'apanhar carimba o instante');
}

// ── QUEM PEDIU AGORA TEM PRIORIDADE ─────────────────────────────────────────
// "inves de abrir a pagina da pessoa vem esse erro preguicoso" — a extensão recusava a
// leitura nova com "ocupado — outra leitura em andamento; aguarde ela terminar".
{
  const run = cnt.slice(cnt.indexOf('function runAthleteImport'), cnt.indexOf('function runAthleteImport') + 1400);
  ok(!/ocupado — outra leitura/.test(cnt), 'a recusa por ocupado NÃO existe mais em lugar nenhum');
  ok(/_athleteAbort\+\+/.test(run), 'pedir outra pessoa ABANDONA a leitura anterior');
  ok(/_athleteImportUid === uid\) return/.test(run), 'pedir a MESMA pessoa que já roda continua no-op');
  ok(/abandonada/.test(cnt), 'a rodada abandonada sabe que foi substituída');
  const fim = cnt.slice(cnt.indexOf('} catch (e) {\n      // Leitura abandonada'), cnt.indexOf('} catch (e) {\n      // Leitura abandonada') + 420);
  ok(/code === 'abandonada'/.test(fim), 'abandono não vira toast de erro pro organizador');
}

// ── AÇÕES NO TOPO, SEMPRE VISÍVEIS ──────────────────────────────────────────
// "os botões puxar histórico e voltar têm que estar no topo da tela logo abaixo do
// cabeçalho, sempre ativo e visível." Com o card de nível + 3 barras + abas + lista, o
// rodapé do diálogo sai da tela.
{
  const rep = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  // As ações passaram da barra `sticky` (que vazava por cima do conteúdo e roubava uma
  // faixa de altura) pra LINHA DO NOME, no cabeçalho — que já é fixo por construção.
  ok(!/id="lz-acoes-topo"/.test(rep), 'a barra sticky saiu de cena');
  ok(/headerHtml:/.test(rep), 'as ações vão no cabeçalho do diálogo');
  const hdr = rep.slice(rep.indexOf('headerHtml:'), rep.indexOf('headerHtml:') + 1500);
  ok(/← Voltar/.test(hdr) && /_lzFecharDialogo/.test(hdr), 'tem Voltar, ligado ao fechamento');
  const btn = rep.slice(rep.indexOf('function _botaoPuxar()'), rep.indexOf('function _botaoPuxar()') + 1400);
  ok(/_lzPuxarDoTopo/.test(btn), 'e o botão de puxar, ligado à leitura');
  ok((btn.match(/_esc\(btnLabel\)/g) || []).length === 2,
     'usa o MESMO rótulo do botão nativo nos DOIS estados (vira "Continuar" quando incompleto)');
  // 01/ago/2026: no celular a leitura é impossível — quem lê é a extensão, na sessão do
  // usuário, e ela só roda no computador. O dono tocou no botão azul no iPhone e nada
  // aconteceu, sem uma palavra. Botão que não pode agir tem que parecer que não pode.
  ok(/function _podePuxar\(\)/.test(rep), 'a tela sabe se dá pra puxar aqui');
  ok(/iPhone\|iPad\|iPod\|Android/.test(rep), 'reconhece o celular');
  ok(/window\._lzExtVer/.test(rep), 'e a extensão que se anunciou nesta aba');
  ok(/disabled/.test(btn) && /cursor:not-allowed/.test(btn), 'sem poder puxar, o botão fica cinza e travado');
  ok(/Aqui não dá pra puxar/.test(rep) && /só roda no computador/.test(rep),
     'e o corpo explica por quê, onde o usuário está olhando');
  // 01/ago/2026: sem letzplay não há o que puxar — a ficha abre igual, só sem esse botão.
  ok(/\(_temLz$/m.test(hdr) || /_temLz\s*\n?\s*\?/.test(hdr), 'e o botão de puxar só aparece quando existe letzplay');
  ok(rep.indexOf('headerHtml:') > rep.indexOf("var btnLabel = '📚 Puxar histórico completo'"),
    'montado depois de o rótulo estar decidido (senão sai "undefined")');
  ok(/window\._lzDialogUid = uid/.test(rep), 'o diálogo registra sobre quem as ações agem');
  const puxar = rep.slice(rep.indexOf('window._lzPuxarDoTopo'), rep.indexOf('window._lzPuxarDoTopo') + 700);
  ok(/_lzAthleteImport\(uid\)/.test(puxar), 'o botão dispara a leitura');
  ok(/catch \(e\)/.test(puxar), 'e não morre calado se estourar');
}

// ── A DESATUALIZAÇÃO APARECE AO ABRIR A FICHA, NÃO DEPOIS DO CLIQUE ────────────────────
// Pedido do dono (02/ago/2026): "o certo seria já trazer a desatualização assim que abre a
// página do jogador, antes de clicar em qualquer coisa, sempre." Antes a checagem só
// existia DENTRO do "Puxar": a pessoa lia a ficha inteira, clicava, e só então descobria.
{
  const rep = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  ok(/function _lzConferirExtensao\(\)/.test(rep), 'existe a conferência ao abrir');
  ok(/if \(_temLz\) _lzConferirExtensao\(\);/.test(rep), 'e ela roda logo depois de montar o diálogo');
  ok(/body = '<div id="lz-ext-aviso"><\/div>' \+ body;/.test(rep), 'com um slot no TOPO do corpo');
  const fn = rep.slice(rep.indexOf('function _lzConferirExtensao'), rep.indexOf('// Ações da barra do topo'));
  ok(/__sp_lp: 'ext-ping'/.test(fn), 'pergunta a versão à extensão');
  ok(/_verGE\(melhor, _LZ_MIN_EXT\)/.test(fn), 'e compara com o mínimo exigido');
  ok(/Extensão desatualizada/.test(fn) && /Extensão não encontrada/.test(fn),
     'distingue "velha" de "não instalada" — são coisas diferentes pra quem lê');
  ok(/b\.setAttribute\('disabled', 'disabled'\)/.test(fn),
     'e o botão de puxar deixa de prometer o que não pode cumprir');
  // ⚠️ REVISADO DUAS VEZES:
  //   1.8.4  — travava "o link do zip sai da fonte única da versão"; virou "não há mais
  //            link de zip", porque a extensão passou a viver na Chrome Web Store.
  //   1.8.15 — ordem do dono: _"não adianta apontar para a loja enquanto a nova versão não
  //            estiver lá"_. Enquanto a revisão não sai, a loja serve a versão que o gate
  //            barra e clicar nela não resolve nada. Então o aviso passa a oferecer o ZIP
  //            NESSA JANELA — e só nela.
  // O invariante real segue travado, e é este: o aviso nunca escolhe sozinho. Ele consulta
  // a fonte única da decisão; quando a loja atende, é pra ela que manda.
  ok(/SP_EXT_STORE_URL/.test(fn), 'o aviso aponta pra loja, pela fonte única');
  ok(/_spExtStoreTemMinimo/.test(fn), 'e a escolha loja×zip vem da fonte única, não de regra local');
  ok(/_spExtZipUrl/.test(fn), 'o zip está disponível pra janela em que a loja não resolve');
  ok(/movel\) \{ caixa\.innerHTML = ''; return; \}/.test(fn),
     'no celular não aparece — lá não há extensão pra instalar, e o aviso próprio já explica');
}

console.log((fail ? '✗' : '✓') + ' letzplay-open-profile: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
