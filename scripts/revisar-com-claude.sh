#!/usr/bin/env bash
# revisar-com-claude.sh — o CLAUDE (`claude -p`, só leitura) revisa o que o GPT/CODEX vai fazer.
# Atalho de `scripts/revisar.sh` com REVISOR=claude; toda a lógica mora lá. É o espelho de
# `revisar-com-gpt.sh` — pedido do dono (04/set/2026): "se eu disparar do GPT, Claude revisa".
#   scripts/revisar-com-claude.sh plano <plano.md> [--modelo sonnet|opus|fable] [--esforco low|medium|high|max]
#   scripts/revisar-com-claude.sh diff | faixa [arquivo...] | desligar "<motivo>" | ligar | status
REVISOR=claude exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/revisar.sh" "$@"
