#!/usr/bin/env bash
# revisar-com-gpt.sh — SEGUNDA OPINIÃO do GPT (Codex CLI) sobre um PLANO ou sobre o DIFF.
#
# POR QUE EXISTE (04/set/2026, ordem do dono): "quero que o GPT sempre revise o que o Claude
# vai implementar, pra sermos mais assertivos" e "não executar o plano de cada ajuste sem
# aprovação do GPT: se ele indicar ajustes, submete de novo até ele aprovar, e daí sim edita".
# Duas portas:
#   plano  — ANTES de editar: o Claude escreve o que vai mudar e o GPT confere contra o
#            código REAL (o revisor tem leitura da árvore, nunca escrita). Só APROVADO libera.
#            Na resubmissão o parecer anterior vai junto, pra ele conferir o que foi atendido.
#   diff   — ANTES de publicar: o GPT revisa o que está à frente de origin/main mais o que
#            ainda não foi commitado. O deploy-hosting.sh chama este modo (passo 1.8).
#
# QUEM ESCOLHE O MOTOR (ordem do dono): o Claude INDICA modelo e esforço do GPT conforme a
# necessidade (--modelo/--esforco); o GPT, no parecer, INDICA modelo e esforço do Claude pra
# executar (linha EXECUTOR:). A FAIXA é o PISO — uma regra sobre os arquivos tocados, não
# opinião de modelo — e o esforço indicado nunca fica abaixo dela:
#   trivial  — só CSS/texto/notas/ícones, ou (SÓ no modo diff) só o bump em store.js → SEM revisão.
#   normal   — telas, componentes, fluxo de UI → perfil `revisao-normal` (piso medium).
#   critica  — Cloud Functions, rules, motor de chave/placar, dados de usuário, router,
#              service worker, scripts de deploy, arquivo NOVO nesses lugares, ou diff > 300
#              linhas (contando não rastreados) → `revisao-critica` (piso high).
#   Os perfis vivem em ~/.codex/revisao-*.config.toml.
#
# SAÍDA: parecer em .claude/tmp/parecer-gpt-<modo>[-<plano>].md (último) + cópia datada.
# 1ª linha: `VEREDITO: APROVADO | RESSALVAS | BLOQUEIO`; 2ª: `EXECUTOR: modelo=… esforco=…`.
#   exit 0 → APROVADO (único que libera)
#   exit 1 → RESSALVAS (ajuste o plano/diff e SUBMETA DE NOVO)
#   exit 2 → BLOQUEIO (idem, e o diagnóstico está em xeque)
#   exit 3 → parecer sem veredito legível (NÃO é aprovação — "abort é o aviso")
#   exit 4 → cota do ChatGPT esgotada / Codex indisponível (NÃO é aprovação)
#
# Uso:
#   scripts/revisar-com-gpt.sh faixa [arquivo...]                # só classifica
#   scripts/revisar-com-gpt.sh plano <plano.md> [--modelo M] [--esforco E]
#   scripts/revisar-com-gpt.sh diff              [--modelo M] [--esforco E]
# Escapes: SP_GPT_FAIXA=normal|critica só ELEVA a faixa (nunca abaixa; outro valor aborta).
#   SP_SEM_GPT=1 só no modo diff e só se algum commit a publicar carregar `sem-gpt:` + motivo.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"
CODEX="${CODEX_BIN:-/Applications/ChatGPT.app/Contents/Resources/codex}"
MODO="${1:-}"
[[ $# -gt 0 ]] && shift
OUTDIR="$RAIZ/.claude/tmp"
mkdir -p "$OUTDIR"

uso() { sed -n '2,38p' "${BASH_SOURCE[0]}"; exit 1; }
[[ "$MODO" =~ ^(faixa|plano|diff)$ ]] || uso

# ── argumentos ───────────────────────────────────────────────────────────────────────
MODELO=""; ESFORCO=""; PLANO=""; ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --modelo)  MODELO="${2:-}"; shift 2 ;;
    --esforco) ESFORCO="${2:-}"; shift 2 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
if [[ -n "$ESFORCO" && ! "$ESFORCO" =~ ^(low|medium|high|xhigh)$ ]]; then
  echo "✗ --esforco tem que ser low|medium|high|xhigh (veio '$ESFORCO')"; exit 1
fi
if [[ -n "${SP_GPT_FAIXA:-}" && ! "${SP_GPT_FAIXA}" =~ ^(normal|critica)$ ]]; then
  echo "✗ SP_GPT_FAIXA só aceita normal|critica — nunca trivial (veio '${SP_GPT_FAIXA}')"; exit 1
fi

# ── arquivos tocados ─────────────────────────────────────────────────────────────────
# diff: commits à frente de origin/main + modificados + não rastreados (o que vai subir).
arquivos_do_diff() {
  {
    git diff --name-only origin/main...HEAD 2>/dev/null || true
    git diff --name-only HEAD 2>/dev/null || true
    git ls-files --others --exclude-standard 2>/dev/null || true
  } | sed '/^$/d' | sort -u
}
# plano: todo caminho citado no texto — EXISTINDO OU NÃO. Arquivo novo em `functions/`
# é crítico antes de nascer; descartar o que ainda não existe rebaixava a faixa.
arquivos_do_plano() {
  grep -oE '[A-Za-z0-9_][A-Za-z0-9_./-]*\.(js|mjs|rules|json|html|css|sh|toml|md)' "$1" \
    | sed 's#^\./##' | sort -u || true
}
# store.js entra como CRÍTICO — mas o bump de versão sozinho é TRIVIAL. Se toda linha
# alterada nele for a de SCOREPLACE_VERSION, o arquivo sai da conta. SÓ no modo diff:
# num plano ou numa lista à mão não há diff pra consultar.
so_bump_de_versao() {
  local n
  n=$( { git diff origin/main...HEAD -- js/store.js; git diff HEAD -- js/store.js; } 2>/dev/null \
       | grep -E '^[-+]' | grep -vE '^(\+\+\+|---)' | grep -vc 'SCOREPLACE_VERSION' || true )
  [[ "${n:-0}" -eq 0 ]]
}
# linhas do diff INCLUINDO os não rastreados (eles vão pro revisor, então contam no teto).
linhas_do_diff() {
  local n1 n2
  n1=$( { git diff --numstat origin/main...HEAD 2>/dev/null; git diff --numstat HEAD 2>/dev/null; } \
        | awk '{a+=$1; d+=$2} END {print a+d+0}' )
  n2=$( git ls-files --others --exclude-standard -z 2>/dev/null \
        | xargs -0 cat 2>/dev/null | wc -l | tr -d ' ' )
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
      scripts/deploy-*|scripts/hooks/*|scripts/check-*|scripts/revisar-com-gpt.sh|extensions/*)
        crit=1 ;;
      *.css|*.md|*.txt|*.png|*.jpg|*.jpeg|*.svg|*.webp|*.ico|*.pdf|docs/*|icons/*|\
      js/release-notes.js|js/i18n-*.js|js/hints.js|js/coachmarks.js|js/trophy-catalog.js|js/notification-catalog.js|\
      index.html|version.txt|README*)
        ;;
      *) nontriv=1 ;;
    esac
  done
  if [[ $crit -eq 1 ]]; then echo critica; elif [[ $nontriv -eq 1 ]]; then echo normal; else echo trivial; fi
}
nivel() { case "$1" in trivial) echo 0;; normal) echo 1;; critica) echo 2;; esac; }
faixa_para() { # $1 = arquivo com a lista; imprime a faixa com teto de linhas e override (só eleva)
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

# ORIGEM da lista: diff (há git pra consultar), lista (à mão) ou plano (texto).
ORIGEM="$MODO"
LISTA="$(mktemp "${TMPDIR:-/tmp}/sp-revisao-lista.XXXXXX")"
PROMPT=""
trap 'rm -f "$LISTA" "$PROMPT"' EXIT

case "$MODO" in
  faixa)
    # com lista à mão não há diff pra consultar: a exceção do bump e o teto não se aplicam
    if [[ ${#ARGS[@]} -gt 0 ]]; then printf '%s\n' "${ARGS[@]}" > "$LISTA"; ORIGEM=lista; else arquivos_do_diff > "$LISTA"; ORIGEM=diff; fi
    FAIXA=$(faixa_para "$LISTA")
    echo "faixa: $FAIXA"
    sed 's/^/  /' "$LISTA"
    exit 0 ;;
  plano)
    PLANO="${ARGS[0]:-}"; [[ -f "$PLANO" ]] || { echo "✗ plano não encontrado: '$PLANO'"; uso; }
    arquivos_do_plano "$PLANO" > "$LISTA" ;;
  diff)
    arquivos_do_diff > "$LISTA" ;;
esac

FAIXA=$(faixa_para "$LISTA")
echo "▸ revisão do GPT ($MODO) — faixa: $FAIXA"
sed 's/^/    /' "$LISTA"

if [[ "${SP_SEM_GPT:-0}" == "1" ]]; then
  if [[ "$MODO" != "diff" ]]; then
    echo "✗ SP_SEM_GPT não vale pra PLANO: plano só segue com APROVADO do GPT (ordem do dono)."; exit 1
  fi
  MOTIVO=$(git log --format=%B origin/main..HEAD 2>/dev/null | grep -m1 -iE 'sem-gpt: *\S' || true)
  if [[ -z "$MOTIVO" ]]; then
    echo "✗ SP_SEM_GPT=1 exige o motivo NUM COMMIT a publicar: uma linha 'sem-gpt: <por quê>'. Não achei."
    exit 1
  fi
  echo "  ⚠️ revisão do GPT PULADA por ordem explícita — $MOTIVO"
  exit 0
fi
if [[ "$FAIXA" == "trivial" ]]; then
  echo "  ✓ faixa trivial — sem revisão do GPT (CSS/texto/notas/bump). Force com SP_GPT_FAIXA=normal."
  exit 0
fi
[[ -x "$CODEX" ]] || { echo "✗ Codex CLI não encontrado em $CODEX (instale o app ChatGPT ou exporte CODEX_BIN)"; exit 4; }

# ── motor: o Claude indica; a faixa é o piso ─────────────────────────────────────────
PISO=medium; [[ "$FAIXA" == "critica" ]] && PISO=high
nivel_esf() { case "$1" in low) echo 0;; medium) echo 1;; high) echo 2;; xhigh) echo 3;; esac; }
if [[ -n "$ESFORCO" ]] && [[ $(nivel_esf "$ESFORCO") -lt $(nivel_esf "$PISO") ]]; then
  echo "  ⚠️ --esforco $ESFORCO fica ABAIXO do piso da faixa ($PISO); vai $PISO."
  ESFORCO="$PISO"
fi
EXTRA=()
[[ -n "$MODELO" ]]  && EXTRA+=(-m "$MODELO")
[[ -n "$ESFORCO" ]] && EXTRA+=(-c "model_reasoning_effort=\"$ESFORCO\"")

# ── o pedido ao revisor ──────────────────────────────────────────────────────────────
PROMPT="$(mktemp "${TMPDIR:-/tmp}/sp-revisao-prompt.XXXXXX")"
if [[ "$MODO" == "plano" ]]; then
  SLUG=$(basename "$PLANO" .md | sed 's/^plano-//')
  OUT="$OUTDIR/parecer-gpt-plano-$SLUG.md"
else
  OUT="$OUTDIR/parecer-gpt-diff.md"
fi
ANTERIOR=""
[[ -s "$OUT" ]] && ANTERIOR="$(cat "$OUT")"
{
  cat <<'EOF'
Você é o REVISOR de segunda opinião deste repositório (scoreplace.app — SPA em vanilla JS +
Firebase). Outro agente (o Claude) vai implementar; seu trabalho é achar o que ele NÃO viu, e
NADA é implementado sem o seu APROVADO. Você tem leitura da árvore inteira: CONFIRA CONTRA O
CÓDIGO REAL, não contra o que o texto afirma. As regras da casa estão em CLAUDE.md
(AGENTS.md é cópia). Responda em português do Brasil.

FORMATO OBRIGATÓRIO — as DUAS primeiras linhas, exatamente assim:
VEREDITO: APROVADO | RESSALVAS | BLOQUEIO      (escolha UMA)
EXECUTOR: modelo=<sonnet|opus|fable> esforco=<low|medium|high|xhigh|max> — <por quê, 1 linha>
(APROVADO = pode implementar como está; RESSALVAS = só depois de atender o que você lista —
o texto volta pra você; BLOQUEIO = vai quebrar produção, perder dado, violar regra do
CLAUDE.md, ou o diagnóstico está errado. Na linha EXECUTOR você indica o modelo e o esforço
do Claude pra EXECUTAR este plano/diff: sonnet/low pra mudança mecânica e local; opus/high pra
lógica com concorrência, dados de usuário, torneio dividido; fable/xhigh só quando errar custa
dado de produção. Se é resubmissão, diga na linha EXECUTOR se os pontos anteriores foram atendidos.)

Depois, só o que for concreto, sempre com arquivo:linha:
1. O QUE QUEBRA — regressão, caso não coberto, concorrência, dado que some.
2. O QUE JÁ EXISTE — função/padrão/porta que o texto reinventa em vez de reusar.
3. O QUE FALTA — dado, teste, caminho (offline, torneio dividido, versão velha da loja).
4. AJUSTE SUGERIDO — a versão corrigida do plano/diff, curta.
Sem elogios, sem resumo do que leu, sem repetir o texto. Se algo é opinião, marque como tal.
EOF
  echo
  if [[ -n "$ANTERIOR" ]]; then
    echo "=== SEU PARECER ANTERIOR sobre este mesmo $MODO (é RESUBMISSÃO: confira ponto a ponto o que foi atendido) ==="
    echo "$ANTERIOR"
    echo
  fi
  if [[ "$MODO" == "plano" ]]; then
    echo "=== PLANO A REVISAR (arquivo: $PLANO) ==="
    cat "$PLANO"
  else
    echo "=== DIFF A REVISAR (origin/main..HEAD + alterações não commitadas) ==="
    echo "--- commits à frente de origin/main:"
    git log --oneline origin/main..HEAD 2>/dev/null || true
    echo "--- diff:"
    git diff origin/main...HEAD 2>/dev/null || true
    git diff HEAD 2>/dev/null || true
    git ls-files --others --exclude-standard -z 2>/dev/null | while IFS= read -r -d '' f; do
      echo "--- arquivo NOVO não rastreado: $f"; sed -n '1,400p' "$f"
    done
  fi
} > "$PROMPT"

CARIMBO="$(date +%Y%m%d-%H%M%S)"
OUT_DATADO="${OUT%.md}-$CARIMBO.md"
LOG="${OUT%.md}.log"
RASCUNHO="$(mktemp "${TMPDIR:-/tmp}/sp-revisao-out.XXXXXX")"

echo "  perfil: revisao-$FAIXA${MODELO:+ · modelo $MODELO}${ESFORCO:+ · esforço $ESFORCO}${ANTERIOR:+ · RESUBMISSÃO} · prompt: $(wc -c < "$PROMPT" | tr -d ' ') bytes · aguarde (minutos)…"
set +e
"$CODEX" exec -p "revisao-$FAIXA" "${EXTRA[@]}" --sandbox read-only -C "$RAIZ" --skip-git-repo-check \
  --ephemeral -o "$RASCUNHO" - < "$PROMPT" > "$LOG" 2>&1
RC=$?
set -e
if grep -qiE "usage limit|rate limit|insufficient.?(quota|credits)" "$LOG"; then
  echo "✗ COTA DO CHATGPT ESGOTADA — o revisor não respondeu. Isto NÃO é aprovação."
  grep -m1 -iE "usage limit|rate limit|try again" "$LOG" | cut -c1-200
  rm -f "$RASCUNHO"; exit 4
fi
if [[ $RC -ne 0 || ! -s "$RASCUNHO" ]]; then
  echo "✗ o Codex não devolveu parecer (exit $RC). Log: $LOG"
  tail -20 "$LOG"; rm -f "$RASCUNHO"; exit 3
fi
mv "$RASCUNHO" "$OUT"
cp "$OUT" "$OUT_DATADO"

VEREDITO=$(grep -m1 -oE 'VEREDITO: *(APROVADO|RESSALVAS|BLOQUEIO)' "$OUT" | sed 's/VEREDITO: *//' || true)
EXECUTOR=$(grep -m1 -E '^EXECUTOR:' "$OUT" || true)
TOKENS=$(grep -A1 -m1 'tokens used' "$LOG" | tail -1 | tr -d ' ' || true)
echo
echo "════════ PARECER DO GPT ($MODO · faixa $FAIXA · ${TOKENS:-?} tokens) ════════"
cat "$OUT"
echo "════════ fim · salvo em $OUT_DATADO ════════"
[[ -n "$EXECUTOR" ]] && echo "🎯 $EXECUTOR"
case "$VEREDITO" in
  APROVADO)  echo "✅ APROVADO — pode implementar/publicar."; exit 0 ;;
  RESSALVAS) echo "🔁 RESSALVAS — atenda os pontos e SUBMETA DE NOVO (o parecer vai junto na próxima)."; exit 1 ;;
  BLOQUEIO)  echo "⛔ BLOQUEIO — atenda os pontos e SUBMETA DE NOVO."; exit 2 ;;
  *) echo "✗ parecer sem VEREDITO legível — isso NÃO é aprovação."; exit 3 ;;
esac
