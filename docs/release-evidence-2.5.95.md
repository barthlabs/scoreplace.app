# Evidência do corte 2.5.95

Em 04/nov/2026, uma consulta somente leitura aos documentos da coleção `tournaments` em produção, selecionando apenas `format`, `enrollmentMode` e `fmt2`, encontrou 18 torneios. Nenhum combinava `fmt2`, `enrollmentMode: teams` e formato Liga ou Fase de Grupos. Não foram lidos nomes de atletas, jogos ou placares, nem alterados documentos.

Mesmo sem ocorrência atual, `compileFromFmt2` preserva a inscrição em dupla já gravada nos torneios antigos desses formatos. `test-format2.js` cobre a reabertura, a recompilação no servidor e a mudança explícita para inscrição individual. `test-category-window-core.js` cobre o pulo de um sorteio automático com janela inválida já persistida e a recusa de rodada que não cabe na agenda.
