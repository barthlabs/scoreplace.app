# Ponte relógio ↔ celular (fase 4) — contrato

> ⚠️ **DECISÃO (14/ago/2026, dono): MIGRAÇÃO PRO CAMINHO B.** O incidente de
> 13/ago (torneio ao vivo: pontos enfileirados chegando em rajada 0-40, confirmar
> do 2º sacador sem efeito, relógio preso na tela de fim de set) provou o limite
> estrutural da Opção A: **o motor vive em JS na WebView, e iOS/Android suspendem
> o JS com o celular bloqueado** — exatamente o estado do celular na beira da
> quadra. Nenhum retry conserta "JS suspenso não processa ponto".
> O desenho novo está na seção **"Caminho B"** no fim deste arquivo. A Opção A
> descrita abaixo CONTINUA VALENDO como fallback/espelho (celular com o placar
> aberto segue podendo alimentar o relógio), e o contrato de snapshot abaixo é
> EXATAMENTE o que o motor nativo do relógio passa a emitir — é isso que preserva
> as telas sem tocar em nada.

Arquitetura **Opção A** (ver `project_native_app_roadmap`): o relógio é **burro**.
Só mostra o estado que recebe e dispara **intenções** (+1 / desfazer). TODA a
regra de placar (GSM: game/set/tiebreak, rotação de saque, virada de lado) fica
no **motor JS do celular** — fonte única de verdade. Nunca duplicar lógica em
Swift/Kotlin (evita a divergência tipo `project_autodraw_server_parity`).

```
Relógio  --intent-->  transporte nativo  -->  plugin Capacitor  -->  motor GSM (JS)
Relógio  <--state---  transporte nativo  <--  plugin Capacitor  <--  motor GSM (JS)
```
Transporte: iOS = WatchConnectivity (`WCSession`); Android = Wear Data Layer
(`MessageClient`). O payload é JSON e é **idêntico** nas duas plataformas.

## Princípios

- **Tudo indexado por TIME (1/2), nunca por lado.** O relógio mapeia time→lado
  usando `courtLeft` (+ a preferência de travar lados), exatamente como o
  `bracket-ui.js`. **Cor segue o time**: time 1 = azul, time 2 = vermelho.
- **Strings de exibição vêm do motor**, não do relógio. O ponto ("15/30/40/Ad",
  deuce, número no tie-break) é formatado pelo MESMO código do overlay ao vivo,
  então o relógio nunca recalcula regra — só desenha a string recebida.
- **`seq` monotônico POR ÉPOCA** no estado (1.8.64): `epoch` identifica a carga
  da WebView (o seq zera a cada recarga). Época diferente = contador recomeçou →
  aceita e zera o `lastSeq`; mesma época = monotônico (descarta reordenação).
  A heurística antiga ("queda ≥ 20 = reinício") congelou o relógio no incidente
  de 13/ago (lastSeq pequeno ⇒ queda < 20 ⇒ carga nova 100% descartada) e
  sobrevive SÓ como fallback pra snapshot sem época.
- **`id` na intenção**: o celular deduplica intenção repetida (protege
  double-tap / reenvio do transporte).

## Relógio → Celular (intenções)

```jsonc
{ "v": 1, "type": "point", "team": 1, "id": "<uuid>" }  // +1 ao time 1 (ou 2)
{ "v": 1, "type": "undo",  "id": "<uuid>" }             // desfaz o último ponto
{ "v": 1, "type": "close", "id": "<uuid>" }             // ENCERRAR: fecha o placar no celular
{ "v": 1, "type": "hello" }                             // pede o estado atual (abrir/reconectar)
```

⚠️ **`close` (v1.7.67)** — o "Fechar" da tela de fim de partida. Ele existe porque
antes o botão só mexia em estado LOCAL do relógio (`replayDismissed`, nos DOIS
sistemas): o celular seguia com o placar aberto e o relógio ficava preso na tela de
resultado. **Não abre diálogo no celular** — o toque no relógio já é a confirmação, e
esperar alguém confirmar do outro lado seria o mesmo travamento. O que ele NÃO pula é o
consenso de encerramento do casual multiplayer: ali quem decide são os outros jogadores.
Quem devolve o relógio à espera é o estado inativo que o fechamento empurra logo depois.

A lista viva das intenções aceitas está no `switch` de `applyIntent` em
`js/watch-bridge.js` — hoje: `point`, `undo`, `close`, `replay`, `resolveTie`, `start`,
`rrNext`, `rrFinal`, `rrActivate`, `setServer`, `hello`.

## Celular → Relógio (snapshot de estado)

Enviado após CADA mudança (inclusive quando quem pontua é o usuário no celular)
e em resposta a `hello`.

```jsonc
{
  "v": 1,
  "type": "state",
  "seq": 42,
  "matchId": "<tId>:<matchId>",
  "active": true,
  "setLabel": "Set 1",
  "games":  [1, 2],          // [time1, time2]
  "points": ["40", "30"],    // strings de exibição, [time1, time2]
  "sets":   [0, 0],
  "isTiebreak": false,
  "courtLeft": 1,            // qual time está à esquerda (espelha _courtLeft/fixSides)
  "server": { "team": 1, "name": "Rodrigo" },
  "teams": {
    "1": { "players": ["Rodrigo", "Nelson"] },
    "2": { "players": ["Kelly", "Zilda"] }
  },
  "isFinished": false,
  "winner": null             // 1 | 2 | null
}
```

## Superfície JS (`js/watch-bridge.js` — a criar)

Gated por `window.SCOREPLACE_PLATFORM` / `Capacitor.isNativePlatform()` →
**no-op na web** (não interfere no placar ao vivo do navegador).

- `WatchBridge.applyIntent(intent)` → dirige o motor (aplica +1 / desfaz),
  retorna o novo snapshot.
- `WatchBridge.currentState()` → snapshot atual.
- `WatchBridge.onState(cb)` → assina; o overlay ao vivo chama o emit após cada
  ponto pra o relógio atualizar mesmo quando quem marca é o celular.

## Plugin Capacitor (`ScoreplaceWatch` — a criar, Swift + Java)

- JS→nativo: `ScoreplaceWatch.sendState(snapshot)` → empurra pro relógio.
- nativo→JS: emite evento Capacitor `watchIntent` com a intenção; o JS escuta,
  chama `applyIntent`, depois `sendState`.

## Status

- ✅ Telas (mock) rodando nos simuladores — commit `d4e3da8b`.
- ✅ Ponte JS (fonte única) + plugin/wear do Android — commits `5399…`, `de97…`, `357a…`.
- ✅ **iOS completo** — plugin `ScoreplaceWatch` (Swift, `WCSession`) + target
  watchOS companion dentro de `ios/App/App.xcodeproj` (companion do app iOS,
  `WKCompanionAppBundleIdentifier = app.scoreplace`). Views/model (`RemoteView`,
  `ScoreState`) são fonte única compartilhada com o preview em
  `ios/WatchApp/Sources`. Verificado no simulador (iPhone 17 Pro + Apple Watch
  Series 11, pareados): hello, +1 time 1/2 (mapeado por `courtLeft`), Desfazer,
  `seq` monotônico e bola no sacador — loop completo relógio↔celular↔motor GSM.

### Notas de implementação iOS (não óbvias)

- **Registro do plugin é à prova de `cap sync`.** O `cap sync` REESCREVE o
  `packageClassList` do `capacitor.config.json` (varre só `node_modules`), então
  um plugin app-local sumiria dali. Registramos via subclasse
  `MainViewController: CAPBridgeViewController` sobrescrevendo `capacitorDidLoad()`
  → `bridge?.registerPluginInstance(ScoreplaceWatchPlugin())`. `Main.storyboard`
  aponta pra `MainViewController` (customModule `App`). Sem `.m`, sem bridging
  header, sem depender do `packageClassList`.
- **Cirurgia no `project.pbxproj` via gem `xcodeproj`** (Ruby), não à mão nem
  xcodegen (o `ios/App` não é xcodegen-managed e reproduzir o SPM/Capacitor era
  arriscado). `cap sync` mexe em `CapApp-SPM/Package.swift`, NÃO no pbxproj —
  então a cirurgia aditiva sobrevive. Script: adiciona o target watchOS, a fase
  "Embed Watch Content" (`dstSubfolderSpec=16`, `$(CONTENTS_FOLDER_PATH)/Watch`),
  a dependência, e os 2 arquivos Swift novos ao target iOS.
- **Payload trafega como STRING JSON** dos dois lados (igual ao `byte[]` do
  Android). `updateApplicationContext`/`sendMessage` do WCSession rejeitam
  `NSNull` (server/winner null) — mandar o JSON serializado contorna isso e
  entrega o último estado mesmo com o relógio em background.

---

# Caminho B — motor nativo no relógio com EVENT-SOURCING (contrato, Leva 1)

Decisão do dono (14/ago/2026): _"vamos seguir com o caminho B… mantendo as telas
dos relógios que já desenhamos."_ As telas ficam porque já são desacopladas:
`RemoteView.swift` recebe `ScoreState` + callbacks (`onPoint`/`onUndo`/…) e o
Wear renderiza o mesmo JSON de snapshot — **o Caminho B troca de onde o
`ScoreState` vem, não o que se desenha com ele.**

## O princípio que neutraliza o risco de drift

A verdade da partida NÃO é o placar que o relógio calculou — é o **DIÁRIO DE
EVENTOS crus** (ponto, desfazer, sacador, decisão de empate). O motor nativo do
relógio existe só pra DESENHAR o placar na hora; quando o diário chega ao
celular, quem o reproduz e produz o placar oficial é o **motor GSM canônico do
JS** (o mesmo de hoje), e é dele que saem a gravação na chave, o Firestore e o
histórico. Consequências:
- Drift entre motor nativo e JS = erro **cosmético e temporário** na tela do
  relógio, nunca dado corrompido.
- Drift é **testável**: vetores gerados do motor JS (sequência de eventos →
  snapshots esperados) rodam idênticos em Swift e Kotlin. Divergiu = vermelho.

## O diário de eventos (relógio → celular)

Um evento por gesto, apendado localmente e sincronizado quando der (lote):

```json
{ "v": 1, "type": "evlog", "matchEpoch": "<época da partida>",
  "deviceId": "<watch|phone + id>", "events": [
    { "n": 1, "t": 1723600000000, "kind": "point",      "team": 1 },
    { "n": 2, "t": 1723600004000, "kind": "point",      "team": 2 },
    { "n": 3, "t": 1723600009000, "kind": "undo" },
    { "n": 4, "t": 1723600015000, "kind": "setServer",  "team": 2, "playerIdx": 1 },
    { "n": 5, "t": 1723600020000, "kind": "resolveTie", "rule": "tiebreak" },
    { "n": 6, "t": 1723600100000, "kind": "close" }
  ] }
```

- `n` é sequencial POR DISPOSITIVO e POR partida — o receptor deduplica por
  `(deviceId, n)` e aplica em ordem. Reenvio de lote é idempotente.
- `matchEpoch` identifica A PARTIDA (nasce no `start`/montagem e viaja no
  snapshot) — evento de partida velha nunca contamina a nova (a lição do seq).
- `undo` desfaz o último evento EFETIVO do diário mesclado (não "do meu lado"),
  espelhando o `_liveScoreUndoLastPoint` — inclusive atravessando o fim (1.8.64).
- A config de pontuação (games/set, contagem, regra de tie, setsToWin, ordem de
  saque inicial) viaja UMA vez no snapshot de abertura da partida — o motor
  nativo não decide config, só aplica.

## Posse (quem manda enquanto a partida roda)

Regra simples e auditável: **quem gerou o último evento manda; o outro espelha.**
- Relógio e celular podem AMBOS gerar eventos; o diário mesclado (ordenado por
  `t`, desempate por `deviceId`) é único e determinístico nos dois lados.
- O CELULAR continua sendo o único que PERSISTE (chave/Firestore/histórico), e
  sempre via motor JS canônico reproduzindo o diário.
- Sem conexão, o relógio segue jogando sozinho (motor local); ao reconectar, o
  lote sincroniza e os dois lados convergem pro mesmo diário.
- Conflito real (os dois marcaram ponto no mesmo intervalo sem se ver) resolve
  pela ordem do diário mesclado — o resultado pode "pular" no lado que espelhava,
  igual a hoje quando o snapshot chega. O Desfazer cobre o resto.

## Vetores de paridade (o gate)

`tests/watch-engine-vectors/` (Leva 1): um harness dirige o motor GSM REAL do
app (Chromium, `_openLiveScoring` de verdade — nunca réplica) com sequências de
eventos por modalidade/config (Beach Tennis g-1, Tênis g, Padel, contagem
numérica, super tie-break, no-ad, desfazer atravessando game/set/fim) e grava
`{config, events[], snapshots[]}` em JSON. Os motores Swift e Kotlin (Leva 2)
rodam os MESMOS vetores e têm que produzir snapshots idênticos campo a campo.
Vetor novo = caso novo de regressão pros três motores de uma vez.

## Fases

- **Leva 0 (1.8.64, FEITA):** época de sessão no snapshot; Desfazer pós-fim com
  regravação segura; ♥ BPM pelo live builder; ♥ FC máxima no perfil.
- **Leva 1:** este contrato + gerador de vetores rodando o motor JS real.
- **Leva 2:** motor Swift (watchOS) + Kotlin/Java (Wear) validados pelos
  vetores, ligados às telas EXISTENTES pelos callbacks que já existem; celular
  ganha o receptor de diário (reproduz no motor JS). Fonte do snapshot vira uma
  CHAVE (local × celular) — a Opção A vira o modo espelho.
- **Leva 3:** build nativo (gate de sempre: TestFlight primeiro, dono valida).

Escopo honesto do 1º corte: o motor local cobre a PARTIDA AO VIVO (pontos,
games, sets, tie, saque, desfazer, encerrar — casual e jogo de torneio). Fluxos
que precisam do doc do torneio (rotação Rei/Rainha, iniciar partida montada no
celular) continuam pedindo o celular por perto, como hoje.
