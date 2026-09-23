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
#   2. ATUALIZA origin/main e CONGELA a base; classifica a topologia nos QUATRO estados
#      (igual · main atrás · main À FRENTE ⇒ aborta · divergiu ⇒ aborta). O terceiro é o
#      que faltava até 22/set/2026: o script dizia "já contém este commit" e publicava o
#      estado ANTIGO por cima do novo, anunciando sucesso.
#   2.5 roda TODOS os portões (preflight). O `--dry-run` sai AQUI, sem tocar no remoto.
#   2.8 empurra o commit pro `main` com `--force-with-lease` sobre a base congelada, e
#      confirma no REMOTO por `ls-remote`.
#      ⚠️ É o main que passa a descrever o ar, então ele é atualizado ANTES do upload:
#      falhar aqui é barato; falhar depois de publicar deixa exatamente o desalinhamento
#      que este script existe pra impedir.
#      ⛔ ISTO JÁ ESTEVE ERRADO DOS DOIS LADOS. Antes de 01/set/2026 o push vinha antes dos
#      PORTÕES (2.1.81 reprovou com o main já adiantado). O conserto o empurrou longe demais,
#      para DEPOIS do upload — e aí o ar passou a ficar à frente do main (medido em
#      22/set/2026: ar 2.3.85, main 2.3.83). A ordem certa é a do meio:
#         portões → push do main → upload
#      As duas bordas valem ao mesmo tempo.
#   3. extrai o commit com `git archive`; o Hosting só serve `www/`, artefato Vite gerado
#      no predeploy a partir dessa cópia, nunca a raiz com código, testes ou dados auxiliares
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

# ⛔⛔ A CONTA DE SERVIÇO TEM DE VENCER A SESSÃO DE USUÁRIO VELHA.
#
# MEDIDO em 14/set/2026: com a chave durável LIGADA, o deploy mesmo assim morreu em
# "For CI servers and headless environments, generate a new token" — a CLI do Firebase
# PREFERE a sessão de usuário guardada (`~/.config/configstore/firebase-tools.json`), e
# aquela sessão tinha expirado. Ou seja: ter a credencial durável não bastava; era preciso
# a CLI não achar a outra.
#
# `XDG_CONFIG_HOME` aponta o cofre de credenciais da CLI para um diretório vazio: sem sessão
# de usuário para achar, ela usa a conta de serviço. Mexe SÓ nisso — trocar `HOME` também
# resolveria, mas levaria junto cache do npm e tudo o mais.
#
# ⚠️ Só entra quando a chave durável existe. Sem ela, o comportamento antigo continua, e a
# mensagem de "não autenticado" segue explicando o caminho que dura.
if [ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ] && [ -r "${GOOGLE_APPLICATION_CREDENTIALS}" ]; then
  export _SP_RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
  # ⛔ E SÓ SE ELA REALMENTE CONSEGUIR PUBLICAR. MEDIDO em 14/set/2026: a conta de serviço
  # autentica, mas não tem acesso aos SEGREDOS que três funções declaram — e o deploy morre
  # com 403 do Secret Manager. Esconder a sessão de usuário nesse caso troca um problema por
  # outro: some a credencial que funciona. O teste abaixo é uma leitura barata que usa
  # exatamente a permissão que falta; se passar, a conta de serviço assume (e não expira). Se
  # não, o script segue com a sessão de usuário e DIZ por quê, em vez de falhar no meio.
  _SP_CFG="$(mktemp -d)"
  # ⛔ O TESTE TEM DE COBRIR TUDO QUE O DEPLOY USA, não só o que me mordeu da última vez.
  # MEDIDO em 14/set/2026: a conta de serviço passou no teste do segredo e MESMO ASSIM o deploy
  # morreu depois, em `cloudbilling.googleapis.com ... 403` — a API de faturamento está
  # DESATIVADA no projeto, e a CLI a consulta antes de subir função. Um teste que valida metade
  # dá confiança falsa e falha no meio, que é o pior lugar para falhar.
  # ⛔ A SEGUNDA CONDIÇÃO É A API DE FATURAMENTO, e ela não se testa pela CLI: a consulta só
  # acontece lá dentro do deploy. MEDIDO em 14/set/2026: a conta de serviço passou no teste do
  # segredo e o deploy morreu depois em `cloudbilling.googleapis.com ... 403` — a API está
  # DESATIVADA no projeto. Um teste que valida metade dá confiança falsa e falha no meio.
  if XDG_CONFIG_HOME="$_SP_CFG" firebase --project "${PROJECT:-scoreplace-app}" \
       functions:secrets:get SIGNIN_API_KEY >/dev/null 2>&1 \
     && _SP_RAIZ="$(cd "$(dirname "$0")/.." && pwd)" && node -e '
       const {GoogleAuth}=require(process.env._SP_RAIZ+"/functions/node_modules/google-auth-library");
       const timer=setTimeout(()=>process.exit(1),15000);
       (async()=>{const a=new GoogleAuth({scopes:["https://www.googleapis.com/auth/cloud-platform"]});
        const t=(await (await a.getClient()).getAccessToken()).token;
        const r=await fetch("https://serviceusage.googleapis.com/v1/projects/scoreplace-app/services/cloudbilling.googleapis.com",
          {headers:{Authorization:"Bearer "+t}});
        const j=await r.json(); clearTimeout(timer);
        process.exit(r.ok && j.state==="ENABLED" ? 0 : 1);})().catch(()=>{clearTimeout(timer);process.exit(1);});' >/dev/null 2>&1; then
    export XDG_CONFIG_HOME="$_SP_CFG"
    trap 'rm -rf "$_SP_CFG"' EXIT
    echo "▸ credencial: conta de serviço ($(basename "$GOOGLE_APPLICATION_CREDENTIALS")) — não expira"
  else
    rm -rf "$_SP_CFG"
    # ⛔ DIZER O QUE DE FATO FALTOU, não o último motivo que eu conheci. Esta mensagem já
    # culpou os segredos quando o que faltava era a API de faturamento — e mandar consertar a
    # coisa errada custa mais caro que não dizer nada.
    echo "▸ credencial: sessão de usuário (a conta de serviço não passou no teste)"
    if ! XDG_CONFIG_HOME="$_SP_CFG" firebase --project scoreplace-app \
         functions:secrets:get SIGNIN_API_KEY >/dev/null 2>&1; then
      echo "  Falta: papel de Secret Manager para a conta de serviço."
    else
      echo "  Falta: a API cloudbilling.googleapis.com está DESATIVADA no projeto — a CLI a"
      echo "  consulta antes de subir função, e só a sessão de usuário passa por ela hoje."
    fi
    echo "  Enquanto isso, publicar depende de uma sessão que expira."
  fi
fi


# ── L6.R2.3 · UMA CÓPIA FIEL, MONTADA NUM LUGAR SÓ ───────────────────────────────────
# O preflight e a publicação precisam da MESMA cópia: mesma extração, mesmos symlinks,
# mesmo carimbo. Duas montagens divergiriam — e divergir aqui é o preflight aprovar uma
# árvore que não é a que sobe.
# ⚠️ `DEST` fica GLOBAL de propósito: o corpo veio do passo 3-5 e o publicador usa a
# variável depois da chamada. Sem `local`, o comportamento antigo é preservado byte a byte.
montar_copia() {
# (corpo do antigo passo 3-5, agora compartilhado com o preflight)
#
# ⛔ A REFERÊNCIA É ARGUMENTO, NÃO `HEAD`. `HEAD` é MÓVEL: com o push do main passando a
# acontecer ANTES do upload, um commit local criado no meio faria o `main` remoto apontar
# para um SHA e o pacote publicado conter OUTRO — com tudo na tela dizendo que deu certo.
# Quem chama passa `$COMMIT`, a identidade congelada. Sucesso passa a significar uma coisa
# só: SHA publicado no remoto = SHA arquivado = SHA carimbado.
DEST="$1"
REF="${2:?montar_copia exige a referência a arquivar (use \"$COMMIT\")}"
rm -rf "$DEST"; mkdir -p "$DEST"
git archive "$REF" | tar -x -C "$DEST"
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

# lixo que o Drive cria não compõe o artefato Vite; ainda assim bloqueamos cópia contaminada
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

# ⏱️ QUANTO CADA FASE CUSTA — medido, não estimado. Ordem do dono (13/set/2026):
# _"mais de 20 min a cada publicacao parece um funcionario publico burocrata"_. Antes de
# cortar qualquer coisa é preciso saber ONDE o tempo está; sem isto, cortar é chutar.
SP_T0=$(date +%s); SP_TF=$SP_T0
fase() { local a=$(date +%s); printf '   ⏱️  %s: %ds (total %ds)\n' "$1" "$((a-SP_TF))" "$((a-SP_T0))"; SP_TF=$a; }
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
fase "prerender"
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
fase "nota+gates locais"
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
fase "revisão cruzada"
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
  echo
  # ⛔ NÃO EMPURRAR DE VOLTA PRA CREDENCIAL QUE EXPIRA. `firebase login` é sessão de USUÁRIO,
  # e credencial de usuário do Google expira POR DESENHO (política de reautenticação). Mandar
  # rodar `--reauth` conserta por hoje e traz o mesmo bloqueio na semana que vem — foi o que
  # aconteceu, e o dono tinha razão de reclamar. O caminho que DURA é conta de serviço.
  if [ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]; then
    echo "  A causa provável: não há credencial DURÁVEL ligada (GOOGLE_APPLICATION_CREDENTIALS vazia)."
    echo "  Resolva de uma vez — conta de serviço, que não expira:"
    echo "      bash scripts/credencial-duradoura.sh --apply --ligar-no-shell"
    echo
    echo "  (só a primeira vez pede um  gcloud auth login)"
  else
    echo "  Há credencial durável ligada:"
    echo "      $GOOGLE_APPLICATION_CREDENTIALS"
    echo "  Então o problema é OUTRO — confira se o arquivo existe, se é legível e se a conta"
    echo "  de serviço tem os papéis (rode o script acima sem --apply pra ver a lista)."
  fi
  echo
  echo "  Saída para hoje, se estiver com pressa: firebase login --reauth"
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
fase "sessão firebase"

# ── 1.87 · BASE FRESCA E TOPOLOGIA — antes de QUALQUER gate de versão ────────────────
# ⛔ POR QUE AQUI E POR QUE BLOQUEANTE. A BASE (o SHA de origin/main) passa a valer para o
# lease do push, para a confirmação remota e para a revisão. Um fetch tolerante deixaria a
# BASE ser uma referência local VELHA, e tudo o que se apoia nela passaria a valer sobre um
# retrato antigo sem nada na tela dizer isso. Sem referência fresca não se decide o que
# publicar — então falhar aqui é parar, não avisar.
#
# ⛔ REFSPEC EXPLÍCITO E FORÇADO. Não depende da configuração de tracking da cópia, que varia
# entre clone e worktree e é justamente o que faz a referência envelhecer calada.
#
# ⛔ A BASE VEM DA REFERÊNCIA LOCAL RECÉM-ATUALIZADA, não de `git ls-remote`: o ls-remote
# devolve um NOME (o SHA) cujo OBJETO pode não existir aqui, e as conferências de topologia
# trabalham sobre o GRAFO. O ls-remote fica para a confirmação pós-push, onde o que importa
# é o estado do servidor naquele instante.
# MARCO: fetch-e-base
echo "▸ atualizando origin/main e congelando a base…"
if ! git fetch -q --no-tags origin '+refs/heads/main:refs/remotes/origin/main'; then
  echo
  echo "✗ não consegui atualizar origin/main — não publico decidindo por uma referência velha."
  exit 1
fi
BASE="$(git rev-parse refs/remotes/origin/main)"
echo "  ✓ base congelada: ${BASE:0:8}"

# ── 1.88 · OS QUATRO ESTADOS DE TOPOLOGIA ────────────────────────────────────────────
# ⛔ O TERCEIRO ESTADO É O QUE FALTAVA E O QUE MACHUCA. Até 22/set/2026 este trecho dizia
# apenas "✓ origin/main já contém este commit" e SEGUIA — e o que era empacotado adiante é o
# COMMIT LOCAL. Com o remoto à frente (alguém publicou de outra árvore, que é o caso real
# deste repositório), o script publicava o estado ANTIGO por cima do novo, anunciando
# sucesso. "Estar contido" foi tratado como "estar em dia".
#
# Esta classificação é PORTA DE ENTRADA BARATA — evita gastar o preflight inteiro num caso
# obviamente perdido. A GARANTIA contra corrida é o `--force-with-lease` do push.
# MARCO: topologia
if [[ "$BASE" == "$COMMIT" ]]; then
  echo "  ✓ origin/main e HEAD são o mesmo commit"
elif git merge-base --is-ancestor "$BASE" "$COMMIT" 2>/dev/null; then
  echo "  ✓ origin/main avança por fast-forward até este commit"
elif git merge-base --is-ancestor "$COMMIT" "$BASE" 2>/dev/null; then
  echo
  echo "✗ origin/main está À FRENTE deste commit — publicar aqui REBAIXARIA o ar."
  echo "  origin/main: ${BASE:0:8}   ·   HEAD: ${COMMIT:0:8}"
  echo "  Atualize o HEAD (git pull --ff-only) e rode de novo."
  exit 1
else
  echo
  echo "✗ HEAD e origin/main DIVERGIRAM — não publico um estado que o backup não alcança."
  echo "  origin/main: ${BASE:0:8}   ·   HEAD: ${COMMIT:0:8}"
  exit 1
fi

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

fase "gates de versão"
echo "▸ preflight: montando a cópia e rodando os gates ANTES de tocar no main…"
PRE="${TMPDIR:-/tmp}/sp-preflight-$$"
montar_copia "$PRE" "$COMMIT"
PRE_OK=1
# Os MESMOS comandos do `hosting.predeploy` (firebase.json), na mesma ordem, na cópia.
# `SP_EXIGE_CORRIDA_REAL=1` proíbe o desfecho "pulada" da corrida manual × automático:
# aqui ela roda no Emulator ou o deploy para.
if ! ( cd "$PRE" && SP_EXIGE_CORRIDA_REAL=1 PATH="/opt/homebrew/opt/openjdk/bin:$PATH" \
       node scripts/check-deploy-alignment.js \
    && node scripts/check-version-ahead.js \
    && node scripts/check-release-notes.js \
    && npm test \
    && npm run prerender \
    && npm run build:hosting ); then
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

fase "PREFLIGHT (suíte+prerender)"

# ── 2. O ENSAIO PARA AQUI — antes de encostar no remoto ──────────────────────
# ⛔ Com o push passando a vir ANTES do upload, o `--dry-run` teria começado a empurrar de
# verdade: o ensaio deixaria de ser ensaio. A saída fica antes de QUALQUER `git push`.
# MARCO: saida-do-ensaio
if [[ $DRY -eq 1 ]]; then
  montar_copia "${TMPDIR:-/tmp}/sp-deploy-$$" "$COMMIT"
  echo "✓ dry-run completo — nada foi empurrado e nada foi publicado."
  echo "  (a cópia ficou em $DEST)"
  exit 0
fi

# ── 3. O `main` DESCREVE O AR — então ele é atualizado ANTES do upload ───────
#
# ⛔ ESTA ORDEM JÁ ESTEVE ERRADA DOS DOIS LADOS. Em 01/set/2026 o push acontecia ANTES dos
# portões: na 2.1.81 um portão reprovou com o `main` já adiantado e consertar virou um
# commit a mais (é a invariante que `tests/preflight-antes-do-push.test.js` guarda). O push
# foi corretamente tirado de antes dos portões — e passou longe demais, parando DEPOIS do
# upload. Aí veio o defeito oposto, medido em 22/set/2026: o ar servindo 2.3.85 com
# origin/main em 2.3.83, porque o upload sobe e o push não.
#
# A ordem certa é a do meio, e é esta:  portões → push do main → upload.
# Ambas as bordas valem: nenhum commit de release entra no `main` antes dos portões, E nada
# é publicado antes de o `main` descrever aquilo.
#
# ⛔ `--force-with-lease` SOBRE A BASE CONGELADA é a GARANTIA, não as conferências acima.
# Qualquer avanço do remoto depois da amostra faz o push RECUSAR — e sem push não há upload.
# MARCO: push-do-main
echo "▸ empurrando o main ANTES do upload (falhar aqui é barato)…"
if ! git push --force-with-lease="refs/heads/main:$BASE" origin "$COMMIT:refs/heads/main"; then
  echo
  echo "✗ o push do main foi RECUSADO — o remoto mudou depois da conferência."
  echo "  NADA foi publicado. Atualize (git pull --ff-only) e rode de novo."
  exit 1
fi

# ── 3.5 · CONFIRMAR NO REMOTO, não na referência local ──────────────────────
# ⛔ `origin/main` local pode estar obsoleta exatamente no instante em que a confirmação
# importa. Quem responde é o servidor.
# ⚠️ ESTE CASO É DIFERENTE DA RECUSA DO LEASE e pede conduta diferente: lease recusado =
# "ninguém tocou no ar, atualize e recomece"; divergência aqui = "seu commit ENTROU e já foi
# ultrapassado". Uma mensagem só para os dois faria tratar o segundo como o primeiro.
# MARCO: confirmacao-remota
REMOTO="$(git ls-remote origin refs/heads/main 2>/dev/null | awk '{print $1}')"
if [[ "$REMOTO" != "$COMMIT" ]]; then
  echo
  echo "✗ DIVERGÊNCIA PÓS-PUSH: o main remoto é '${REMOTO:0:8}' e este commit é '${COMMIT:0:8}'."
  echo "  Seu commit entrou e já foi ultrapassado por outro publicador. NADA foi publicado."
  exit 1
fi
echo "  ✓ main remoto confirmado em ${COMMIT:0:8}"

# ── 4-5. cópia limpa + carimbo, do SHA CONFIRMADO (não de HEAD) ─────────────
montar_copia "${TMPDIR:-/tmp}/sp-deploy-$$" "$COMMIT"

# ── 6. publicar ──────────────────────────────────────────────────────────────
# ⚠️ SEM PIPE. Pipe transforma o exit code no do último comando e o gate do predeploy
# vira decoração — é a armadilha já registrada no CLAUDE.md (deploy-functions.sh).
cd "$DEST"
# ⛔ O CLI TAMBÉM SAI NÃO-ZERO DEPOIS DE PUBLICAR. MEDIDO em 12/set/2026: o log terminou com
# "✔ Deploy complete!" e, na linha seguinte, "Error: An unexpected error has occurred." — com
# `set -e` o script morreu ALI, depois de publicar e antes de empurrar o main e o backup. Ficou o
# pior dos mundos: o ar novo e o repositório atrás (exatamente o que a trava de alinhamento existe
# para impedir). Quem julga se publicou é O AR, conferido logo abaixo — não o código de saída.
# MARCO: portas-aposentadas-fora-do-ar
# ⛔ APAGAR O EXPORT NÃO APAGA A FUNÇÃO PUBLICADA. O deploy de Functions deriva os alvos dos
# exports que EXISTEM — um export removido simplesmente não entra na lista, e a função continua no
# ar, alcançável por qualquer aparelho antigo. As três abaixo escreviam no PERFIL GLOBAL de
# terceiro; deixar uma delas viva é manter o buraco aberto enquanto o repositório diz que fechou.
# ⚠️ Por isso a conferência é do AR, não do código: um teste de código fica verde com a função
# publicada. Se a API não responder, ABORTA — não publicar é melhor que publicar achando.
echo "▸ conferindo que as portas aposentadas não estão mais no ar…"
_APOSENTADAS="setParticipantsProfile setParticipantsGender applyLetzplayScans"
if ! _LISTA="$(firebase functions:list --project scoreplace-app 2>&1)"; then
  echo "✗ não consegui listar as Functions publicadas — abortando (não dá para publicar achando)."
  echo "$_LISTA" | tail -5
  exit 1
fi
# ⚠️ INSTRUIR A DELEÇÃO NÃO BASTA: quem instrui depende de alguém lembrar, e a função fica no ar
# enquanto o repositório diz que fechou. Aqui o fluxo APAGA o que achar e CONFERE de novo.
for _f in $_APOSENTADAS; do
  if echo "$_LISTA" | grep -q "$_f"; then
    echo "  ▸ aposentada ainda no ar: $_f — apagando…"
    firebase functions:delete "$_f" --region us-central1 --project scoreplace-app --force || true
  fi
done
if ! _LISTA2="$(firebase functions:list --project scoreplace-app 2>&1)"; then
  echo "✗ não consegui reconferir a lista das Functions — abortando."
  exit 1
fi
_VIVAS=""
for _f in $_APOSENTADAS; do
  if echo "$_LISTA2" | grep -q "$_f"; then _VIVAS="$_VIVAS $_f"; fi
done
if [[ -n "$_VIVAS" ]]; then
  echo "✗ AINDA NO AR depois da deleção:$_VIVAS — abortando antes de publicar."
  exit 1
fi
echo "  ✓ nenhuma das três está publicada"

# MARCO: upload
_DEPLOY_RC=0
firebase deploy --only hosting --project scoreplace-app || _DEPLOY_RC=$?
if [[ "$_DEPLOY_RC" != "0" ]]; then
  echo "⚠ o firebase saiu com código $_DEPLOY_RC — seguindo para a conferência NO AR, que é quem decide."
fi

# ── 7. conferir no ar ────────────────────────────────────────────────────────
cd "$RAIZ"
fase "push + upload"
echo "▸ conferindo o ar…"
for _ in $(seq 1 30); do
  AR="$(curl -s https://scoreplace.app/version.txt || true)"
  [[ "$AR" == "$VERSAO" ]] && break
  sleep 5
done
# ⛔ O CÓDIGO DE SAÍDA DO CLI NÃO DECIDE — quem decide é O AR, conferido acima. Só
# divergência ou esgotamento do prazo caracterizam upload não confirmado, e sucesso NUNCA é
# anunciado sem a versão no ar bater.
# MARCO: conferencia-do-ar
if [[ "${AR:-}" != "$VERSAO" ]]; then
  echo
  echo "✗ o ar responde '${AR:-vazio}' e era esperado '$VERSAO' — o upload NÃO foi confirmado."
  echo "  O main JÁ está em ${COMMIT:0:8}, ou seja, à frente do ar. Este é o lado seguro:"
  echo "  ninguém foi rebaixado. Para reconciliar, rode a publicação DESTE MESMO commit de novo."
  exit 1
fi
echo "✓ NO AR: $VERSAO  ·  main alinhado em ${COMMIT:0:8}"

# ── 8. o backup JÁ FOI — o push aconteceu no passo 3, antes do upload ───────
# ⛔ Não há push aqui. Ele saiu daqui de propósito: enquanto morou depois do upload, uma
# falha de rede deixava o AR À FRENTE do main, que é o desalinhamento que este script existe
# para impedir — e foi exatamente o que aconteceu (ar 2.3.85, main 2.3.83).

# O checkout principal acompanha; o remoto já foi confirmado no passo 3.5.
if git merge-base --is-ancestor "$COMMIT" refs/remotes/origin/main 2>/dev/null || [[ "$REMOTO" == "$COMMIT" ]]; then
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
fase "conferência do ar"
