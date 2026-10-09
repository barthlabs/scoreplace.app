#!/usr/bin/env bash
# revisar.sh — SEGUNDA OPINIÃO BIDIRECIONAL: o GPT (Codex CLI) revisa o que o Claude vai fazer,
# e o Claude (`claude -p`) revisa o que o Codex vai fazer. O núcleo é um só; os atalhos
# `revisar-com-gpt.sh` e `revisar-com-claude.sh` só fixam QUEM revisa.
#
# POR QUE EXISTE (04/set/2026, ordens do dono): "quero que o GPT sempre revise o que o Claude
# vai implementar, pra sermos mais assertivos"; "não executar o plano sem aprovação: se ele
# indicar ajustes, submete de novo até aprovar, e daí sim edita"; "quem dispara indica o
# modelo e o esforço do revisor, e o revisor indica o modelo e o esforço de quem executa";
# "pode ser bidirecional? se eu disparar do Claude, GPT revisa; se disparar do GPT, Claude revisa".
#
# QUEM REVISA (REVISOR=gpt|claude|auto; os atalhos fixam; sem nada = auto):
#   auto → o OPOSTO de quem chamou: dentro do Claude Code (CLAUDECODE=1) revisa o GPT; dentro
#          do Codex (CODEX_SANDBOX/THREAD_ID/SESSION_ID) revisa o Claude; sem pista, os DOIS revisam e os dois têm que aprovar.
#
# DUAS PORTAS:
#   plano  — ANTES de editar: quem vai implementar escreve o que muda e o revisor confere contra
#            o código REAL (leitura da árvore, nunca escrita). Só APROVADO libera; na resubmissão
#            o parecer anterior vai junto pra ele conferir o que foi atendido.
#   diff   — ANTES de publicar: revisa o corte atual desde SP_REVIEW_BASE (ou
#            origin/main na ausência dele) + o que não foi commitado. O deploy
#            informa a base do último corte para não reabrir ressalvas antigas.
#
# A FAIXA é o PISO do esforço — regra sobre os arquivos tocados, não opinião de modelo:
#   trivial  — só CSS/texto/notas/ícones, ou (SÓ no diff) só o bump em store.js → SEM revisão.
#   normal   — telas, componentes, fluxo de UI → GPT `revisao-normal` (medium) · Claude haiku/medium.
#   critica  — functions*/, rules, firebase.json, sw.js, store.js, router, main, DB, chave/sorteio/
#              placar/inscrição/perfil/auth/W.O./fases, scripts de deploy e check, extensions/,
#              arquivo NOVO nesses lugares, ou diff > 300 linhas (não rastreados contam)
#              → começa em medium; repete uma vez em high apenas com `ESCALAR: SIM`.
#   --modelo/--esforco = indicação explícita de quem dispara; o padrão é medium.
#
# INTERRUPTOR, UM POR LADO (ordem do dono: "quero poder desligar essa revisão automática e
# reativar quando voltarem os créditos, pra não ficarmos travados"): `desligar "<motivo>"` grava
# ~/.codex/scoreplace-revisao.desligada (revisor GPT) ou ~/.claude/scoreplace-revisao.desligada
# (revisor Claude); enquanto existir, plano e diff PASSAM com aviso em letras grandes (exit 0).
# `ligar` apaga; `status` mostra os dois lados. Fora do repo de propósito: vale pra toda worktree.
#
# SAÍDA: .claude/tmp/parecer-<revisor>-plano-<assunto>.md ou parecer-<revisor>-diff.md (último)
# + cópia datada. 1ª linha `VEREDITO: APROVADO | RESSALVAS | BLOQUEIO`; 2ª `EXECUTOR: modelo=… esforco=…`.
#   exit 0 → APROVADO (único que libera)        exit 1 → RESSALVAS (ajuste e SUBMETA DE NOVO)
#   exit 2 → BLOQUEIO (idem; diagnóstico em xeque) exit 3 → sem veredito legível (NÃO aprova)
#   exit 4 → cota esgotada / revisor indisponível (NÃO aprova)
#
# Uso (por qualquer dos atalhos, ou direto com REVISOR=…):
#   revisar-com-gpt.sh    plano <plano.md> [--modelo M] [--esforco E]   # Claude pede ao GPT
#   revisar-com-claude.sh plano <plano.md> [--modelo M] [--esforco E]   # Codex pede ao Claude
#   revisar.sh diff                                                     # auto: o oposto de quem chamou
#   revisar.sh faixa [arquivo...] · desligar "<motivo>" · ligar · status
# Escapes: SP_GPT_FAIXA=normal|critica só ELEVA. SP_SEM_GPT=1 só no diff, só com `sem-gpt: <motivo>`
#   num commit a publicar (vale pros dois revisores; nunca pra plano).
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"
CODEX="${CODEX_BIN:-/Applications/ChatGPT.app/Contents/Resources/codex}"
# O app Codex nasce com PATH mínimo e não herda ~/.local/bin, onde o instalador
# do Claude Code coloca o link estável. Resolver aqui torna a revisão independente
# do terminal que iniciou a sessão; CLAUDE_BIN explícito continua tendo prioridade.
if [[ -n "${CLAUDE_BIN:-}" ]]; then
  CLAUDE="$CLAUDE_BIN"
elif command -v claude >/dev/null 2>&1; then
  CLAUDE="$(command -v claude)"
elif [[ -x "$HOME/.local/bin/claude" ]]; then
  CLAUDE="$HOME/.local/bin/claude"
elif [[ -x "/Applications/Claude.app/Contents/MacOS/claude" ]]; then
  CLAUDE="/Applications/Claude.app/Contents/MacOS/claude"
else
  CLAUDE="claude"
fi
MODO="${1:-}"
[[ $# -gt 0 ]] && shift
OUTDIR="$RAIZ/.claude/tmp"
mkdir -p "$OUTDIR"

uso() { sed -n '2,52p' "${BASH_SOURCE[0]}"; exit 1; }
[[ "$MODO" =~ ^(faixa|plano|diff|desligar|ligar|status)$ ]] || uso

# ── quem revisa ──────────────────────────────────────────────────────────────────────
REVISOR="${REVISOR:-auto}"
[[ "$REVISOR" =~ ^(gpt|claude|auto)$ ]] || { echo "✗ REVISOR tem que ser gpt|claude|auto (veio '$REVISOR')"; exit 1; }
quem_chamou() {
  if [[ -n "${CLAUDECODE:-}" ]]; then echo claude
  # MEDIDO em 07/set/2026 (`env | grep ^CODEX` de dentro do `codex exec`): CODEX_SANDBOX,
  # CODEX_SANDBOX_NETWORK_DISABLED, CODEX_THREAD_ID, CODEX_SESSION_ID, CODEX_CI. CODEX_BIN é nosso.
  elif env | grep -qE '^CODEX_(SANDBOX|THREAD_ID|SESSION_ID|CI|HOME|CLI_PATH)='; then echo codex
  else echo ninguem; fi
}
if [[ "$REVISOR" == "auto" && "$MODO" =~ ^(plano|diff)$ ]]; then
  case "$(quem_chamou)" in
    claude) REVISOR=gpt ;;
    codex)  REVISOR=claude ;;
    *)
      echo "▸ ninguém identificado como autor — os DOIS revisam e os dois têm que aprovar."
      REVISOR=gpt    "${BASH_SOURCE[0]}" "$MODO" "$@" || exit $?
      REVISOR=claude "${BASH_SOURCE[0]}" "$MODO" "$@" || exit $?
      exit 0 ;;
  esac
fi
chave_de() { # $1 = gpt|claude
  if [[ "$1" == gpt ]]; then echo "${SP_GPT_CHAVE:-$HOME/.codex/scoreplace-revisao.desligada}"
  else echo "${SP_CLAUDE_CHAVE:-$HOME/.claude/scoreplace-revisao.desligada}"; fi
}

# ── interruptor ──────────────────────────────────────────────────────────────────────
case "$MODO" in
  desligar)
    [[ "$REVISOR" != auto ]] || { echo "✗ diga QUAL revisor: revisar-com-gpt.sh desligar … ou revisar-com-claude.sh desligar …"; exit 1; }
    [[ -n "${1:-}" ]] || { echo "✗ diga o motivo: revisar-com-$REVISOR.sh desligar \"sem créditos até 06/set\""; exit 1; }
    CHAVE="$(chave_de "$REVISOR")"; mkdir -p "$(dirname "$CHAVE")"
    printf 'revisor: %s\ndesde: %s\nmotivo: %s\n' "$REVISOR" "$(date '+%Y-%m-%d %H:%M')" "$1" > "$CHAVE"
    echo "🔕 revisão pelo $REVISOR DESLIGADA — $1"; echo "   religue com: scripts/revisar-com-$REVISOR.sh ligar"; exit 0 ;;
  ligar)
    [[ "$REVISOR" != auto ]] || { echo "✗ diga QUAL revisor: revisar-com-gpt.sh ligar ou revisar-com-claude.sh ligar"; exit 1; }
    CHAVE="$(chave_de "$REVISOR")"
    if [[ -e "$CHAVE" ]]; then rm -f "$CHAVE"; echo "🔔 revisão pelo $REVISOR LIGADA de novo."; else echo "🔔 revisão pelo $REVISOR já estava ligada."; fi; exit 0 ;;
  status)
    for r in gpt claude; do
      [[ "$REVISOR" == auto || "$REVISOR" == "$r" ]] || continue
      CHAVE="$(chave_de "$r")"
      if [[ -e "$CHAVE" ]]; then echo "🔕 revisor $r: DESLIGADA"; sed 's/^/   /' "$CHAVE"; else echo "🔔 revisor $r: LIGADA"; fi
    done; exit 0 ;;
esac

# ── argumentos ───────────────────────────────────────────────────────────────────────
MODELO=""; ESFORCO=""; PLANO=""; ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --modelo)  MODELO="${2:-}"; shift 2 ;;
    --esforco) ESFORCO="${2:-}"; shift 2 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
if [[ -n "$ESFORCO" && ! "$ESFORCO" =~ ^(low|medium|high|xhigh|max)$ ]]; then
  echo "✗ --esforco tem que ser low|medium|high|xhigh|max (veio '$ESFORCO')"; exit 1
fi
if [[ -n "${SP_GPT_FAIXA:-}" && ! "${SP_GPT_FAIXA}" =~ ^(normal|critica)$ ]]; then
  echo "✗ SP_GPT_FAIXA só aceita normal|critica — nunca trivial (veio '${SP_GPT_FAIXA}')"; exit 1
fi

# ── arquivos tocados ─────────────────────────────────────────────────────────────────
base_do_diff() {
  local base="${SP_REVIEW_BASE:-origin/main}"
  if git rev-parse --verify -q "${base}^{commit}" >/dev/null; then
    printf '%s\n' "$base"
  else
    printf '%s\n' 'origin/main'
  fi
}
BASE_DIFF="$(base_do_diff)"
arquivos_do_diff() {
  {
    git diff --name-only "$BASE_DIFF"...HEAD 2>/dev/null || true
    git diff --name-only HEAD 2>/dev/null || true
    git ls-files --others --exclude-standard 2>/dev/null || true
  } | sed '/^$/d' | sort -u
}
# Um orquestrador de lotes pode restringir a revisão a uma lista explícita. Sem
# essa variável, a revisão preserva o comportamento histórico e cobre o corte
# inteiro.
arquivos_do_escopo() {
  if [[ -n "${SP_REVIEW_FILE_LIST:-}" ]]; then
    [[ -f "$SP_REVIEW_FILE_LIST" ]] || { echo "✗ SP_REVIEW_FILE_LIST não encontrado: $SP_REVIEW_FILE_LIST" >&2; return 1; }
    cat "$SP_REVIEW_FILE_LIST"
  else
    arquivos_do_diff
  fi
}
diff_do_escopo() {
  local f
  while IFS= read -r f; do
    [[ -n "$f" ]] || continue
    git diff "$BASE_DIFF"...HEAD -- "$f" 2>/dev/null || true
    git diff HEAD -- "$f" 2>/dev/null || true
  done < "$LISTA"
}
# plano: todo caminho citado — EXISTINDO OU NÃO (arquivo novo em functions/ é crítico antes de nascer)
arquivos_do_plano() {
  grep -oE '[A-Za-z0-9_][A-Za-z0-9_./-]*\.(js|mjs|rules|json|html|css|sh|toml|md)' "$1" \
    | sed 's#^\./##' | sort -u || true
}
# store.js é CRÍTICO, mas o bump de versão sozinho é TRIVIAL — SÓ no diff há como saber
so_bump_de_versao() {
  local n
  n=$( { git diff "$BASE_DIFF"...HEAD -- js/store.js; git diff HEAD -- js/store.js; } 2>/dev/null \
       | grep -E '^[-+]' | grep -vE '^(\+\+\+|---)' | grep -vc 'SCOREPLACE_VERSION' || true )
  [[ "${n:-0}" -eq 0 ]]
}
linhas_do_diff() { # inclui não rastreados: eles vão pro revisor, então contam no teto
  local n1 n2
  n1=$( { git diff --numstat "$BASE_DIFF"...HEAD 2>/dev/null; git diff --numstat HEAD 2>/dev/null; } \
        | awk '{a+=$1; d+=$2} END {print a+d+0}' )
  n2=$( git ls-files --others --exclude-standard -z 2>/dev/null | xargs -0 cat 2>/dev/null | wc -l | tr -d ' ' )
  echo $(( ${n1:-0} + ${n2:-0} ))
}

# ── a REGRA da faixa ─────────────────────────────────────────────────────────────────
classificar() { # lê caminhos no stdin; imprime trivial|normal|critica
  local f crit=0 nontriv=0
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    if [[ "$f" == "js/store.js" && "$ORIGEM" == "diff" ]] && so_bump_de_versao; then continue; fi
    case "$f" in
      functions/*|functions-autodraw/*|functions-stripe/*|firestore.rules|firestore.indexes.json|firebase.json|sw.js|\
      js/store.js|js/firebase-db.js|js/presence-db.js|js/venue-db.js|js/router.js|js/main.js|js/deep-link.js|\
      js/letzplay-model.js|js/views/*torneio*|js/views/*tournament*|js/views/*chave*|js/views/*draw*|js/views/*bracket*|\
      js/views/*format2*|js/views/*dobra*|js/views/*placar*|js/views/*score*|js/views/*result*|js/views/*standing*|\
      js/views/*inscri*|js/views/*enroll*|js/views/*perfil*|js/views/*profile*|js/views/*auth*|js/views/*identity*|\
      js/views/*substitution*|js/views/*host-transfer*|js/views/*delete-account*|js/views/wo-*|js/views/*phase*|\
      js/views/*persist*|js/views/*waitlist*|js/views/*user-vivo*|js/views/participants.js|js/views/*team-formation*|\
      js/views/wa-group.js|js/views/*round-bounds*|js/views/*liga*|\
      scripts/deploy-*|scripts/hooks/*|scripts/check-*|scripts/revisar*.sh|extensions/*)
        crit=1 ;;
      *.css|*.md|*.txt|*.png|*.jpg|*.jpeg|*.svg|*.webp|*.ico|*.pdf|docs/*|icons/*|\
      js/release-notes.js|js/i18n-*.js|js/coachmarks.js|js/trophy-catalog.js|js/notification-catalog.js|\
      index.html|version.txt|README*)
        ;;
      *) nontriv=1 ;;
    esac
  done
  if [[ $crit -eq 1 ]]; then echo critica; elif [[ $nontriv -eq 1 ]]; then echo normal; else echo trivial; fi
}
nivel() { case "$1" in trivial) echo 0;; normal) echo 1;; critica) echo 2;; esac; }
faixa_para() { # $1 = arquivo com a lista; aplica o teto de linhas (só diff) e o override (só eleva)
  local faixa
  faixa=$(classificar < "$1")
  if [[ "$ORIGEM" == "diff" && "$faixa" != "critica" ]]; then
    local n; n=$(linhas_do_diff)
    [[ "${n:-0}" -gt 300 ]] && faixa=critica
  fi
  if [[ -n "${SP_GPT_FAIXA:-}" ]] && [[ $(nivel "$SP_GPT_FAIXA") -gt $(nivel "$faixa") ]]; then
    faixa="$SP_GPT_FAIXA"
  fi
  echo "$faixa"
}

ORIGEM="$MODO"   # diff (há git), lista (à mão) ou plano (texto)
LISTA="$(mktemp "${TMPDIR:-/tmp}/sp-revisao-lista.XXXXXX")"
PROMPT=""; RASCUNHO=""
trap 'rm -f "$LISTA" "$PROMPT" "$RASCUNHO"' EXIT

case "$MODO" in
  faixa)
    if [[ ${#ARGS[@]} -gt 0 ]]; then printf '%s\n' "${ARGS[@]}" > "$LISTA"; ORIGEM=lista; else arquivos_do_diff > "$LISTA"; ORIGEM=diff; fi
    FAIXA=$(faixa_para "$LISTA"); echo "faixa: $FAIXA"; sed 's/^/  /' "$LISTA"; exit 0 ;;
  plano)
    PLANO="${ARGS[0]:-}"; [[ -f "$PLANO" ]] || { echo "✗ plano não encontrado: '$PLANO'"; uso; }
    arquivos_do_plano "$PLANO" > "$LISTA" ;;
  diff)
    arquivos_do_escopo > "$LISTA" ;;
esac

FAIXA=$(faixa_para "$LISTA")
echo "▸ revisão pelo $REVISOR ($MODO) — faixa: $FAIXA"
sed 's/^/    /' "$LISTA"

CHAVE="$(chave_de "$REVISOR")"
if [[ -e "$CHAVE" ]]; then
  echo
  echo "  ╔══════════════════════════════════════════════════════════════════════════╗"
  printf "  ║ 🔕 REVISÃO PELO %-6s DESLIGADA — este %-5s segue SEM segunda opinião.   ║\n" "$(echo "$REVISOR" | tr a-z A-Z)" "$MODO"
  echo "  ╚══════════════════════════════════════════════════════════════════════════╝"
  sed 's/^/     /' "$CHAVE"
  echo "     religue com: scripts/revisar-com-$REVISOR.sh ligar"
  echo
  exit 0
fi
if [[ "${SP_SEM_GPT:-0}" == "1" ]]; then
  [[ "$MODO" == "diff" ]] || { echo "✗ SP_SEM_GPT não vale pra PLANO: plano só segue com APROVADO (ordem do dono)."; exit 1; }
  MOTIVO=$(git log --format=%B origin/main..HEAD 2>/dev/null | grep -m1 -iE 'sem-gpt: *\S' || true)
  [[ -n "$MOTIVO" ]] || { echo "✗ SP_SEM_GPT=1 exige o motivo NUM COMMIT a publicar: uma linha 'sem-gpt: <por quê>'. Não achei."; exit 1; }
  echo "  ⚠️ revisão PULADA por ordem explícita — $MOTIVO"; exit 0
fi
if [[ "$FAIXA" == "trivial" ]]; then
  echo "  ✓ faixa trivial — sem revisão (CSS/texto/notas/bump). Force com SP_GPT_FAIXA=normal."; exit 0
fi

# ── motor: custo adaptativo ──────────────────────────────────────────────────────────
# O primeiro parecer sempre começa em medium. Alta complexidade define a FAIXA e torna
# obrigatória a segunda opinião, mas não cobra high por antecipação. O revisor só pede
# a tentativa high escrevendo `ESCALAR: SIM` quando medium não conseguiu formar um
# veredito confiável por limite material de análise. Ressalvas concretas NÃO escalam:
# quem executa corrige e a nova submissão recomeça em medium.
# Cada chamada é isolada, logo toda revisão seguinte volta ao padrão medium.
PISO=medium
nivel_esf() { case "$1" in low) echo 0;; medium) echo 1;; high) echo 2;; xhigh|max) echo 3;; esac; }
if [[ -n "$ESFORCO" ]] && [[ $(nivel_esf "$ESFORCO") -lt $(nivel_esf "$PISO") ]]; then
  echo "  ⚠️ --esforco $ESFORCO fica ABAIXO do piso da faixa ($PISO); vai $PISO."; ESFORCO="$PISO"
fi
if [[ "$REVISOR" == gpt ]]; then
  [[ -x "$CODEX" ]] || { echo "✗ Codex CLI não encontrado em $CODEX (instale o app ChatGPT ou exporte CODEX_BIN)"; exit 4; }
  [[ "$ESFORCO" == max ]] && ESFORCO=xhigh
  EXECUTOR_DICA='modelo=<sonnet|opus|fable> esforco=<low|medium|high|max>  (é o CLAUDE que vai executar: sonnet/low pra mudança mecânica e local; opus/high pra lógica com concorrência, dados de usuário, torneio dividido; fable/max só quando errar custa dado de produção)'
  QUEM_EXECUTA="o Claude"
else
  { [[ -x "$CLAUDE" ]] || command -v "$CLAUDE" >/dev/null 2>&1; } || { echo "✗ Claude Code CLI não encontrado ('$CLAUDE'; exporte CLAUDE_BIN)"; exit 4; }
  [[ "$ESFORCO" == xhigh ]] && ESFORCO=max
  # Ordem do dono (14/set): revisão econômica em todas as faixas, sem escalada
  # automática. Sonnet só entra se for pedido explicitamente com --modelo.
  if [[ -z "$MODELO" ]]; then
    MODELO=haiku
  fi
  [[ -n "$ESFORCO" ]] || ESFORCO="$PISO"
  EXECUTOR_DICA='modelo=<gpt-5.6-terra|outro> esforco=<low|medium|high|xhigh>  (é o GPT/Codex que vai executar: low pra mudança mecânica e local; high pra lógica com concorrência, dados de usuário, torneio dividido; xhigh só quando errar custa dado de produção)'
  QUEM_EXECUTA="o GPT (Codex)"
fi

# ── o pedido ao revisor ──────────────────────────────────────────────────────────────
PROMPT="$(mktemp "${TMPDIR:-/tmp}/sp-revisao-prompt.XXXXXX")"
EVIDENCIA_REVISAO=""
if [[ "$MODO" == diff && "${SP_REVIEW_VALIDATE:-0}" == 1 ]]; then
  EVIDENCIA_REVISAO="$(mktemp "${TMPDIR:-/tmp}/sp-evidencia-revisao.XXXXXX")"
  LOG_VALIDACAO="$(mktemp "${TMPDIR:-/tmp}/sp-evidencia-log.XXXXXX")"
  trap 'rm -f "$LISTA" "$PROMPT" "$RASCUNHO" "$EVIDENCIA_REVISAO" "$LOG_VALIDACAO"' EXIT
  validar_para_revisao() {
    local rotulo="$1"; shift
    if "$@" > "$LOG_VALIDACAO" 2>&1; then
      printf '✓ %s (exit 0)\n' "$rotulo"
    else
      printf '✗ %s falhou; últimas linhas:\n' "$rotulo"
      tail -80 "$LOG_VALIDACAO"
      return 1
    fi
  }
  if ! {
    echo "Comandos executados pelo gate obrigatório nesta submissão:"
    validar_para_revisao "agenda geral" node tests/bracket-geral-agenda.test.js
    validar_para_revisao "atalho da dashboard" node tests/dashboard-card-opens-next-game.test.js
    validar_para_revisao "suíte completa" npm test
    echo
    echo "Status do teste de dashboard contra origin/main:"
    git log --oneline -3 -- tests/dashboard-card-opens-next-game.test.js
    git diff --stat origin/main HEAD -- tests/dashboard-card-opens-next-game.test.js
  } > "$EVIDENCIA_REVISAO"; then
    cat "$EVIDENCIA_REVISAO"
    exit 1
  fi
  export SP_REVIEW_EVIDENCE="$EVIDENCIA_REVISAO"
fi
if [[ "$MODO" == "plano" ]]; then
  SLUG=$(basename "$PLANO" .md | sed 's/^plano-//'); OUT="$OUTDIR/parecer-$REVISOR-plano-$SLUG.md"
else
  PARTE="${SP_REVIEW_PART:-}"
  OUT="$OUTDIR/parecer-$REVISOR-diff${PARTE:+-$PARTE}.md"
fi
# Para `diff`, um parecer aprovado só pode ser reaproveitado se o conteúdo exato
# revisado for idêntico. Assim o deploy não cobra/reaguarda o Claude quando nada
# mudou, mas qualquer alteração invalida o recibo automaticamente.
RECIBO="$OUT.sha256"
RECIBO_BASE="$OUT.base"
FINGERPRINT=""
if [[ "$MODO" == diff ]]; then
  FINGERPRINT=$( { diff_do_escopo; while IFS= read -r f; do [[ -f "$f" ]] && shasum -a 256 "$f"; done < "$LISTA"; } | shasum -a 256 | awk '{print $1}')
  if [[ -s "$OUT" && -s "$RECIBO" && "$(cat "$RECIBO")" == "$FINGERPRINT" ]] && grep -qE '(^|\*\*)VEREDITO: *APROVADO' "$OUT"; then
    echo "  ✓ parecer APROVADO reaproveitado: diff idêntico ($FINGERPRINT)."
    exit 0
  fi
fi
# Um parecer só é contexto de ressubmissão se revisou O MESMO corte. Sem essa
# vinculação, trocar origin/main pela base real da publicação carregava uma
# ressalva histórica (até de outro release) e a transformava em bloqueio eterno.
ANTERIOR=""
if [[ "$MODO" == diff && -s "$OUT" && -s "$RECIBO_BASE" && "$(cat "$RECIBO_BASE")" == "$BASE_DIFF" ]]; then
  ANTERIOR="$(cat "$OUT")"
elif [[ "$MODO" != diff && -s "$OUT" ]]; then
  ANTERIOR="$(cat "$OUT")"
fi
{
  cat <<EOF
Você é o REVISOR de segunda opinião deste repositório (scoreplace.app — SPA em vanilla JS +
Firebase). Outro agente ($QUEM_EXECUTA) vai implementar; seu trabalho é achar o que ele NÃO viu,
e NADA é implementado sem o seu APROVADO. Você tem leitura da árvore inteira: CONFIRA CONTRA O
CÓDIGO REAL, não contra o que o texto afirma. Nunca edite nada. As regras da casa estão em
CLAUDE.md (AGENTS.md é a mesma coisa). Se já foi carregado no contexto, não releia o mesmo
arquivo. Inspecione primeiro o diff e apenas as dependências necessárias; não percorra
changelogs históricos ou documentação inteira sem ligação com um achado. Responda em português do Brasil.
A revisão Claude usa motores econômicos e não escala automaticamente. ESCALAR: SIM é um
pedido fundamentado para o executor avaliar, nunca autorização para uma chamada mais cara.

FORMATO OBRIGATÓRIO — as DUAS primeiras linhas, exatamente assim:
VEREDITO: APROVADO | RESSALVAS | BLOQUEIO      (escolha UMA)
EXECUTOR: $EXECUTOR_DICA — <por quê, 1 linha>
ESCALAR: SIM | NAO
(APROVADO = pode implementar como está; RESSALVAS = só depois de atender o que você lista —
o texto volta pra você; BLOQUEIO = vai quebrar produção, perder dado, violar regra do
CLAUDE.md, ou o diagnóstico está errado. Se é resubmissão, diga na linha EXECUTOR se os pontos
anteriores foram atendidos.)

Use ESCALAR: SIM SOMENTE se medium não permitiu uma conclusão confiável porque falta
investigação técnica concreta (por exemplo, uma cadeia transacional extensa ou uma dúvida
de autorização que exige prova adicional). Não escale por cautela genérica, por tamanho do
diff, nem só porque há RESSALVAS ou BLOQUEIO: nesses casos, liste os ajustes e deixe NAO.

LIMITE DE AUTORIDADE: revisão é consultiva e só pode bloquear por defeito concreto,
reproduzível e ligado ao corte (regressão, segurança, perda de dados, autorização ou falha
de build/teste). Não bloqueie por memória externa, arquivo fora do repositório, preferência
de processo, relato manual de teste, ou tarefa documental não solicitada pelo responsável.
O deploy executa a suíte completa depois da revisão; peça um teste adicional apenas quando
ele provar um defeito específico deste diff, indicando arquivo e cenário.
Quando o diff referencia variável, função ou script parcialmente fora do corte, use Read/Grep
na árvore atual antes de declarar algo indefinido, ausente ou sem contexto. A árvore atual é
autoridade: um diff é deliberadamente parcial e não prova que uma definição antiga inexiste.
Quando o cabeçalho disser LOTE, ele é apenas uma partição de transporte do mesmo corte: não
infira ausência de arquivo, função, teste ou cópia vendor porque não apareceu naquele lote.
Antes de alegar que um arquivo ou símbolo não existe, confirme com Read/Grep na árvore e cite
o resultado concreto. Você não tem Bash: nunca afirme que testes falharam, passaram ou foram
executados, salvo quando isso constar expressamente na EVIDÊNCIA DE VALIDAÇÃO do pipeline.
Para cópias vendor, compare fonte e destino na árvore atual ou descreva uma divergência
comprovada; arquivos relacionados podem estar deliberadamente em lotes diferentes.

Depois, só o que for concreto, sempre com arquivo:linha:
1. O QUE QUEBRA — regressão, caso não coberto, concorrência, dado que some.
2. O QUE JÁ EXISTE — função/padrão/porta que o texto reinventa em vez de reusar.
3. O QUE FALTA — dado, teste, caminho (offline, torneio dividido, versão velha da loja).
4. AJUSTE SUGERIDO — a versão corrigida do plano/diff, curta.
5. RELEASE — quando o diff tiver código de app, confira version.txt, SCOREPLACE_VERSION,
   CACHE_NAME e compare a versão com origin/main:version.txt. Esta revisão roda ANTES do
   scripts/prepare-hosting-release.js, que o scripts/deploy-hosting.sh executa e commita para
   subir o próximo patch/cache-buster: não exija um bump já presente no pré-corte. Só marque
   BLOQUEIO se esse fluxo não existir ou não sincronizar app e service worker após o preparo.
   Código novo com a mesma versão do release-base só bloqueia quando esse preparo não puder
   gerar o patch/cache-buster antes do upload.
Sem elogios, sem resumo do que leu, sem repetir o texto. Se algo é opinião, marque como tal.
EOF
  echo
  if [[ -n "$ANTERIOR" ]]; then
    echo "=== SEU PARECER ANTERIOR sobre este mesmo $MODO (é RESUBMISSÃO: confira ponto a ponto o que foi atendido) ==="
    echo "$ANTERIOR"; echo
  fi
  if [[ "$MODO" == "plano" ]]; then
    echo "=== PLANO A REVISAR (arquivo: $PLANO) ==="; cat "$PLANO"
  else
    echo "=== DIFF A REVISAR ($BASE_DIFF..HEAD + alterações não commitadas) ==="
    [[ -n "${SP_REVIEW_PART:-}" ]] && echo "=== LOTE ${SP_REVIEW_PART}: todos os lotes precisam ser aprovados antes da publicação ==="
    if [[ -n "${SP_REVIEW_CROSS_BATCH_EVIDENCE:-}" && -f "$SP_REVIEW_CROSS_BATCH_EVIDENCE" ]]; then
      echo "=== EVIDÊNCIA CRUZADA ENTRE LOTES ==="
      cat "$SP_REVIEW_CROSS_BATCH_EVIDENCE"
      echo
      echo "A evidência cruzada acima é executada pelo orquestrador nesta submissão."
      echo "Ela demonstra contratos que podem ter fonte, vendor, teste e boundary em lotes distintos;"
      echo "não trate essa separação de transporte como ausência sem apontar uma divergência concreta."
      echo "Os fatos nela marcados com ✓ são parte do corte: não peça que sejam recriados no lote atual."
      echo "Não recomende edição manual de Firestore nem liberar feature bloqueada por flag false; só aponte um defeito verificável no contrato ou na prova exibida."
    fi
    if [[ -n "${SP_REVIEW_EVIDENCE:-}" && -f "$SP_REVIEW_EVIDENCE" ]]; then
      echo "=== EVIDÊNCIA DE VALIDAÇÃO EXECUTADA PELO PIPELINE ==="
      cat "$SP_REVIEW_EVIDENCE"
      echo
      echo "A evidência acima foi produzida pelo pipeline nesta execução. Não peça novamente os mesmos comandos; só bloqueie por defeito concreto do diff."
    fi
    echo "--- commits à frente da base do corte:"; git log --oneline "$BASE_DIFF"..HEAD 2>/dev/null || true
    echo "--- diff:"; diff_do_escopo
    git ls-files --others --exclude-standard -z 2>/dev/null | while IFS= read -r -d '' f; do
      echo "--- arquivo NOVO não rastreado: $f"; sed -n '1,400p' "$f"
    done
  fi
} > "$PROMPT"

CARIMBO="$(date +%Y%m%d-%H%M%S)"
OUT_DATADO="${OUT%.md}-$CARIMBO.md"
LOG="${OUT%.md}.log"
RASCUNHO="$(mktemp "${TMPDIR:-/tmp}/sp-revisao-out.XXXXXX")"
# Guarde o pedido completo. Se a retificação formal também vier vazia, repetimos
# apenas este lote uma vez; nunca reabrimos os lotes já aprovados.
PROMPT_ORIGINAL="$PROMPT"

executar_revisor() {
  local sufixo="$1"
  RASCUNHO="$(mktemp "${TMPDIR:-/tmp}/sp-revisao-out.XXXXXX")"
  local log_exec="${LOG%.log}${sufixo}.log"
  local err_exec="${log_exec%.log}.stderr"
  set +e
  TOKENS=""
  if [[ "$REVISOR" == gpt ]]; then
  EXTRA=(); [[ -n "$MODELO" ]] && EXTRA+=(-m "$MODELO"); [[ -n "$ESFORCO" ]] && EXTRA+=(-c "model_reasoning_effort=\"$ESFORCO\"")
  # ⛔ `${EXTRA[@]+"${EXTRA[@]}"}` e NÃO `"${EXTRA[@]}"`: o bash do macOS é 3.2, e nele um
  # array VAZIO sob `set -u` estoura "unbound variable". Só acontece quando ninguém passa
  # --modelo/--esforco — que é o caminho PADRÃO, o mesmo do passo 1.8 do deploy. Ou seja:
  # a revisão morria calada exatamente na forma em que ela é chamada de verdade.
  "$CODEX" exec -p "revisao-$FAIXA" ${EXTRA[@]+"${EXTRA[@]}"} --sandbox read-only -C "$RAIZ" --skip-git-repo-check \
    --ephemeral -o "$RASCUNHO" - < "$PROMPT" > "$log_exec" 2>&1
  RC=$?
  TOKENS=$(grep -A1 -m1 'tokens used' "$log_exec" | tail -1 | tr -d ' ' || true)
  else
  # `claude -p` de dentro de uma sessão do Claude Code exige tirar CLAUDECODE do ambiente.
  # Só leitura: Edit/Write/NotebookEdit/Bash proibidos — o diff já vai no prompt.
  # `dontAsk` é indispensável no `-p`: sem UI interativa, uma tentativa de ferramenta
  # aguardava confirmação e terminava sem stdout. A allowlist é só leitura; stderr vai
  # separado porque o parser abaixo procura o 1º `{` do stdout.
  CLAUDE_EXTRA=(); [[ "$MODELO" != haiku ]] && CLAUDE_EXTRA+=(--effort "$ESFORCO")
  # Teto separado por motor: Haiku recebe US$ 0.35; Sonnet crítico, US$ 0.60. O limite
  # anterior de 0.25 encerrava revisões normais antes de devolver veredito, bloqueando o
  # deploy sem uma avaliação. Um override explícito continua possível para diagnóstico.
  if [[ "$MODELO" == haiku ]]; then
    CLAUDE_ORCAMENTO="${SP_CLAUDE_MAX_BUDGET_USD_NORMAL:-0.35}"
  else
    CLAUDE_ORCAMENTO="${SP_CLAUDE_MAX_BUDGET_USD_CRITICA:-0.60}"
  fi
  env -u CLAUDECODE "$CLAUDE" -p --model "$MODELO" ${CLAUDE_EXTRA[@]+"${CLAUDE_EXTRA[@]}"} \
    --max-budget-usd "$CLAUDE_ORCAMENTO" --no-session-persistence --disable-slash-commands \
    --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
    --permission-mode dontAsk --tools Read Glob Grep --output-format json \
    < "$PROMPT" > "$log_exec" 2> "$err_exec"
  RC=$?
  node -e '
    const fs=require("fs"); const raw=fs.readFileSync(process.argv[1],"utf8");
    let j=null; try { j=JSON.parse(raw.slice(raw.indexOf("{"))); } catch(e){}
    if (!j || j.is_error || typeof j.result!=="string") process.exit(1);
    fs.writeFileSync(process.argv[2], j.result.replace(/\s+$/,"")+"\n");
    const u=j.usage||{}; const t=(u.input_tokens||0)+(u.cache_creation_input_tokens||0)+(u.cache_read_input_tokens||0)+(u.output_tokens||0);
    console.log(t+" tokens · US$ "+(j.total_cost_usd||0).toFixed(2));
  ' "$log_exec" "$RASCUNHO" > "$RASCUNHO.meta" 2>/dev/null || RC=1
  TOKENS=$(cat "$RASCUNHO.meta" 2>/dev/null || true); rm -f "$RASCUNHO.meta"
  fi
  set -e
  if cat "$log_exec" "$err_exec" 2>/dev/null | grep -qiE "usage limit|rate limit|insufficient.?(quota|credits)|out of (credits|extra usage)|limit reached"; then
  echo "✗ COTA DO REVISOR ($REVISOR) ESGOTADA — não respondeu. Isto NÃO é aprovação."
  grep -m1 -iE "usage limit|rate limit|try again|limit reached" "$log_exec" | cut -c1-200
  echo "   pra não travar: scripts/revisar-com-$REVISOR.sh desligar \"<motivo>\""
  exit 4
  fi
  if [[ $RC -ne 0 || ! -s "$RASCUNHO" ]]; then
    echo "✗ o revisor ($REVISOR) não devolveu parecer (exit $RC). Log: $log_exec"
    tail -20 "$log_exec" | cut -c1-300; [[ -s "$err_exec" ]] && tail -5 "$err_exec" | cut -c1-300; exit 3
  fi
  LOG="$log_exec"
}

echo "  revisor: $REVISOR${MODELO:+ · modelo $MODELO}${ESFORCO:+ · esforço $ESFORCO}${ANTERIOR:+ · RESUBMISSÃO} · prompt: $(wc -c < "$PROMPT" | tr -d ' ') bytes · aguarde (minutos)…"
executar_revisor ""
mv "$RASCUNHO" "$OUT"; RASCUNHO=""
[[ "$MODO" == diff ]] && printf '%s\n' "$BASE_DIFF" > "$RECIBO_BASE"

ESCALAR=$(grep -m1 -oE 'ESCALAR: *(SIM|NAO)' "$OUT" | sed 's/ESCALAR: *//' || true)
if [[ "$REVISOR" == gpt && "$ESCALAR" == SIM && "$ESFORCO" == medium ]]; then
  echo "  ▸ medium pediu investigação adicional: uma única repetição em high."
  cp "$OUT" "${OUT%.md}-medium-$CARIMBO.md"
  {
    echo
    echo "=== PRIMEIRO PARECER (medium; ESCALAR: SIM) ==="
    cat "$OUT"
    echo
    echo "=== REVISÃO HIGH ==="
    echo "Faça a investigação adicional que você mesmo apontou. Mantenha o formato obrigatório."
  } >> "$PROMPT"
  ESFORCO=high
  executar_revisor ".high"
  mv "$RASCUNHO" "$OUT"; RASCUNHO=""
fi
cp "$OUT" "$OUT_DATADO"
if [[ "$REVISOR" == claude && "$ESCALAR" == SIM ]]; then
  echo "✗ Claude pediu investigação adicional; sem repetição automática por política de custo."
  cat "$OUT"
  exit 2
fi

extrair_veredito() {
  local parecer="$1" v=""
  v=$(grep -m1 -oE 'VEREDITO: *(APROVADO|RESSALVAS|BLOQUEIO)' "$parecer" | sed 's/VEREDITO: *//' || true)
  # Claude às vezes preserva o conteúdo obrigatório mas envolve a linha em `**`.
  # Aceitamos só o mesmo token explícito, nunca uma frase solta dizendo "aprovado".
  [[ -n "$v" ]] || v=$(grep -m1 -oE '\*\*VEREDITO: *(APROVADO|RESSALVAS|BLOQUEIO)\*\*' "$parecer" | sed -E 's/^\*\*VEREDITO: *//; s/\*\*$//' || true)
  printf '%s' "$v"
}
VEREDITO=$(extrair_veredito "$OUT")
# Uma resposta sem o cabeçalho nunca é aprovada por inferência. Para não prender um
# deploy por descumprimento meramente formal, cobramos uma única retificação curta do
# MESMO revisor, sem reanalisar o código. Se ela continuar fora do contrato, o gate falha.
if [[ -z "$VEREDITO" ]]; then
  echo '⚠️ parecer sem cabeçalho formal; cobrando retificação estruturada do revisor.'
  {
    cat <<'EOF'
Sua resposta anterior abaixo não cumpriu o formato obrigatório. Isto NÃO é uma nova
revisão do código: classifique estritamente o parecer que você já emitiu. Responda
EXATAMENTE com estas três linhas e nada mais:
VEREDITO: APROVADO | RESSALVAS | BLOQUEIO
EXECUTOR: modelo=<modelo> esforço=<esforço> — <motivo curto>
ESCALAR: SIM | NAO

PARECER A CLASSIFICAR:
EOF
    cat "$OUT"
  } > "$PROMPT"
  executar_revisor ".veredito"
  mv "$RASCUNHO" "$OUT"; RASCUNHO=""
  VEREDITO=$(extrair_veredito "$OUT")
  if [[ -z "$VEREDITO" ]]; then
    echo '⚠️ retificação inválida; repetindo uma única vez a revisão original deste lote.'
    PROMPT="$PROMPT_ORIGINAL"
    {
      echo
      echo 'ATENÇÃO: a tentativa anterior não trouxe um VEREDITO legível. A sua resposta DEVE começar pelas três linhas obrigatórias; depois, se necessário, explique o achado concreto.'
    } >> "$PROMPT"
    executar_revisor ".retry"
    mv "$RASCUNHO" "$OUT"; RASCUNHO=""
    VEREDITO=$(extrair_veredito "$OUT")
  fi
fi
EXECUTOR=$(grep -m1 -E '^EXECUTOR:|^\*\*EXECUTOR:' "$OUT" || true)
echo
echo "════════ PARECER DO $(echo "$REVISOR" | tr a-z A-Z) ($MODO · faixa $FAIXA · ${TOKENS:-? tokens}) ════════"
cat "$OUT"
echo "════════ fim · salvo em $OUT_DATADO ════════"
[[ -n "$EXECUTOR" ]] && echo "🎯 $EXECUTOR"
case "$VEREDITO" in
  APROVADO)  [[ -n "$FINGERPRINT" ]] && printf '%s\n' "$FINGERPRINT" > "$RECIBO"; echo "✅ APROVADO — pode implementar/publicar."; exit 0 ;;
  RESSALVAS) echo "🔁 RESSALVAS — atenda os pontos e SUBMETA DE NOVO (o parecer vai junto na próxima)."; exit 1 ;;
  BLOQUEIO)  echo "⛔ BLOQUEIO — atenda os pontos e SUBMETA DE NOVO."; exit 2 ;;
  *) echo "✗ parecer sem VEREDITO legível — isso NÃO é aprovação."; exit 3 ;;
esac
