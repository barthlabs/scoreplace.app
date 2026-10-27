# Evidência do corte web 2.5.65

Este corte publica a interface e a validação de capacidade do sorteio para torneios futuros. Não executa sorteio nem modifica documentos do Neon concluído.

## Backend direcionado

`scripts/deploy-functions.sh autodraw --only drawRound` terminou com `functions[drawRound(us-central1)] Successful update operation` e `Deploy complete!`. O recibo gerado pelo próprio script registra `drawRound` no commit `8529d4153efb94b2be91811d9321adc27b567e60`; não foi editado à mão.

Checagens locais após o deploy:

```text
$ git show 8529d4153efb94b2be91811d9321adc27b567e60:functions-autodraw/index.js | rg -c strictTeamDays
2
$ node scripts/check-backend-publicado.js
✓ rules publicado (ec2d58d5)
✓ autodraw direcionado — VERIFICADAS: drawRound
  NÃO verificadas neste corte: 104 funções do codebase
```

As quatro callables do manifesto anterior (`setTournamentEnrollmentStatus`, `resetTournamentToEnrollment`, `updateTournamentConfiguration` e `createTournament`) têm recibos de publicação no commit `56ac51fdb214651f001d09813da52c0fe63e80e9`. Comparando `functions-autodraw/index.js` desse commit com este corte, a única implementação alterada é `drawRound`; por isso o manifesto atual exige somente essa callable. As quatro continuam exportadas e seus recibos históricos permanecem no arquivo.

O gate `strictTeamDays` está dentro de `db.runTransaction`, antes de `_schAplicarGrade` e antes da persistência da chave. A exceção aborta a transação.

## Vendor e testes

`node functions-autodraw/copy-vendor.js` seguido de `git status --short` não mudou arquivos rastreados. O único arquivo não rastreado no checkout é `scripts/finish-tournament-preserving-data.js`, preservado fora do corte. `node scripts/check-vendor-fresh.js` confirmou os 26 arquivos idênticos.

`test-draw.js` passou no predeploy de `drawRound`; `test-drawinitial.js` terminou com `102 ok, 0 falharam`. Os testes do painel de dias e de contraste passaram após os últimos ajustes. A janela `17:25` existe apenas no fixture do Neon: a janela original iniciando às `18:00` não comporta os 96 jogos sob a cadência estrita; nenhum horário ou resultado do torneio real foi alterado.
