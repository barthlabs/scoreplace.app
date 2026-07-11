# scoreplace — extensão de import do letzplay

Puxa o histórico do letzplay **na sua sessão logada** (passa o Cloudflare, que bloqueia servidor). **Só desktop** — Chrome/Edge/Brave. Celular não roda extensão.

**Nada de senha.** A extensão usa os cookies da sua própria sessão já logada; nenhuma credencial é digitada nem sai do seu navegador.

## Como carregar (uma vez)

1. Abra `chrome://extensions`.
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. **Carregar sem compactação** → selecione a pasta `extension/`.
4. Fixe o ícone da extensão na barra, se quiser.

## Como usar (modo auto-import — o próprio jogador)

1. Esteja **logado em `letzplay.me`** neste navegador.
2. Clique no ícone da extensão → **Importar meu histórico**.
3. A barra 0-100% mostra o progresso (puxa todas as páginas do seu histórico).
4. No fim aparece: categoria **oficial** (torneio), **forma** (ranking), nº de jogos, footprint oficial/recreativo, observações. Botão **Copiar JSON** pra conferir.

## O que já faz

- **Auto-import completo** do usuário logado: `/u/matches/history` (todas as páginas) → extrai (`lib/letzplay-extract.js`) separando **torneio = oficial** de **ranking = recreativo** → normaliza (`lib/letzplay-import.js`) → mostra o `letzplayImport`.

## Próximos passos (não neste build)

- **Enviar pro scoreplace**: hoje mostra + copia o JSON; falta o canal pra gravar no perfil (content script no scoreplace ou Cloud Function).
- **Modo organizador**: puxar o público de terceiros. O caminho é pelas **competições de cada jogador** (cada ranking/torneio mostra os jogos de todos, público) — a página de jogos do clube (`/{clube}/matches`) só filtra "Todos/Meus", então não serve pra jogador arbitrário. A finalizar contra a página viva.
- **Ícones** da extensão.

## Notas técnicas

- `manifest.json`: MV3, `host_permissions: https://letzplay.me/*` (fetch com cookies).
- `lib/*` são cópias de `js/views/letzplay-*.js` do app (mantidas em sincronia manual por ora).
- Ladder default = masculino; detecta feminino se as categorias forem femininas (v1 simples).
