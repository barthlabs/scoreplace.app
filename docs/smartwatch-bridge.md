# Ponte relógio ↔ celular (fase 4) — contrato

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
- **`seq` monotônico** no estado: o relógio descarta snapshot mais antigo que o
  último visto (protege contra reordenação do transporte).
- **`id` na intenção**: o celular deduplica intenção repetida (protege
  double-tap / reenvio do transporte).

## Relógio → Celular (intenções)

```jsonc
{ "v": 1, "type": "point", "team": 1, "id": "<uuid>" }  // +1 ao time 1 (ou 2)
{ "v": 1, "type": "undo",  "id": "<uuid>" }             // desfaz o último ponto
{ "v": 1, "type": "hello" }                             // pede o estado atual (abrir/reconectar)
```

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
