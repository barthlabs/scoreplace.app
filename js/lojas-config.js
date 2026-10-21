// Configuração pública das lojas, compartilhada com a página do QR.
// ⚠️ `badge` = o SELO OFICIAL da loja, em arquivo. O convite IMPRESSO desenhava as lojas
// como TEXTO com um glifo ("▶ Google Play"), imitando a marca — o dono viu impresso e
// chamou de ridículo, com razão: em papel, marca imitada parece amadora. Os selos são
// fornecidos pelas próprias lojas (Apple Marketing Guidelines / Google Play brand assets)
// e existem justamente pra isso.
// ⚠️ Se o arquivo não existir, o flyer VOLTA pro texto sozinho (onerror) — nunca fica um
// buraco na folha.
// ⚠️ Apple é SVG, Google é PNG: o Google NÃO publica o selo em vetor. Não converter à
// mão — selo redesenhado foi o que produziu o resultado que o dono chamou de ridículo.
// ⚠️ SÃO DOIS CAMPOS PORQUE SÃO DUAS PERGUNTAS DIFERENTES:
//   `on`   = a loja está NO AR? Governa o botão "Baixar na loja" da tela inicial. Botão
//            ligado com ficha em 404 manda o usuário pra "não encontrado" DENTRO do app.
//   `selo` = mostrar o selo da loja no CONVITE IMPRESSO? Ali o selo comunica "vai estar
//            nas duas lojas", e quem imprime é o organizador, que sabe o contexto.
// Isto nasceu de um teste ficando vermelho (`notificacao-lida-e-botao-da-loja`): ligar a
// Play pro convite ia ligar JUNTO o botão do app, efeito que o dono não pediu. Ele pediu
// os dois SELOS no impresso (19/ago/2026); o botão continua esperando o 200.
// ✅ 22/ago/2026: a produção da Play SAIU e `play.on` virou. Com as duas ligadas, as três
// bocas passam a mostrar as duas lojas de uma vez — o selo da landing, o botão "Baixar na
// loja" (que no Android para de sumir) e o selo do convite impresso. Era o objetivo do
// desenho: uma chave, três lugares.
window.SP_LOJAS = {
  // ── PROCEDÊNCIA DAS ARTES (conferida em 24/ago/2026) ────────────────────────────────
  // O dono perguntou se os selos eram os oficiais ("baixei numa busca livre"). Baixei os dois
  // das FONTES OFICIAIS e comparei byte a byte: são os MESMOS arquivos (sha256 idêntico), e
  // os dois já são pt-BR — que é a versão que ele quer.
  //   • App Store  ← https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/pt-br
  //     9.892 bytes · sha256 0e9291a9c654e479762b75b51dd94a150af6fab76390a79cb2218cdc8f6cc893
  //     (o próprio <title> do SVG diz `..._Badge_PTBR_...` — "Baixar na App Store")
  //   • Google Play ← https://play.google.com/intl/en_us/badges/static/images/badges/pt-br_badge_web_generic.png
  //     17.728 bytes · sha256 e1ad5e03f636d94b05448c1f156e39b012b9e1d772b730d9e27d066695531a6b
  //     ("DISPONÍVEL NO Google Play")
  // ⛔ Trocar por arquivo de busca livre é rebaixar: `tests/selos-das-lojas-do-mesmo-tamanho`
  // trava os dois sha256 e fica vermelho. Pra atualizar, baixe DAS URLs acima e refaça o
  // hash — e remeça a `tinta`, que muda se a Google reenquadrar a arte.
  //
  // ⚠️ `tinta` = quanto da ALTURA DO ARQUIVO é arte visível. As duas artes oficiais não são
  // enquadradas igual: a da Apple é de borda a borda (1,000), a do Google traz 29px de margem
  // transparente em cima e embaixo dos 250 (192/250 = 0,768) — é a "clear space" que a
  // diretriz do Google exige em volta do selo, embutida no próprio arquivo.
  // MEDIDO no navegador (bbox do alpha, rasterizando as duas): apple 120x40 → tinta 120x40;
  // play 646x250 → tinta 646x192. Por isso pôr a MESMA altura CSS nos dois deixava o Google
  // 23% menor na tela — foi o que o dono viu. Quem compensa é `_storeBadgesHtml`.
  // ⛔ A saída NÃO é recortar o arquivo: as duas lojas proíbem alterar a arte, e a margem do
  // Google É a clear space dele. A caixa é que cresce; a tinta é que fica igual.
  apple: { on: true,  selo: true, nome: 'App Store',   glifo: '',  badge: '/assets/badge-app-store.svg',   tinta: 1,     url: 'https://apps.apple.com/br/app/scoreplace/id6789757489' },
  play:  { on: true,  selo: true, nome: 'Google Play', glifo: '▶', badge: '/assets/badge-google-play.png', tinta: 0.768, url: 'https://play.google.com/store/apps/details?id=app.scoreplace' }
};
