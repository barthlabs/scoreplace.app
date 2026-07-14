# scoreplace — extensão de import do letzplay

Puxa o histórico do letzplay **na sua sessão logada** (passa o Cloudflare, que bloqueia servidor) e grava no seu perfil do scoreplace. **Só desktop** — Chrome/Edge/Brave. Celular não roda extensão.

**Nada de senha.** A extensão usa os cookies da sua própria sessão já logada; nenhuma credencial é digitada nem sai do seu navegador. Ela grava **só o seu próprio** doc no scoreplace (as regras do Firestore só permitem isso).

## Como carregar (uma vez)

1. Abra `chrome://extensions`.
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. **Carregar sem compactação** → selecione a pasta `extension/`.
4. Fixe o ícone da extensão na barra, se quiser.

> **Já carregou antes?** Depois de qualquer atualização, clique em **↻ (recarregar)** no card da extensão em `chrome://extensions` — senão roda a versão velha. Versão atual do manifest: **1.36**.

> **Recebeu um `.zip`?** O Chrome não carrega o zip direto: **descompacte** e aponte o
> "Carregar sem compactação" pra pasta que sair. Se já tinha uma versão carregada, use
> **↻ (recarregar)** no card dela depois de trocar os arquivos.

## Como usar (auto-import — o próprio jogador)

1. Esteja **logado em `letzplay.me`** neste navegador (abra o site e confira que entrou).
2. Abra o **scoreplace.app** numa aba e **faça login** (a gravação é no seu perfil).
3. Clique no ícone da extensão → **Importar meu histórico**.
4. A barra 0-100% mostra "X de Y jogos importados".
5. No fim aparece o resumo: categoria **oficial** (torneio), **forma** (ranking), nº de jogos, **Histórico game-a-game: N jogos**, footprint, observações.
6. Clique **📤 Enviar pro meu perfil no scoreplace**.
   - Sucesso → *"✅ Importado! N jogos no seu perfil."* (o resultado é REAL — só confirma quando o Firestore grava).
   - Se aparecer *sem-login / conta-diferente / sem-resposta*, resolva o que a mensagem diz e clique de novo.
7. No scoreplace: **📊 Estatísticas → 📜 Histórico de jogos**. Seus jogos do letzplay aparecem com badge 🎾 **LetzPlay**, junto com os 🏆 **Scoreplace**, cronológicos e filtráveis.

## O que faz

- **Auto-import completo** do usuário logado: `/u/matches/history` (todas as páginas) → extrai (`lib/letzplay-extract.js`) separando **torneio = oficial** de **ranking = recreativo** → normaliza (`lib/letzplay-import.js`, schema **v2** com `games[]` game-a-game) → grava no seu perfil via a aba do scoreplace.
- **Copiar JSON**: botão pra inspecionar o `letzplayImport` cru.

## Próximos passos (não neste build)

- **Modo organizador**: puxar o público de terceiros. O caminho é pelas **competições de cada jogador** (cada ranking/torneio mostra os jogos de todos, público) — a página de jogos do clube (`/{clube}/matches`) só filtra "Todos/Meus", então não serve pra jogador arbitrário.
- **Botão "Importar do letzplay" dentro do perfil** (a extensão já sinaliza presença via `extension-present`).
- **Ícones** da extensão.

## Notas técnicas

- `manifest.json`: MV3. `host_permissions`: `letzplay.me` (fetch com cookies) + `scoreplace.app`. `content_scripts` no scoreplace (`content.js`) faz a ponte popup → página.
- Fluxo do envio: popup → `chrome.tabs.sendMessage` → `content.js` → `window.postMessage` → `letzplay-bridge.js` (na página) grava `users/{uid}.letzplayImport` e devolve `{import-result, ok, error, count}` → volta pro popup.
- `lib/*` são cópias de `js/views/letzplay-*.js` do app (sincronia manual por ora — ao mudar o schema, copiar as duas).
- Ladder default = masculino; detecta feminino se as categorias forem femininas (v1 simples).
