#!/usr/bin/env bash
# deploy-hosting.sh — O ÚNICO jeito de publicar o site. Firebase é produção; GitHub é backup.
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

# ── O CODEBASE `functions/` PRECISA DO MESMO LINK ────────────────────────────────────
# As provas da porta única de escrita, da contenção de fase nas Rules e da recuperação
# sobem um driver que faz `require('<copia>/functions/node_modules/firebase-admin')`.
# `functions/node_modules` é gitignored igual ao do autodraw, então na cópia extraída por
# `git archive` ele não existe e as quatro suítes MORREM em MODULE_NOT_FOUND — não "pulam",
# quebram. Medido em 03/set/2026, publicando a 2.1.102. Mesmo tratamento da raiz e do
# autodraw: o node_modules real é LIGADO dentro da cópia e as provas rodam de verdade.
NM_FN=""
if [[ -e "$RAIZ/functions/node_modules/firebase-admin" ]]; then
  NM_FN="$RAIZ/functions/node_modules"
elif [[ -e "$RAIZ/functions-autodraw/node_modules/firebase-admin" ]]; then
  NM_FN="$RAIZ/functions-autodraw/node_modules"
fi
if [[ -z "$NM_FN" ]]; then
  echo
  echo "✗ firebase-admin NÃO existe para o codebase 'functions/' — as provas da porta única"
  echo "  de escrita e da contenção de fase nas Rules não teriam como rodar no predeploy."
  echo
  echo "  CONSERTO:  (cd functions && npm install)"
  exit 1
fi
mkdir -p "$DEST/functions"
ln -s "$NM_FN" "$DEST/functions/node_modules"
echo "  ▸ firebase-admin ligado na cópia ($NM_FN) — as provas de escrita/Rules rodam no predeploy"

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

# ── 1.8 · SEGUNDA OPINIÃO CRUZADA SOBRE O QUE VAI SUBIR ──────────────────────────────
# Ordem do dono (04/set/2026): quem implementa é revisado pelo OUTRO, sempre, e nada segue sem
# o APROVADO. `scripts/revisar.sh diff` em modo auto chama o oposto de quem está publicando:
# de dentro do Claude Code, o GPT (Codex) revisa; de dentro do Codex, o Claude (`claude -p`)
# revisa; sem pista, os dois. A porta do PLANO (antes de editar) é a mesma ferramenta em modo
# `plano`. A faixa (trivial/normal/crítica) sai de uma REGRA sobre os arquivos tocados e é o
# piso do esforço; trivial (CSS/texto/bump) passa sem chamar ninguém. RESSALVAS, BLOQUEIO,
# parecer ilegível ou COTA ESGOTADA param o deploy ANTES do push: origin/main segue intocado.
# Interruptor por lado: `revisar-com-{gpt,claude}.sh desligar "<motivo>"` (passa com aviso).
# Escape só com uma linha `sem-gpt: <motivo>` num commit a publicar, e SP_SEM_GPT=1.
echo "▸ 1.8 revisão cruzada sobre origin/main..HEAD…"
if ! "$RAIZ/scripts/revisar.sh" diff; then
  echo
  echo "✗ O REVISOR NÃO APROVOU (ou não respondeu) — nada foi empurrado nem publicado."
  echo "  Parecer em .claude/tmp/parecer-<revisor>-diff.md: atenda os pontos e rode de novo (o"
  echo "  parecer anterior vai junto). Cota esgotada? desligue aquele lado com o motivo, ou espere."
  exit 1
fi

# ── 1.85 · SESSÃO DO FIREBASE ANTES DA SUÍTE ─────────────────────────────────
# A suíte custa minutos e o upload depende da sessão local do Firebase CLI. Descobrir um
# token expirado só depois dela deixa o main alinhado mas o site antigo. Esta consulta é de
# leitura e usa a mesma sessão que o upload usará em seguida.
echo "▸ conferindo a sessão do Firebase…"
# ⛔ NÃO CONFIAR NO EXIT CODE DO `firebase --json`. MEDIDO em 12/set/2026, com a sessão VÁLIDA:
#     firebase projects:list --json  →  stdout com '"status": "success"'  e  exit code 2
# Ou seja, o teste antigo (`if ! firebase … >/dev/null 2>&1`) dava FALSO NEGATIVO e abortava todo
# deploy com "NÃO AUTENTICADO" — o dono passou horas achando que a credencial expirava toda hora,
# e eu cheguei a pedir `login --reauth` sem necessidade. Quem responde "estou autenticado" é a
# RESPOSTA, não o código de saída. [[feedback_medir_com_dado_real_antes_de_teorizar]]
# ⚠️ E O `set -o pipefail` DERRUBA O CANO INTEIRO: com ele, `firebase … | grep` devolve o 2 do
# firebase mesmo com o grep achando. Por isso a saída é capturada ANTES (com `|| true`) e só
# depois examinada — senão o conserto acima continuaria dando o mesmo falso negativo.
_FB_SESSAO="$(firebase projects:list --json 2>/dev/null || true)"
if ! printf '%s' "$_FB_SESSAO" | grep -q '"status": *"success"'; then
  echo
  echo "✗ FIREBASE NÃO AUTENTICADO — nada foi testado, empurrado ou publicado."
  echo "  Rode: firebase login --reauth"
  echo "  Depois repita: scripts/deploy-hosting.sh"
  exit 1
fi
echo "  ✓ sessão do Firebase válida"

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

echo "▸ preflight: código novo recebeu uma versão nova?"
VERSAO_NO_AR="$(curl -fsS --max-time 15 https://scoreplace.app/version.txt 2>/dev/null || true)"
if [[ -z "$VERSAO_NO_AR" ]]; then
  echo "✗ não consegui ler a versão atualmente servida — não publico sem saber se o cache vai trocar."
  exit 1
fi
SP_RELEASE_PRODUCTION_VERSION="$VERSAO_NO_AR" node "$RAIZ/scripts/check-release-version-fresh.js" || exit 1

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
# ⭐ O CARIMBO DO PREFLIGHT. O `hosting.predeploy` roda a MESMA lista logo em seguida,
# sobre o MESMO commit — eram duas rodadas da suíte por publicação (~5min20 cada, com o
# runner paralelo). `scripts/predeploy-test.js` pula a segunda SÓ se este carimbo bater
# com o HEAD e a árvore estiver limpa; sem a variável (ex.: alguém rodando `firebase
# deploy` na mão) ele roda a suíte normalmente. Ordem do dono: _"faça o corte"_.
# ⛔ Exportado AQUI, depois do preflight passar — nunca antes, e nunca fora dele.
export SP_PREFLIGHT_OK="$COMMIT"

# ── 2. conferir se o backup PODE avançar (sem depender dele) ───────────────
# GitHub é backup, mas uma divergência real continua sendo bloqueio: publicar um
# commit que o main não alcança por fast-forward deixaria o ar irreconciliável.
echo "▸ conferindo se origin/main pode acompanhar este commit…"
git fetch -q origin main || echo "  ⚠️  não deu pra atualizar origin/main (rede?) — conferindo a referência disponível"
BACKUP_PENDENTE=0
if git merge-base --is-ancestor "$COMMIT" origin/main 2>/dev/null; then
  echo "  ✓ origin/main já contém este commit"
elif git merge-base --is-ancestor origin/main "$COMMIT" 2>/dev/null; then
  BACKUP_PENDENTE=1
  echo "  ✓ origin/main pode avançar por fast-forward depois do Hosting"
else
  echo
  echo "✗ HEAD e origin/main DIVERGIRAM — não publico um estado que o backup não alcança."
  echo "  origin/main: $(git rev-parse --short origin/main)   ·   HEAD: ${COMMIT:0:8}"
  exit 1
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
# ⛔ O CLI TAMBÉM SAI NÃO-ZERO DEPOIS DE PUBLICAR. MEDIDO em 12/set/2026: o log terminou com
# "✔ Deploy complete!" e, na linha seguinte, "Error: An unexpected error has occurred." — com
# `set -e` o script morreu ALI, depois de publicar e antes de empurrar o main e o backup. Ficou o
# pior dos mundos: o ar novo e o repositório atrás (exatamente o que a trava de alinhamento existe
# para impedir). Quem julga se publicou é O AR, conferido logo abaixo — não o código de saída.
_DEPLOY_RC=0
firebase deploy --only hosting --project scoreplace-app || _DEPLOY_RC=$?
if [[ "$_DEPLOY_RC" != "0" ]]; then
  echo "⚠ o firebase saiu com código $_DEPLOY_RC — seguindo para a conferência NO AR, que é quem decide."
fi

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

# ── 8. atualizar o backup depois do ar confirmado ───────────────────────────
# O Hosting já foi conferido. Falha de GitHub/Drive é visível, mas não desfaz uma
# correção de produção saudável.
if [[ $BACKUP_PENDENTE -eq 1 && $DRY -eq 0 ]]; then
  echo "▸ atualizando o backup no origin/main…"
  if git push origin "HEAD:main"; then
    echo "  ✓ origin/main alinhado em ${COMMIT:0:8}"
  else
    echo "⚠️  Hosting está publicado, mas o backup GitHub falhou."
    echo "   origin/main ficou atrás do ar; quando a rede voltar: git push origin HEAD:main"
  fi
fi

# O checkout principal só acompanha depois de o backup remoto confirmar o commit.
if [[ $BACKUP_PENDENTE -eq 1 ]] && git merge-base --is-ancestor "$COMMIT" origin/main 2>/dev/null; then
  PRINCIPAL="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
  if [[ -n "$PRINCIPAL" && "$PRINCIPAL" != "$RAIZ" ]]; then
    BRANCH_PRINCIPAL="$(git -C "$PRINCIPAL" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    SUJO_PRINCIPAL="$(git -C "$PRINCIPAL" status --porcelain --untracked-files=no)"
    if [[ "$BRANCH_PRINCIPAL" == main && -z "$SUJO_PRINCIPAL" ]]; then
      git -C "$PRINCIPAL" merge --ff-only origin/main >/dev/null 2>&1 && echo "  ✓ checkout principal alinhado" || echo "⚠️  checkout principal não pôde avançar automaticamente."
    elif [[ "$BRANCH_PRINCIPAL" != main ]]; then
      echo "⚠️  checkout principal está em '$BRANCH_PRINCIPAL'; não mexi fora de main."
    else
      echo "⚠️  checkout principal tem alterações; não mexi."
    fi
  fi
fi

"$RAIZ/scripts/backup-bundle.sh" || true
