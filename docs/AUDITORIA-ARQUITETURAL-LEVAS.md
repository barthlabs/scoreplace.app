# Auditoria arquitetural — mapa de levas

> Registro operacional criado em 30/ago/2026. Ele organiza o backlog já conhecido;
> **não autoriza nenhuma implementação**. Cada leva só entra em execução após escolha
> explícita do arquiteto, com causa-raiz, invariantes, tentativas anteriores e gates
> relidos antes de editar.

## Medição de referência

- **17 levas** no mapa: 1 concluída e 16 ainda não iniciadas.
- Por contagem de levas (não por esforço): **5,9% concluído** e **94,1% restante**.
- A porcentagem não é prazo: `Vite`, Capacitor e migrações de identidade são maiores
  que uma correção de Rules, por exemplo.

| Leva | Tema do backlog | Situação em 30/ago | Gate antes de executar |
|---|---|---|---|
| L0 | jogos divididos: fonte `matches` → projeção `results` | **Concluída em produção (2.1.60).** 42 torneios / 183 jogos auditados; 7 reparos; 0 ausentes e 0 divergentes. | Conferidor read-only permanece no runner. |
| L1 | `/mail` client-writable | **Aberta, causa confirmada.** `firestore.rules` aceita write de qualquer autenticado; `js/firebase-db.js` e `js/views/auth.js` escrevem direto. | Preservar a extensão de e-mail; trocar a porta por Function e fechar Rules sem perder fluxos legítimos. |
| L2 | fila de notificações/e-mail | **Aberta.** `notif_email_queue` ainda aceita create pelo cliente. | Mapear emissores e deduplicação antes de fechar a fila. |
| L3 | `casualMatches` | **Aberta, causa confirmada.** qualquer autenticado pode escrever qualquer documento. | Definir autoridade por sessão/participante e concorrência do placar ao vivo. |
| L4 | profile/privacy + e-mail secundário | **Aberta.** Há caminhos históricos de perfil, verificação e identidade que exigem uma fonte de verdade explícita. | Inventário de campos, PII, leitores e writers; manter recuperação de conta. |
| L5 | amizade e autorização friends-only | **Preparada, bloqueada externamente.** Migração está `not_started`; dry-run leu 262 perfis. | Gate nativo (clientes mínimos) e aprovação humana formal do cutover. |
| L6 | writers excessivamente amplos de `tournaments` | **Aberta.** | Inventário dos writers e invariantes de concorrência antes de restringir qualquer um. |
| L7 | `saveTournament` / `AppStore` e caminhos paralelos | **Aberta.** | Escolher porta canônica de mutação, com testes de save atrasado e rollback. |
| L8 | representações múltiplas de match + custo Firestore | **Parcial.** `matches` é fonte e `results` é projeção para jogos divididos; modelo completo ainda não convergiu. | Medir reads/writes por tela e preservar `replay`/autorizações. |
| L9 | código morto, fallbacks e aliases | **Aberta.** | Prova de ausência de chamadores antes de remover compatibilidade. |
| L10 | ES Modules, source → dist e Vite | **Proposta futura.** Nenhuma migração iniciada. | Definir fronteiras de módulos e build reproduzível antes de introduzir bundler. |
| L11 | TypeScript progressivo + Firebase compat → modular | **Proposta futura.** | Plano incremental por fronteira, sem reescrita geral. |
| L12 | PWA, service worker e cache | **Parcial/hardening contínuo.** Gates de versão/cache existem; não é encerrado por uma release. | Teste de atualização e navegação offline em aparelho real. |
| L13 | Capacitor/nativo | **Aberta.** | Decidir política de versões mínimas/atualização e validar iOS/Android reais. |
| L14 | identidade, merges, retries e concorrência | **Aberta.** | Matriz de idempotência e provas de posse antes de alterar merge/login. |
| L15 | testes não descobertos automaticamente | **Aberta.** | Catálogo de testes e gate que falha para arquivo novo não registrado. |
| L16 | observabilidade e hardening | **Aberta.** | Métricas, alertas e runbooks definidos por risco, sem registrar PII. |

## Leitura correta do progresso

L0 resolveu uma falha concreta de consistência e reparou os dados afetados. Isso **não**
fecha, por aproximação, L6–L8 nem autoriza L10–L16. O próximo item técnico de menor
escopo e causa já comprovada é L1 (`/mail`); ainda assim, ele permanece pendente até
seleção explícita do arquiteto.
