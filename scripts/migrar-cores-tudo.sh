#!/usr/bin/env bash
# PIPELINE DA TABELA DE COR — reproduz a migração inteira do zero.
#
# Roda em cima da árvore LIMPA (git checkout antes): cada passo é derivado do anterior,
# e o resultado é sempre o mesmo. É isto que permite auditar a migração — nenhum tom foi
# escolhido à mão, tudo sai de scripts/regras-de-cor-originais.css.
#
#   1. gerar-paleta      -> css/paleta.css + js/paleta-tabela.js (a tabela, por tema)
#   2. migrar-cores      -> inline styles passam a ler a tabela
#   3. podar-style-attr  -> tira as ~1.943 regras [style*=] do css/style.css
#   4. prova-cores       -> a folha com TODA declaração de cor, nos 3 temas
#   5. prova-telas       -> a cor RESOLVIDA de cada elemento das telas reais
#
# ⛔ As provas precisam da árvore ANTERIOR pra comparar:
#      rm -rf /tmp/sp-antes-full && mkdir -p /tmp/sp-antes-full
#      git archive HEAD | tar -x -C /tmp/sp-antes-full
#      ln -s "$PWD/node_modules" /tmp/sp-antes-full/node_modules
set -e
cd "$(dirname "$0")/.."
echo "▸ 1/3 tabela";        node scripts/gerar-paleta.js
echo "▸ 2/3 inline styles"; node scripts/migrar-cores.js --escrever
echo "▸ 3/3 poda do CSS";   node scripts/podar-style-attr.js
echo
echo "agora as provas:"
echo "  SP_FONTE=/tmp/sp-antes-full node scripts/prova-cores.js --antes && node scripts/prova-cores.js --depois"
echo "  node scripts/prova-telas.js /tmp/sp-antes-full /tmp/a.json && node scripts/prova-telas.js . /tmp/b.json"
echo "  node scripts/prova-telas.js --comparar /tmp/a.json /tmp/b.json"
echo "  SP_FONTE=/tmp/sp-antes-full node scripts/medir-custo-css.js && node scripts/medir-custo-css.js"
