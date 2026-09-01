#!/usr/bin/env bash
# deploy-hosting.sh — O ÚNICO jeito de publicar o site. Alinha o `main` ANTES de subir.
#
# POR QUE EXISTE (12/ago/2026): produção ficou em 1.8.27 com `origin/main` em 1.8.24. Não
# foi comando errado — era o comportamento normal do fluxo: cada sessão publica de um
# branch/worktree próprio e nada obriga a empurrar pro main. A leva seguinte publicada a
# partir do main REBAIXARIA a produção.
# Ordem do dono: "as coisas precisam estar alinhadas… apenas as versoes da loja ficam
# desalinhadas por um curto periodo de tempo por logistica apenas."
#
# O QUE ELE FAZ, nesta ordem (a ordem é o ponto):
#   1. árvore limpa? (o que sobe tem que ser o que está no git)
#   1.5 GERA o snapshot (index.html/version.txt) e commita se mudou — ANTES do push.
#      Sem isso, quem gera é só o `hosting.predeploy`, dentro da cópia em /tmp: o
#      arquivo gerado vai pro ar e nunca volta pro repo. Medido na 1.9.106 — commit com
#      version.txt 1.9.105 e o ar em 1.9.106. Com o pre-commit instalado
#      (scripts/install-hooks.sh) não há o que commitar aqui e o passo é um no-op.
#   2. empurra HEAD pro `main` — fast-forward. Divergiu? ABORTA e diz o que fazer.
#      ⚠️ É o main que passa a descrever o ar, então ele é atualizado ANTES do upload:
#      falhar aqui é barato; falhar depois de publicar deixa exatamente o desalinhamento
#      que este script existe pra impedir.
#   3. extrai o commit com `git archive` (só o que está commitado — o Drive tem lixo solto
#      e `hosting.public` é ".", então tudo que estiver na pasta iria pro ar)
#   4. liga node_modules do repo (o predeploy roda testes com Chromium)
#   5. escreve o CARIMBO de alinhamento — é o que o check aceita numa cópia sem .git
#   6. firebase deploy --only hosting  (o predeploy roda testes + prerender + os checks)
#   7. confere no ar: version.txt servido == version.txt publicado
#
# Uso:  scripts/deploy-hosting.sh            # publica
#       scripts/deploy-hosting.sh --dry-run  # faz tudo menos o upload
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1

# ── L6.R2.3 · UMA CÓPIA FIEL, MONTADA NUM LUGAR SÓ ───────────────────────────────────
# O preflight e a publicação precisam da MESMA cópia: mesma extração, mesmos symlinks,
# mesmo carimbo. Duas montagens divergiriam — e divergir aqui é o preflight aprovar uma
# árvore que não é a que sobe.
# ⚠️ `DEST` fica GLOBAL de propósito: o corpo veio do passo 3-5 e o publicador usa a
# variável depois da chamada. Sem `local`, o comportamento antigo é preservado byte a byte.
montar_copia() {
# (corpo do antigo passo 3-5, agora compartilhado com o preflight)
DEST="$1"
rm -rf "$DEST"; mkdir -p "$DEST"
git archive HEAD | tar -x -C "$DEST"
# ⚠️ Procura o node_modules SUBINDO os diretórios, como o Node faz. Publicar de uma
# WORKTREE do git é caso normal aqui, e worktree NÃO tem node_modules próprio — os
# testes só passam nela porque o Node sobe até o do repo pai. Fixar em "$RAIZ" fazia
# o deploy abortar em toda worktree com "node_modules não resolveu", que é a MESMA
# armadilha que a 1.8.2 pagou (lá o symlink apontava pra um caminho sem pai e o
# predeploy morria com "Cannot find module '@playwright/test'" — parecendo regressão
# do commit, quando era só o node_modules fora de alcance).
NM=""
DIR="$RAIZ"
while [[ "$DIR" != "/" ]]; do
  if [[ -e "$DIR/node_modules/@playwright/test" ]]; then NM="$DIR/node_modules"; break; fi
  DIR="$(dirname "$DIR")"
done
if [[ -z "$NM" ]]; then
  echo "✗ node_modules não resolveu a partir de $RAIZ (o predeploy roda testes com Chromium)."
  echo "  rode 'npm ci' no repo (ou no repo PAI, se você está numa worktree) e tente de novo."
  exit 1
fi
ln -s "$NM" "$DEST/node_modules"

# ── L6.R2.2 · A PROVA DE CONCORRÊNCIA TEM QUE RODAR AQUI TAMBÉM ──────────────────────
# `functions-autodraw/test-corrida-slot-emu.js` sobe o Firestore Emulator e dirige DUAS
# transações concorrentes com o Admin SDK — é o único gate que prova a trava manual ×
# automático no mecanismo (abort + retry do servidor), e não num modelo em memória.
# ⛔ MAS `functions-autodraw/node_modules` é gitignored, então na cópia extraída por
# `git archive` o `firebase-admin` não existe e a corrida se declarava PULADA. Medido em
# 01/set/2026: a 2.1.81 subiu com a prova de concorrência NÃO EXECUTADA no predeploy.
# "Pulada" não é aprovação. Aqui o subprojeto ganha o MESMO tratamento que a raiz já tinha:
# o node_modules real é LIGADO dentro da cópia, e a corrida roda de verdade.
NM_AD=""
if [[ -e "$RAIZ/functions-autodraw/node_modules/firebase-admin" ]]; then
  NM_AD="$RAIZ/functions-autodraw/node_modules"
elif [[ -e "$RAIZ/functions/node_modules/firebase-admin" ]]; then
  NM_AD="$RAIZ/functions/node_modules"
fi
if [[ -z "$NM_AD" ]]; then
  echo
  echo "✗ firebase-admin NÃO existe no ambiente-fonte — a prova de concorrência do sorteio"
  echo "  (functions-autodraw/test-corrida-slot-emu.js) não teria como rodar no predeploy."
  echo
  echo "  ⛔ NÃO publico sem essa prova: foi assim que a 2.1.81 subiu com a corrida manual ×"
  echo "     automático apenas 'PULADA'. Um gate que se declara pulado não é um gate."
  echo
  echo "  CONSERTO:  (cd functions-autodraw && npm install)"
  exit 1
fi
mkdir -p "$DEST/functions-autodraw"
ln -s "$NM_AD" "$DEST/functions-autodraw/node_modules"
echo "  ▸ firebase-admin ligado na cópia ($NM_AD) — a corrida do sorteio roda no predeploy"
# ⛔ E o teste passa a EXIGIR o emulador neste caminho: sem a variável ele pode se declarar
# pulado (útil em máquina sem Java), com ela um 'pulado' vira VERMELHO.
export SP_EXIGE_CORRIDA_REAL=1

# lixo que o Drive cria e que iria pro ar junto (hosting.public = ".")
LIXO="$(find "$DEST" \( -name '* 2' -o -name '* 3' -o -name '.DS_Store' \) | head -5 || true)"
if [[ -n "$LIXO" ]]; then echo "✗ lixo na extração:"; echo "$LIXO"; exit 1; fi

cat > "$DEST/.deploy-alignment.json" <<JSON
{
  "alinhado": true,
  "commit": "$COMMIT",
  "versao": "$VERSAO",
  "em": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "por": "scripts/deploy-hosting.sh"
}
JSON
echo "▸ extraído em $DEST (carimbado)"
}


VERSAO="$(tr -d '[:space:]' < version.txt)"
COMMIT="$(git rev-parse HEAD)"

echo "▸ repo:   $RAIZ"
echo "▸ commit: ${COMMIT:0:8}  ·  versão: $VERSAO"

# ── 1. árvore limpa ──────────────────────────────────────────────────────────
if [[ -n "$(git status --porcelain)" ]]; then
  echo
  echo "✗ árvore SUJA — o que subiria não é o que está no git:"
  git status --short | head -12
  echo
  echo "  commite (ou guarde) antes de publicar."
  exit 1
fi

# ── 1.2 a nota de versão cobre o que vai subir? (SÓ AQUI ELA PODE SER COBRADA) ──
# ⚠️ ESTA TRAVA JÁ EXISTIA no hosting.predeploy — e a metade que importa NUNCA RODAVA LÁ.
# `check-release-notes.js` tem duas partes: (1) existe entrada da minor? (2) a nota está
# ATRASADA em relação ao código? A parte 2 precisa de git (`git log -- js/release-notes.js`)
# e o predeploy roda na CÓPIA EXTRAÍDA em /tmp, que não tem `.git` — o script cai no
# `if (!ultimoDaNota) return` e passa calado. Ou seja: a trava criada depois de a nota ser
# esquecida TRÊS vezes era, no caminho da publicação, decorativa.
# MEDIDO em 27/ago/2026: a 2.1.13 foi ao ar sem nota nenhuma e o deploy não reclamou.
# Aqui estamos no REPO, com histórico — é o único ponto do fluxo onde a pergunta pode ser
# respondida. Mesma lição do check-deploy-alignment e do backup-bundle: o que não é gate,
# não acontece.
echo "▸ conferindo a nota de versão…"
node "$RAIZ/scripts/check-release-notes.js" || exit 1

# ── 1.5 snapshot gerado, DENTRO do repo, antes de empurrar ───────────────────
# index.html (snapshot da landing) e version.txt são DERIVADOS de
# window.SCOREPLACE_VERSION (store.js). O hosting.predeploy também roda o prerender,
# mas lá dentro da cópia em /tmp — o resultado publica e evapora. Rodando aqui, o
# commit que vira `main` carrega exatamente o que foi pro ar.
echo "▸ gerando o snapshot (prerender) no repo…"
npm run --silent prerender
if [[ -n "$(git status --porcelain)" ]]; then
  # o prerender também carimba a versão da EXTENSÃO (extension/content.js, js/store.js,
  # ext-version.txt e o cache-buster do store.js no index.html) — tudo isso é gerado e
  # entra no mesmo commit. Qualquer OUTRA coisa aparecer aqui é sinal de que o gerador
  # fez algo que eu não sei explicar: aí não commito às cegas.
  DERIVADOS="index.html version.txt ext-version.txt extension/content.js js/store.js"
  INESPERADO="$(git status --porcelain | grep -v -E ' (index\.html|version\.txt|ext-version\.txt|extension/content\.js|js/store\.js|scoreplace-letzplay-ext-[0-9.]+\.zip)$' || true)"
  if [[ -n "$INESPERADO" ]]; then
    echo
    echo "✗ o prerender mexeu em arquivo que não era esperado — não vou commitar às cegas:"
    echo "$INESPERADO" | head -12
    exit 1
  fi
  if [[ $DRY -eq 1 ]]; then
    # --dry-run não commita nada; desfaz e só avisa.
    echo "  ⚠️  o snapshot está VELHO (v$(tr -d '[:space:]' < version.txt)) — no deploy de"
    echo "     verdade eu commitaria isso. (dry-run: desfiz, árvore intacta)"
    git checkout -q -- $DERIVADOS
    git checkout -q -- 'scoreplace-letzplay-ext-*.zip' 2>/dev/null || true
  else
    VERSAO="$(tr -d '[:space:]' < version.txt)"
    git add -A -- $DERIVADOS 'scoreplace-letzplay-ext-*.zip'
    git commit -q -m "$VERSAO — snapshot do prerender que está no ar"
    COMMIT="$(git rev-parse HEAD)"
    echo "  ▸ snapshot estava velho — commitado em ${COMMIT:0:8} (v$VERSAO)"
    echo "    (instale os hooks e isso vira no-op: scripts/install-hooks.sh)"
  fi
else
  echo "  ✓ snapshot já em dia"
fi

# ── TRAVA DURA: O CACHE DO SW TEM QUE SER O DA VERSÃO ─────────────────────────
# ⛔ ISTO JÁ ACONTECEU, e ficou 33 VERSÕES sem ninguém ver (2.0.92 → 2.0.125). O dono abriu
# o PWA no celular e viu "0 INSCRITOS" num torneio com 148, sendo ele o organizador; no
# desktop, tudo normal. O banco estava CERTO.
# Todos os scripts têm `?v=` e trocam com a versão. `/index.html` é o ÚNICO servido sem
# query: ele casa EXATO no cache do service worker e, se o nome do cache não muda, vem do
# VELHO — trazendo junto os `?v=` antigos de TODOS os scripts. O aparelho passa a rodar
# código antigo sobre o dado de hoje, e a tela mente com cara de dado errado.
# ⚠️ A suíte também confere isto, mas suíte não impede PUBLICAR. Aqui impede: aborta antes
# de subir um byte, que é o mesmo lugar onde o cache-buster já era barrado.
VER_APP="$(sed -n "s/.*SCOREPLACE_VERSION *= *'\([^']*\)'.*/\1/p" js/store.js | head -1)"
VER_SW="$(sed -n "s/.*CACHE_NAME *= *'scoreplace-v\([^']*\)'.*/\1/p" sw.js | head -1)"
if [[ -z "$VER_APP" || -z "$VER_SW" ]]; then
  echo "✗ não consegui ler a versão (app='$VER_APP' sw='$VER_SW') — não publico às cegas."
  exit 1
fi
if [[ "$VER_APP" != "$VER_SW" ]]; then
  echo
  echo "✗ CACHE_NAME do service worker DIVERGE da versão do app."
  echo "    js/store.js SCOREPLACE_VERSION = $VER_APP"
  echo "    sw.js       CACHE_NAME         = scoreplace-v$VER_SW"
  echo
  echo "  O QUE ISSO CAUSA: index.html é o único arquivo sem ?v=. Com o cache velho, o PWA"
  echo "  carrega o index ANTIGO e, com ele, os ?v= antigos de todos os scripts — o celular"
  echo "  fica preso numa versão anterior à do desktop e a tela mostra dado errado."
  echo
  echo "  CONSERTO:  npm run prerender     (ele sincroniza, no mesmo passo do version.txt)"
  exit 1
fi
echo "  ✓ CACHE_NAME do SW = versão do app ($VER_APP)"

# ── 1.9 · PREFLIGHT: TODOS OS GATES ANTES DE TOCAR NO `main` ─────────────────────────
# ⛔ POR QUE ISTO EXISTE (medido em 01/set/2026, na publicação da 2.1.81 e de novo na
# 2.1.82): este script empurrava o commit pro `main` no passo 2 e só DEPOIS extraía a
# cópia e rodava o predeploy. Quando um gate reprovava — e reprovou —, o `origin/main` já
# carregava um commit de release que NÃO tinha passado nos gates necessários pra publicá-lo.
# Na 2.1.81 isso obrigou a desfazer um amend com o main já adiantado; na 2.1.82 só não doeu
# porque o ensaio foi feito À MÃO, o que não protege o próximo deploy.
# A regra passa a ser: nenhum commit de release é empurrado antes de tudo o que é preciso
# pra publicá-lo passar — na MESMA forma em que vai ser publicado (cópia extraída, com as
# dependências ligadas e a corrida do sorteio rodando de verdade).
# ⚠️ `check-version-ahead` só tem sentido ONDE HÁ GIT: ele varre branches e remotos atrás de
# uma versão MAIOR que a que vai subir. Na cópia extraída não há `.git`, então lá ele passa
# vazio — por isso ele roda AQUI, no repositório de verdade, antes de tudo.
echo "▸ preflight: nenhum branch/remoto está à frente desta versão?"
if ! node "$RAIZ/scripts/check-version-ahead.js"; then
  echo
  echo "✗ PREFLIGHT REPROVOU (versão à frente) — nada foi empurrado e nada foi publicado."
  exit 1
fi

echo "▸ preflight: montando a cópia e rodando os gates ANTES de tocar no main…"
PRE="${TMPDIR:-/tmp}/sp-preflight-$$"
montar_copia "$PRE"
PRE_OK=1
# Os MESMOS comandos do `hosting.predeploy` (firebase.json), na mesma ordem, na cópia.
# `SP_EXIGE_CORRIDA_REAL=1` proíbe o desfecho "pulada" da corrida manual × automático:
# aqui ela roda no Emulator ou o deploy para.
if ! ( cd "$PRE" && SP_EXIGE_CORRIDA_REAL=1 PATH="/opt/homebrew/opt/openjdk/bin:$PATH" \
       node scripts/check-deploy-alignment.js \
    && node scripts/check-version-ahead.js \
    && node scripts/check-release-notes.js \
    && npm test \
    && npm run prerender ); then
  PRE_OK=0
fi
if [[ $PRE_OK -ne 1 ]]; then
  echo
  echo "✗ PREFLIGHT REPROVOU — nada foi empurrado e nada foi publicado."
  echo "  origin/main segue intocado: $(git rev-parse --short origin/main 2>/dev/null || echo '?')"
  echo "  A cópia com a falha ficou em: $PRE"
  echo
  echo "  ⛔ É de propósito que isto acontece ANTES do push: commit de release só entra no"
  echo "     main depois de passar em tudo que é preciso pra publicá-lo."
  exit 1
fi
rm -rf "$PRE"
echo "  ✓ preflight VERDE — pode alinhar o main e publicar"

# ── 2. alinhar o main ANTES de publicar ──────────────────────────────────────
echo "▸ conferindo origin/main…"
git fetch -q origin main || echo "  ⚠️  não deu pra atualizar origin/main (rede?) — seguindo com o local"

if git merge-base --is-ancestor "$COMMIT" origin/main 2>/dev/null; then
  echo "  ✓ este commit já está em origin/main"
elif git merge-base --is-ancestor origin/main "$COMMIT" 2>/dev/null; then
  ATRAS="$(git rev-list --count origin/main..HEAD)"
  echo "  ▸ main está $ATRAS commit(s) atrás — empurrando (fast-forward)…"
  if [[ $DRY -eq 1 ]]; then
    echo "  (dry-run: não empurrei)"
  else
    # o pre-push roda `npm test` em push pro main; aqui seria a MESMA suíte que o
    # hosting.predeploy roda logo em seguida (2×2min30 pelo mesmo gate). O que barra o
    # upload é o predeploy — ele aborta antes de subir qualquer byte.
    SP_HOOK_SKIP_TEST=1 git push origin "HEAD:main"
    echo "  ✓ main alinhado em ${COMMIT:0:8}"
  fi
else
  echo
  echo "✗ HEAD e origin/main DIVERGIRAM — não dá pra alinhar sozinho sem escolher por você."
  echo "  origin/main: $(git rev-parse --short origin/main)   ·   HEAD: ${COMMIT:0:8}"
  echo
  echo "  O QUE FAZER: traga o main pra dentro (rebase ou merge), rode a suíte, e publique"
  echo "  de novo. NUNCA publicar divergente: o ar passaria a ser um estado que o main não"
  echo "  descreve, que é exatamente o problema que este script existe pra impedir."
  exit 1
fi

# ── 2.5 O CHECKOUT PRINCIPAL ANDA JUNTO ──────────────────────────────────────
# ⛔ REGRA DO DONO (27/ago/2026), depois de achar o repo dele 16 commits atrás do ar:
# _"que merda é esse dessa porra de repo nao acompanhar a merda da versao web? ja falei que
# tudo tem que andar junto"_ · _"e faca disso a porra de uma regra para nunca mais
# acontecer"_.
#
# O QUE ACONTECIA, e é uma armadilha do próprio fluxo de worktrees: uma sessão trabalha em
# .claude/worktrees/<nome>, empurra pro `main` e publica. O ar fica certo, o `main` fica
# certo — e o CHECKOUT PRINCIPAL, que é onde o dono abre o projeto e de onde saem os builds
# NATIVOS, fica parado onde estava. Medido no dia: ar e main em 2.1.22, o repo dele em
# 2.1.6. Ninguém errou comando; era o comportamento normal, e é exatamente a mesma classe
# do incidente de 12/ago (produção 1.8.27 com main 1.8.24) que criou o check-deploy-alignment.
#
# ⚠️ E o preço é MAIOR que o susto: o build de TestFlight/Play sai do checkout principal.
# Um repo atrasado empacota uma versão velha com o número novo — o pior tipo de erro,
# porque a loja diz uma coisa e o app faz outra.
#
# ⭐ Por que aqui e automático: o dono já tinha dito "tudo tem que andar junto" e mesmo
# assim aconteceu — memória não resolve. Este é o único caminho por onde a publicação
# passa, e neste ponto o `main` acabou de ser atualizado. Fast-forward só: se o principal
# tiver trabalho próprio, o script AVISA e não decide por ninguém.
PRINCIPAL="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
if [[ -n "$PRINCIPAL" && "$PRINCIPAL" != "$RAIZ" ]]; then
  echo "▸ alinhando o checkout principal ($PRINCIPAL)…"
  P_BRANCH="$(git -C "$PRINCIPAL" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
  P_HEAD="$(git -C "$PRINCIPAL" rev-parse HEAD 2>/dev/null || echo '')"
  if [[ "$P_BRANCH" != "main" ]]; then
    echo "  ⚠️  ele está em '$P_BRANCH', não em main — NÃO mexi. Alinhe à mão quando puder:"
    echo "      git -C \"$PRINCIPAL\" checkout main && git -C \"$PRINCIPAL\" merge --ff-only origin/main"
  elif [[ -n "$(git -C "$PRINCIPAL" status --porcelain --untracked-files=no)" ]]; then
    echo "  ⚠️  ele tem alterações não commitadas — NÃO mexi (trabalho de outra sessão não se descarta)."
    git -C "$PRINCIPAL" status --short --untracked-files=no | head -5
  elif [[ "$P_HEAD" == "$COMMIT" ]]; then
    echo "  ✓ já estava em dia"
  elif [[ $DRY -eq 1 ]]; then
    echo "  (dry-run: não alinhei)"
  elif git -C "$PRINCIPAL" merge --ff-only origin/main >/dev/null 2>&1; then
    echo "  ✓ checkout principal em $(git -C "$PRINCIPAL" rev-parse --short HEAD) (v$(tr -d '[:space:]' < "$PRINCIPAL/version.txt" 2>/dev/null))"
  else
    echo "  ⚠️  não deu fast-forward (divergiu?) — alinhe à mão:"
    echo "      git -C \"$PRINCIPAL\" merge --ff-only origin/main"
  fi
fi


# ── 3-5. cópia limpa + carimbo (a MESMA função que o preflight usou) ─────────
montar_copia "${TMPDIR:-/tmp}/sp-deploy-$$"

if [[ $DRY -eq 1 ]]; then
  echo "✓ dry-run completo — nada foi publicado."
  echo "  (a cópia ficou em $DEST)"
  exit 0
fi

# ── 6. publicar ──────────────────────────────────────────────────────────────
# ⚠️ SEM PIPE. Pipe transforma o exit code no do último comando e o gate do predeploy
# vira decoração — é a armadilha já registrada no CLAUDE.md (deploy-functions.sh).
cd "$DEST"
firebase deploy --only hosting --project scoreplace-app

# ── 7. conferir no ar ────────────────────────────────────────────────────────
cd "$RAIZ"
echo "▸ conferindo o ar…"
for _ in $(seq 1 30); do
  AR="$(curl -s https://scoreplace.app/version.txt || true)"
  [[ "$AR" == "$VERSAO" ]] && break
  sleep 5
done
if [[ "${AR:-}" != "$VERSAO" ]]; then
  echo "✗ o ar responde '${AR:-vazio}' e era esperado '$VERSAO' — confira antes de anunciar."
  exit 1
fi
echo "✓ NO AR: $VERSAO  ·  main alinhado em ${COMMIT:0:8}"

# ── 8. empatar o backup ──────────────────────────────────────────────────────
# "tem que sempre atualizar tudo para tudo ficar junto" (dono, 22/ago/2026).
# O ar, o main e a rede de baixo (o bundle no Drive) saem daqui juntos. Isso é
# best-effort DE PROPÓSITO: o deploy já foi publicado e conferido acima — Drive
# desmontado não pode transformar uma publicação boa em erro. Ele grita e sai 0.
"$RAIZ/scripts/backup-bundle.sh" || true
