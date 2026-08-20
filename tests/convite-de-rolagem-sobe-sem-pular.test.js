/* O CONVITE DE ROLAGEM SOBE SEM PULAR, E O DE PERFIL APONTA PRA CIMA
 * node tests/convite-de-rolagem-sobe-sem-pular.test.js
 *
 * O QUE ESTE TESTE PROTEGE (1.9.89, homologado num mock da tela real):
 *
 * 1. A SETA NÃO PULA. A versão anterior TROCAVA DE ÂNCORA no meio do caminho —
 *    de `fixed` no rodapé pra `absolute` presa ao documento — e teleportava a
 *    distância entre as duas posições. Relato do dono: _"a seta não pode pular,
 *    ela deve passar a subir fluida até chegar no topo e aí sumir esmaecendo"_.
 *    O conserto NÃO é uma transição: é a posição virar função CONTÍNUA da
 *    rolagem, `y = min(repouso, desejado)`. No ponto onde as duas retas se
 *    cruzam os valores são IGUAIS — daí não existe degrau.
 *    MEDIDO no app real, varrendo a rolagem de 10 em 10px em 644 amostras:
 *    maior degrau em Y = 10px, exatamente o passo da rolagem (1:1 com o dedo).
 *    ⛔ Voltar a `top`/`bottom` ou a um segundo modo de ancoragem traz o pulo.
 *
 * 2. A GEOMETRIA DA SETA TEM UM PORQUÊ MEDIDO. A haste chegou a ter 81% da base
 *    do triângulo (pedido do dono: _"a seta e a base da seta podem ser mais
 *    largas"_) e nessa proporção ela VIRA CASINHA quando aponta pra cima:
 *    retângulo largo embaixo + triângulo em cima = telhado. Veredito do dono:
 *    _"a base da seta ficou parecendo uma casinha quando aponta pra cima"_.
 *    Quem salva a leitura é a ASA — o que sobra do triângulo pra fora da haste.
 *    Haste 74 sobre base 118,4 = 62,5%, asa de 22,2 de cada lado.
 *    ⛔ Não engordar a haste sem olhar a seta ROTACIONADA.
 *
 * 3. O PERFIL NÃO É CONVITE DE ROLAGEM. Ordem do dono: _"a seta de perfil tem
 *    que apontar para o hamburger e depois para o acesso ao perfil"_. Ele aponta
 *    pra CIMA, em duas etapas, e por isso escapa da regra "só convida o que está
 *    fora da vista" — a chrome do topo está sempre à vista.
 *
 * 4. `pointer-events` NUNCA `auto` no container. Ele tem 100% da largura: com
 *    `auto` viraria uma faixa invisível que engole o toque da tela inteira.
 *    A tinta (texto e seta) é que recebe o clique.
 *
 * 5. NADA DE ANIMAÇÃO INFINITA. Foi uma delas (btnCtaShine em 6 botões) que
 *    derrubou a rolagem do app inteiro — o gravador de voo fotografou
 *    `anim=6:btnCtaShine×6` com ZERO JS rodando.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── convite de rolagem sobe sem pular ────');

const i0 = src.indexOf('window._mostrarConviteDeRolagem = function');
ok(i0 > 0, 'existe o convite de rolagem');
const bloco = src.slice(i0, src.indexOf('window._setaEncontreSeuTorneio', i0));

// ── 1. a subida é contínua ──────────────────────────────────────────────────
ok(/var y = Math\.min\(repouso, desejado\);/.test(bloco),
   'a posição é min(repouso, desejado) — contínua por construção');
ok(/var repouso = vh - h - FOLGA_BAIXO;/.test(bloco), 'o repouso é o rodapé da tela');
ok(/var desejado = r\.top - h - FOLGA_ALVO;/.test(bloco), 'o desejado acompanha o topo do quadro');
ok(/pil\.style\.transform = 'translate\(-50%,' \+ y \+ 'px\)';/.test(bloco),
   'a posição vertical é transform (composta na GPU), nunca top/bottom');
ok(!/pil\.style\.top =/.test(bloco), 'ninguém escreve `top` no convite (forçaria layout por quadro)');
ok(!/classList\.add\('ancorada'\)/.test(bloco) && !/\.ancorada/.test(src),
   'o modo ANCORADO (a troca de âncora que causava o pulo) não existe mais');
ok(!/position:absolute/.test(bloco), 'o convite não vira absolute em momento nenhum');

// ── 2. esmaece ao chegar no topo, e só então se encerra ─────────────────────
ok(/var op = Math\.max\(0, Math\.min\(1, \(y - limiteTopo\) \/ FADE\)\);/.test(bloco),
   'a opacidade cai nos últimos FADE px antes do topo');
ok(/y = Math\.max\(y, limiteTopo\);/.test(bloco), 'e ela estaciona no topo, já invisível');
ok(/if \(op <= 0\.001\) fechar\(true\);/.test(bloco),
   'quando some de vez, encerra e conta como aprendido');
ok(/pil\.style\.transition = 'none';/.test(bloco),
   'ao esmaecer, a transição do CSS sai da frente (senão a seta atrasa em relação ao dedo)');

// ── 3. uma leitura de layout por quadro, antes de qualquer escrita ──────────
const iAvaliar = bloco.indexOf('var avaliar = function () {');
const avaliar = bloco.slice(iAvaliar, bloco.indexOf('var aoRolar', iAvaliar));
const primeiraEscrita = avaliar.indexOf('pil.style.transform');
const ultimaLeitura = Math.max(
  avaliar.indexOf('getBoundingClientRect'),
  avaliar.lastIndexOf('getBoundingClientRect'),
  avaliar.indexOf('pil.offsetHeight')
);
ok(ultimaLeitura < primeiraEscrita,
   'TODAS as leituras de layout vêm antes da primeira escrita (um reflow só)');
ok(/requestAnimationFrame\(avaliar\)/.test(bloco) && /if \(pendente\) return;/.test(bloco),
   'o scroll só AGENDA: quem mede é um rAF, uma vez por quadro');
ok(/setTimeout\(function \(\) \{ if \(pendente\) avaliar\(\); \}, 120\)/.test(bloco),
   'e corre com rede de timeout (rAF não dispara em aba de fundo)');

// ── 4. a geometria da seta ──────────────────────────────────────────────────
const iSvg = bloco.indexOf('<svg class="seta"');
const svg = bloco.slice(iSvg, bloco.indexOf('</svg>', iSvg));
ok(/viewBox="0 0 128 92"/.test(svg), 'a seta usa o viewBox homologado (128×92)');
const d = /d="([^"]+)"/.exec(svg);
ok(!!d, 'a seta é um path só, preenchido');
if (d) {
  // haste: os dois "V"/"v" verticais do topo — 35→93 (+58) com cantos de 8 de cada
  // lado dá 27..101 = 74 de largura. Base: 4.8..123.2 = 118,4.
  ok(/^M35 4h58a8 8 0 0 1 8 8v28h17/.test(d[1]),
     'a haste nasce em 35 e tem 58 de trecho reto (27..101 com os cantos = 74 de largura)');
  ok(/L4\.8 51\.7A7 7 0 0 1 10 40h17V12/.test(d[1]),
     'a base do triângulo vai a 4,8 (espelho de 123,2) = 118,4 de largura');
  ok(!/stroke=/.test(svg), 'sem stroke: ele engorda a ponta e some com a haste em tela pequena');
}
// a razão que importa: 74 / 118,4 = 62,5% — longe dos 81% que viravam casinha
ok(Math.abs((74 / 118.4) - 0.625) < 0.005, 'haste = 62,5% da base (a asa de 22,2 salva a leitura)');

// ── 5. o convite de perfil aponta pra cima, em duas etapas ─────────────────
ok(/\{ id: 'perfil',    texto: 'complete seu perfil',             alvo: '#dash-profile-nudge', praCima: true \}/.test(src),
   'o perfil é praCima e usa o nudge só como ELEGIBILIDADE');
ok(/window\._conviteAlvoPerfil = function/.test(src), 'existe o resolvedor do alvo do perfil');
const iAlvo = src.indexOf('window._conviteAlvoPerfil = function');
const alvoPerfil = src.slice(iAlvo, src.indexOf('};', iAlvo));
ok(/dd\.querySelector\('#btn-login'\)/.test(alvoPerfil),
   'ETAPA 2: com o menu aberto, busca o perfil COM ESCOPO no dropdown');
ok(/cloneNode\(true\)` do _toggleHamburger DUPLICA o id/.test(src) || /DUPLICA o id/.test(src),
   'e o porquê do escopo está escrito (cloneNode duplica o id btn-login)');
ok(/var ham = document\.querySelector\('\.hamburger-btn'\);[\s\S]{0,120}offsetParent !== null/.test(alvoPerfil),
   'ETAPA 1: aponta pro hambúrguer quando ele está visível');
ok(/if \(c\.praCima\) \{[\s\S]{0,400}\} else if \(r\.top < alturaTela - 80\)/.test(bloco),
   'o praCima escapa da regra "só convida o que está fora da vista"');
ok(/observadorMenu = new MutationObserver\(aoRolar\)/.test(bloco),
   'a troca de etapa é disparada pela classe .open do dropdown');
ok(/rotate\(180deg\)/.test(bloco) || /rotate\(180deg\)/.test(src),
   'a seta do perfil é a MESMA, rotacionada 180°');
ok(/var x = Math\.min\(Math\.max\(meio, meia \+ 8\), vw - meia - 8\);/.test(bloco) &&
   /translateX\(' \+ \(meio - x\) \+ 'px\) rotate\(180deg\)/.test(bloco),
   'perto da borda o TEXTO se afasta e a SETA continua cravada no alvo');

// ── 6. o toque e a pintura ─────────────────────────────────────────────────
const iCss = src.indexOf("st.textContent =", i0);
const css = src.slice(iCss, src.indexOf('document.head.appendChild(st);', iCss));
// o CSS é montado por concatenação de literais; desfaz a emenda pra poder
// casar regra por regra (senão um `[^']*` para na primeira aspa da junção)
const cssPlano = css.replace(/'\s*\+\s*'/g, '').replace(/'\s*\+\s*\n\s*/g, '');
ok(/pointer-events:none;opacity:0/.test(cssPlano), 'o container (100% da largura) NÃO recebe toque');
ok(/\.rotulo\{[^}]*pointer-events:auto/.test(cssPlano) && /\.seta\{[^}]*pointer-events:auto/.test(cssPlano),
   'só a tinta (texto e seta) recebe o toque');
ok(!/@keyframes/.test(css), 'sem animação infinita (foi uma delas que derrubou a rolagem do app)');
ok(!/backdrop-filter/.test(css), 'sem backdrop-filter (mata a rolagem por GPU no WKWebView)');
ok(/text-shadow:0 1px 3px rgba\(0,0,0,0\.95\)/.test(css),
   'o contraste do texto vem de sombra, não de tarja escura atrás');
ok(/#sp-convite-scrim\{[^}]*opacity:0/.test(cssPlano), 'o esmaecido do rodapé nasce invisível');
ok(/scrim\.style\.opacity = op \* Math\.max/.test(bloco),
   'e se dissolve conforme a seta sobe (não escurece o quadro que ela indica)');

// ── 7. os textos são os do dono, na letra ──────────────────────────────────
[
  'encontre seus torneios',
  'novidades nos seus torneios',
  'confira seus últimos resultados',
  'veja quem está em quadra',
  'complete seu perfil'
].forEach(function (t) {
  ok(src.indexOf("texto: '" + t + "'") > 0, 'texto na letra: "' + t + '"');
});

// ── 8. familiaridade: os cinco convites têm como se calar ──────────────────
['torneio', 'novidades', 'resultados', 'presenca', 'perfil'].forEach(function (chave) {
  const marca = new RegExp("_marcarFamiliaridade\\('" + chave + "'\\)");
  const emAlgumLugar = ['js/store.js', 'js/views/dashboard.js', 'js/views/auth.js'].some(function (f) {
    return marca.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  });
  ok(emAlgumLugar, 'o convite "' + chave + '" tem gancho de familiaridade (sem ele, nunca se cala)');
});

console.log(`\n  ${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
