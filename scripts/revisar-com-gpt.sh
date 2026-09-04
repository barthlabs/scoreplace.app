#!/usr/bin/env bash
# revisar-com-gpt.sh — o GPT (Codex CLI) revisa o que o CLAUDE vai fazer. Atalho de
# `scripts/revisar.sh` com REVISOR=gpt; toda a lógica (faixa, interruptor, parecer) mora lá.
#   scripts/revisar-com-gpt.sh plano <plano.md> [--modelo M] [--esforco E]
#   scripts/revisar-com-gpt.sh diff | faixa [arquivo...] | desligar "<motivo>" | ligar | status
REVISOR=gpt exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/revisar.sh" "$@"
