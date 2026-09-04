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
#          do Codex (CODEX_*) revisa o Claude; sem pista, os DOIS revisam e os dois têm que aprovar.
#
# DUAS PORTAS:
#   plano  — ANTES de editar: quem vai implementar escreve o que muda e o revisor confere contra
#            o código REAL (leitura da árvore, nunca escrita). Só APROVADO libera; na resubmissão
#            o parecer anterior vai junto pra ele conferir o que foi atendido.
#   diff   — ANTES de publicar: revisa origin/main..HEAD + o que não foi commitado. O
#            deploy-hosting.sh chama este modo (passo 1.8) com REVISOR=auto.
#
# A FAIXA é o PISO do esforço — regra sobre os arquivos tocados, não opinião de modelo:
#   trivial  — só CSS/texto/notas/ícones, ou (SÓ no diff) só o bump em store.js → SEM revisão.
#   normal   — telas, componentes, fluxo de UI → GPT `revisao-normal` (medium) · Claude sonnet/medium.
#   critica  — functions*/, rules, firebase.json, sw.js, store.js, router, main, DB, chave/sorteio/
#              placar/inscrição/perfil/auth/W.O./fases, scripts de deploy e check, extensions/,
#              arquivo NOVO nesses lugares, ou diff > 300 linhas (não rastreados contam)
#              → GPT `revisao-critica` (high) · Claude opus/high.
#   --modelo/--esforco = indicação de quem dispara; nunca fica abaixo do piso.
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
CLAUDE="${CLAUDE_BIN:-claude}"
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
  elif env | grep -qE '^CODEX_(HOME|SANDBOX|CLI_PATH|THREAD)'; then echo codex   # CODEX_BIN é nosso, não conta
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
arquivos_do_diff() {
  {
    git diff --name-only origin/main...HEAD 2>/dev/null || true
    git diff --name-only HEAD 2>/dev/null || true
    git ls-files --others --exclude-standard 2>/dev/null || true
  } | sed '/^$/d' | sort -u
}
# plano: todo caminho citado — EXISTINDO OU NÃO (arquivo novo em functions/ é crítico antes de nascer)
arquivos_do_plano() {
  grep -oE '[A-Za-z0-9_][A-Za-z0-9_./-]*\.(js|mjs|rules|json|html|css|sh|toml|md)' "$1" \
    | sed 's#^\./##' | sort -u || true
}
# store.js é CRÍTICO, mas o bump de versão sozinho é TRIVIAL — SÓ no diff há como saber
so_bump_de_versao() {
  local n
  n=$( { git diff origin/main...HEAD -- js/store.js; git diff HEAD -- js/store.js; } 2>/dev/null \
       | grep -E '^[-+]' | grep -vE '^(\+\+\+|---)' | grep -vc 'SCOREPLACE_VERSION' || true )
  [[ "${n:-0}" -eq 0 ]]
}
linhas_do_diff() { # inclui não rastreados: eles vão pro revisor, então contam no teto
  local n1 n2
  n1=$( { git diff --numstat origin/main...HEAD 2>/dev/null; git diff --numstat HEAD 2>/dev/null; } \
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
      js/release-notes.js|js/i18n-*.js|js/hints.js|js/coachmarks.js|js/trophy-catalog.js|js/notification-catalog.js|\
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
    arquivos_do_diff > "$LISTA" ;;
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

# ── motor: quem dispara indica; a faixa é o piso ─────────────────────────────────────
PISO=medium; [[ "$FAIXA" == "critica" ]] && PISO=high
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
  command -v "$CLAUDE" >/dev/null 2>&1 || { echo "✗ Claude Code CLI não encontrado ('$CLAUDE'; exporte CLAUDE_BIN)"; exit 4; }
  [[ "$ESFORCO" == xhigh ]] && ESFORCO=max
  [[ -n "$MODELO" ]]  || { MODELO=sonnet; [[ "$FAIXA" == critica ]] && MODELO=opus; }
  [[ -n "$ESFORCO" ]] || ESFORCO="$PISO"
  EXECUTOR_DICA='modelo=<gpt-5.6-terra|outro> esforco=<low|medium|high|xhigh>  (é o GPT/Codex que vai executar: low pra mudança mecânica e local; high pra lógica com concorrência, dados de usuário, torneio dividido; xhigh só quando errar custa dado de produção)'
  QUEM_EXECUTA="o GPT (Codex)"
fi

# ── o pedido ao revisor ──────────────────────────────────────────────────────────────
PROMPT="$(mktemp "${TMPDIR:-/tmp}/sp-revisao-prompt.XXXXXX")"
if [[ "$MODO" == "plano" ]]; then
  SLUG=$(basename "$PLANO" .md | sed 's/^plano-//'); OUT="$OUTDIR/parecer-$REVISOR-plano-$SLUG.md"
else
  OUT="$OUTDIR/parecer-$REVISOR-diff.md"
fi
ANTERIOR=""; [[ -s "$OUT" ]] && ANTERIOR="$(cat "$OUT")"
{
  cat <<EOF
Você é o REVISOR de segunda opinião deste repositório (scoreplace.app — SPA em vanilla JS +
Firebase). Outro agente ($QUEM_EXECUTA) vai implementar; seu trabalho é achar o que ele NÃO viu,
e NADA é implementado sem o seu APROVADO. Você tem leitura da árvore inteira: CONFIRA CONTRA O
CÓDIGO REAL, não contra o que o texto afirma. Nunca edite nada. As regras da casa estão em
CLAUDE.md (AGENTS.md é a mesma coisa). Responda em português do Brasil.

FORMATO OBRIGATÓRIO — as DUAS primeiras linhas, exatamente assim:
VEREDITO: APROVADO | RESSALVAS | BLOQUEIO      (escolha UMA)
EXECUTOR: $EXECUTOR_DICA — <por quê, 1 linha>
(APROVADO = pode implementar como está; RESSALVAS = só depois de atender o que você lista —
o texto volta pra você; BLOQUEIO = vai quebrar produção, perder dado, violar regra do
CLAUDE.md, ou o diagnóstico está errado. Se é resubmissão, diga na linha EXECUTOR se os pontos
anteriores foram atendidos.)

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
    echo "$ANTERIOR"; echo
  fi
  if [[ "$MODO" == "plano" ]]; then
    echo "=== PLANO A REVISAR (arquivo: $PLANO) ==="; cat "$PLANO"
  else
    echo "=== DIFF A REVISAR (origin/main..HEAD + alterações não commitadas) ==="
    echo "--- commits à frente de origin/main:"; git log --oneline origin/main..HEAD 2>/dev/null || true
    echo "--- diff:"; git diff origin/main...HEAD 2>/dev/null || true; git diff HEAD 2>/dev/null || true
    git ls-files --others --exclude-standard -z 2>/dev/null | while IFS= read -r -d '' f; do
      echo "--- arquivo NOVO não rastreado: $f"; sed -n '1,400p' "$f"
    done
  fi
} > "$PROMPT"

CARIMBO="$(date +%Y%m%d-%H%M%S)"
OUT_DATADO="${OUT%.md}-$CARIMBO.md"
LOG="${OUT%.md}.log"
RASCUNHO="$(mktemp "${TMPDIR:-/tmp}/sp-revisao-out.XXXXXX")"

echo "  revisor: $REVISOR${MODELO:+ · modelo $MODELO}${ESFORCO:+ · esforço $ESFORCO}${ANTERIOR:+ · RESUBMISSÃO} · prompt: $(wc -c < "$PROMPT" | tr -d ' ') bytes · aguarde (minutos)…"
set +e
TOKENS=""
if [[ "$REVISOR" == gpt ]]; then
  EXTRA=(); [[ -n "$MODELO" ]] && EXTRA+=(-m "$MODELO"); [[ -n "$ESFORCO" ]] && EXTRA+=(-c "model_reasoning_effort=\"$ESFORCO\"")
  "$CODEX" exec -p "revisao-$FAIXA" "${EXTRA[@]}" --sandbox read-only -C "$RAIZ" --skip-git-repo-check \
    --ephemeral -o "$RASCUNHO" - < "$PROMPT" > "$LOG" 2>&1
  RC=$?
  TOKENS=$(grep -A1 -m1 'tokens used' "$LOG" | tail -1 | tr -d ' ' || true)
else
  # `claude -p` de dentro de uma sessão do Claude Code exige tirar CLAUDECODE do ambiente.
  # Só leitura: Edit/Write/NotebookEdit/Bash proibidos — o diff já vai no prompt.
  # `--disallowed-tools` e `--disallowedTools` são a MESMA flag (as duas constam no `claude
  # --help` 2.1.84); fica a kebab-case, que é a documentada. stderr vai SEPARADO: o parser
  # abaixo procura o 1º `{` do stdout, e um aviso no stderr com `{` viraria "sem parecer".
  # (os dois pontos vieram do parecer do próprio Claude revisor, 04/set/2026)
  env -u CLAUDECODE "$CLAUDE" -p --model "$MODELO" --effort "$ESFORCO" \
    --disallowed-tools Edit Write NotebookEdit Bash --output-format json \
    < "$PROMPT" > "$LOG" 2> "${LOG%.log}.stderr"
  RC=$?
  node -e '
    const fs=require("fs"); const raw=fs.readFileSync(process.argv[1],"utf8");
    let j=null; try { j=JSON.parse(raw.slice(raw.indexOf("{"))); } catch(e){}
    if (!j || j.is_error || typeof j.result!=="string") process.exit(1);
    fs.writeFileSync(process.argv[2], j.result.replace(/\s+$/,"")+"\n");
    const u=j.usage||{}; const t=(u.input_tokens||0)+(u.cache_creation_input_tokens||0)+(u.cache_read_input_tokens||0)+(u.output_tokens||0);
    console.log(t+" tokens · US$ "+(j.total_cost_usd||0).toFixed(2));
  ' "$LOG" "$RASCUNHO" > "$RASCUNHO.meta" 2>/dev/null || RC=1
  TOKENS=$(cat "$RASCUNHO.meta" 2>/dev/null || true); rm -f "$RASCUNHO.meta"
fi
set -e
if cat "$LOG" "${LOG%.log}.stderr" 2>/dev/null | grep -qiE "usage limit|rate limit|insufficient.?(quota|credits)|out of (credits|extra usage)|limit reached"; then
  echo "✗ COTA DO REVISOR ($REVISOR) ESGOTADA — não respondeu. Isto NÃO é aprovação."
  grep -m1 -iE "usage limit|rate limit|try again|limit reached" "$LOG" | cut -c1-200
  echo "   pra não travar: scripts/revisar-com-$REVISOR.sh desligar \"<motivo>\""
  exit 4
fi
if [[ $RC -ne 0 || ! -s "$RASCUNHO" ]]; then
  echo "✗ o revisor ($REVISOR) não devolveu parecer (exit $RC). Log: $LOG"
  tail -20 "$LOG" | cut -c1-300; [[ -s "${LOG%.log}.stderr" ]] && tail -5 "${LOG%.log}.stderr" | cut -c1-300; exit 3
fi
mv "$RASCUNHO" "$OUT"; RASCUNHO=""
cp "$OUT" "$OUT_DATADO"

VEREDITO=$(grep -m1 -oE 'VEREDITO: *(APROVADO|RESSALVAS|BLOQUEIO)' "$OUT" | sed 's/VEREDITO: *//' || true)
EXECUTOR=$(grep -m1 -E '^EXECUTOR:' "$OUT" || true)
echo
echo "════════ PARECER DO $(echo "$REVISOR" | tr a-z A-Z) ($MODO · faixa $FAIXA · ${TOKENS:-? tokens}) ════════"
cat "$OUT"
echo "════════ fim · salvo em $OUT_DATADO ════════"
[[ -n "$EXECUTOR" ]] && echo "🎯 $EXECUTOR"
case "$VEREDITO" in
  APROVADO)  echo "✅ APROVADO — pode implementar/publicar."; exit 0 ;;
  RESSALVAS) echo "🔁 RESSALVAS — atenda os pontos e SUBMETA DE NOVO (o parecer vai junto na próxima)."; exit 1 ;;
  BLOQUEIO)  echo "⛔ BLOQUEIO — atenda os pontos e SUBMETA DE NOVO."; exit 2 ;;
  *) echo "✗ parecer sem VEREDITO legível — isso NÃO é aprovação."; exit 3 ;;
esac
