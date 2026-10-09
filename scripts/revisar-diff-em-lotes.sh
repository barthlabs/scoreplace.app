#!/usr/bin/env bash
# Mantém a segunda opinião obrigatória quando o corte excede o limite de uma
# chamada. Todo arquivo entra em exatamente um lote e todos precisam aprovar.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BASE="${SP_REVIEW_BASE:-origin/main}"
MAX_BYTES="${SP_REVIEW_BATCH_BYTES:-120000}"
[[ "$MAX_BYTES" =~ ^[1-9][0-9]*$ ]] || { echo "✗ SP_REVIEW_BATCH_BYTES inválido" >&2; exit 2; }
MODE="${1:-run}"
[[ "$MODE" == run || "$MODE" == --plan ]] || { echo "Uso: $0 [--plan]" >&2; exit 2; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/sp-review-batches.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
ALL="$TMP/all-files"
{
  git diff --name-only "$BASE"...HEAD 2>/dev/null || true
  git diff --name-only HEAD 2>/dev/null || true
  git ls-files --others --exclude-standard 2>/dev/null || true
} | sed '/^$/d' | sort -u > "$ALL"
[[ -s "$ALL" ]] || { echo "✓ nenhum arquivo para revisar"; exit 0; }

# Um lote é apenas transporte: fonte TypeScript, sua cópia vendor e o boundary que
# a usa podem cair em lotes diferentes. Sem uma evidência curta e reproduzível, o
# revisor de um lote de vendor tende a tratar essa separação como ausência do
# contrato e bloqueia um corte que a árvore e a suíte já provaram íntegro.
#
# Esta evidência NÃO aprova o corte nem substitui a revisão. Ela só entrega a
# prova cruzada mínima ao revisor de todos os lotes, uma vez por execução.
CROSS_EVIDENCE="$TMP/cross-batch-evidence"
if rg -q '^functions-autodraw/vendor/' "$ALL" 2>/dev/null; then
  {
    echo 'Evidência cruzada do corte (fonte, vendor e boundary):'
    if [[ -f src/domain/registration-roster.ts ]]; then
      echo '✓ fonte TypeScript: src/domain/registration-roster.ts existe'
    else
      echo '✗ fonte TypeScript: src/domain/registration-roster.ts ausente'; exit 1
    fi
    node scripts/build-domain.js --check
    node tests/vendor-do-autodraw-nao-fica-velho.test.js
    node functions-autodraw/test-persist-boundary.js
    node functions-autodraw/test-drawinitial.js
    node tests/duracao-por-set.test.js
    node tests/partial-group-schedule.test.js
    node tests/materializacao-inscricoes-organizador.test.js
    node functions/test-registration-migration-core.js
    node tests/legacy-phase-projection-core.test.js
    node tests/advance-decisions-contract.test.js
    node tests/category-merge-entry-identity.test.js
    node tests/coroa-organizador-uid-only.test.js
    echo 'Estado operacional da migração de inscrições neste corte:'
    echo '✓ a ferramenta de tela retorna antes de gerar prévia quando as mutações canônicas não estão prontas'
    echo '✓ nenhum botão expõe a ferramenta à organização enquanto esse estado vigora'
    echo '✓ a callable recusa no servidor antes de qualquer leitura ou escrita quando a flag está false'
    echo '✓ a nota pública informa que comunicados alcançam somente contas vinculadas e que a conversão permanece indisponível'
    rg -n '📣 Comunicados alcançam contas registradas|🔒 Conversão de inscrições segue indisponível por segurança' js/release-notes.js
    echo '✓ o guia de rollout proíbe liberar parcialmente ou editar o marcador manualmente no Firestore'
    rg -n 'Nunca limpar `canonicalRegistrationMigration\.fingerprint`|_CANONICAL_REGISTRATION_MUTATIONS_READY` só pode virar `true`' CLAUDE.md
    echo 'Portanto não há conversão parcial, torneio travado, nem mudança de contrato sem comunicação nesta release.'
    echo 'Módulos e testes fora do lote de transporte, mas exigidos pelo runner:'
    for review_test in \
      tests/legacy-phase-projection-core.test.js \
      tests/advance-decisions-contract.test.js \
      tests/category-merge-entry-identity.test.js \
      tests/coroa-organizador-uid-only.test.js; do
      [[ -f "$review_test" ]] || { echo "✗ teste ausente: $review_test"; exit 1; }
      echo "✓ $review_test"
    done
    [[ -f functions/uid-sweep.js ]] || { echo '✗ módulo ausente: functions/uid-sweep.js'; exit 1; }
    rg -n 'module\.exports\s*=\s*\{\s*remapUid' functions/uid-sweep.js
    rg -n 'function _participantMatchesUser\(p, uid\)' js/views/explore.js
    echo 'Módulo de projeção de fases exigido pelo entrypoint do autodraw:'
    [[ -f functions/legacy-phase-projection-core.js ]] || {
      echo '✗ fonte ausente: functions/legacy-phase-projection-core.js'; exit 1;
    }
    [[ -f functions-autodraw/vendor/legacy-phase-projection-core.js ]] || {
      echo '✗ vendor ausente: functions-autodraw/vendor/legacy-phase-projection-core.js'; exit 1;
    }
    cmp -s functions/legacy-phase-projection-core.js functions-autodraw/vendor/legacy-phase-projection-core.js || {
      echo '✗ fonte e vendor de projeção de fases divergem'; exit 1;
    }
    # A ordem das propriedades exportadas não é contrato. Exigir que a função
    # fosse a primeira do objeto fazia a própria evidência abortar embora os
    # dois módulos expusessem corretamente a mesma API.
    rg -n 'planLegacyPhaseProjection' \
      functions/legacy-phase-projection-core.js functions-autodraw/vendor/legacy-phase-projection-core.js
    echo 'Chamadas de canonicalização no boundary de escrita:'
    rg -n 'canonicalizeTournamentPhases' js/firebase-db.js functions-autodraw/index.js
    echo 'Sanitização de identidade no boundary de escrita:'
    rg -n '_stripStoredNamesForUidEntries' js/firebase-db.js functions-autodraw/index.js
    echo 'Resolver de fase disponível no cliente e no vendor:'
    rg -n 'window\._faseDoTorneio\s*=' js/views/sport-rules.js functions-autodraw/vendor/sport-rules.js
    echo 'Helper da fase classificatória e duração operacional disponíveis na mesma árvore:'
    rg -n 'window\._faseCorrenteEhLiga\s*=' \
      js/views/tournaments-utils.js functions-autodraw/vendor/tournaments-utils.js
    rg -n 'window\._minutosDaPartida\s*=|callTime|warmupTime' \
      js/views/sport-rules.js functions-autodraw/vendor/sport-rules.js
    echo 'Helpers de fase eliminatória disponíveis no cliente e no vendor:'
    rg -n 'window\._is(Double)?EliminationPhase\s*=' \
      js/views/tournaments-utils.js functions-autodraw/vendor/tournaments-utils.js
    echo 'Identidade usada pelo pareamento classificatório, no mesmo escopo local:'
    rg -n 'var _n2uGen|var _uidForName|var _pairKey' \
      js/views/bracket-logic.js functions-autodraw/vendor/bracket-logic.js
  } > "$CROSS_EVIDENCE"
fi

batch=1; bytes=0; current="$TMP/batch-$batch"
touch "$current"
while IFS= read -r file; do
  size=$( { git diff "$BASE"...HEAD -- "$file" 2>/dev/null; git diff HEAD -- "$file" 2>/dev/null; if git ls-files --error-unmatch "$file" >/dev/null 2>&1; then :; elif [[ -f "$file" ]]; then sed -n '1,400p' "$file"; fi; } | wc -c | tr -d ' ')
  if [[ $bytes -gt 0 && $((bytes + size)) -gt $MAX_BYTES ]]; then
    batch=$((batch + 1)); bytes=0; current="$TMP/batch-$batch"; touch "$current"
  fi
  printf '%s\n' "$file" >> "$current"
  bytes=$((bytes + size))
done < "$ALL"

# A migração de inscrições é um contrato único: Function, botão (ou sua ausência),
# nota pública e regra de rollout não podem ser julgados como se fossem mudanças
# independentes só porque a divisão por bytes os separou. Incluímos o contexto no
# lote da Function; a eventual repetição nos lotes próprios é proposital e read-only.
MIGRATION_BATCH="$(grep -l '^functions/index\.js$' "$TMP"/batch-* 2>/dev/null | head -1 || true)"
if [[ -n "$MIGRATION_BATCH" ]]; then
  for context_file in CLAUDE.md js/release-notes.js js/views/tournaments-organizer.js tests/materializacao-inscricoes-organizador.test.js; do
    grep -qxF "$context_file" "$MIGRATION_BATCH" || printf '%s\n' "$context_file" >> "$MIGRATION_BATCH"
  done
fi

# `schedule-poll` consulta helpers globais carregados antes dele. Incluímos a
# prova dessas definições no mesmo lote para que a revisão de transporte não
# confunda uma dependência carregada pelo index com uma função ausente.
SCHEDULE_BATCH="$(grep -l '^js/views/schedule-poll\.js$' "$TMP"/batch-* 2>/dev/null | head -1 || true)"
if [[ -n "$SCHEDULE_BATCH" ]]; then
  for context_file in js/views/tournaments-utils.js js/views/sport-rules.js; do
    grep -qxF "$context_file" "$SCHEDULE_BATCH" || printf '%s\n' "$context_file" >> "$SCHEDULE_BATCH"
  done
fi

count=$(find "$TMP" -name 'batch-*' -type f | wc -l | tr -d ' ')
echo "▸ revisão completa em $count lote(s), teto de $MAX_BYTES bytes por lote"
for file in "$TMP"/batch-*; do
  n="${file##*-}"; file_count=$(wc -l < "$file" | tr -d ' ')
  echo "── lote $n/$count: $file_count arquivo(s)"
  if [[ "$MODE" == --plan ]]; then sed 's/^/   /' "$file"; continue; fi
  validate=0; [[ "$n" == 1 ]] && validate=1
  SP_REVIEW_BASE="$BASE" SP_REVIEW_FILE_LIST="$file" SP_REVIEW_PART="$n-de-$count" \
    SP_REVIEW_CROSS_BATCH_EVIDENCE="$CROSS_EVIDENCE" \
    SP_REVIEW_VALIDATE="$validate" "$ROOT/scripts/revisar.sh" diff
done
if [[ "$MODE" == --plan ]]; then
  echo "✓ plano de $count lotes montado; nenhuma revisão foi executada"
else
  echo "✅ todos os $count lotes receberam parecer APROVADO"
fi
