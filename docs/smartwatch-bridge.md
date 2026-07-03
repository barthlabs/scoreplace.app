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
- ⏳ Este contrato — implementação do módulo JS depende do mapa do motor
  (`state`, entrada de +1, undo, formatador de exibição) em `bracket-ui.js`.
- ⏳ Plugin Capacitor + transporte (WatchConnectivity / Wear Data Layer).
- ⏳ Integrar o target watchOS de verdade no `ios/App` (pbxproj) — o preview
  standalone (`ios/WatchApp`) não pareia; vira alvo companion.
