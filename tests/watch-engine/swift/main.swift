import Foundation

/**
 * Runner de PARIDADE do motor Swift (Caminho B, Leva 2).
 * Lê os vetores gerados do motor JS REAL (tests/watch-engine/vectors/),
 * reproduz cada sequência de eventos no ScoreEngine.swift e exige snapshot
 * IDÊNTICO campo a campo em CADA passo (comparação canônica com chaves
 * ordenadas — a mesma regra do gen.stable do gerador).
 *
 * Rodar: tests/watch-engine/run-swift-parity.sh (compila com swiftc e executa).
 * ⚠️ Fora do npm test de propósito: exige toolchain do Xcode, que a CI não tem —
 * mesmo regime dos testes de emulador. Gate obrigatório antes de build nativo.
 */

// ── stringificação canônica (== gen.stable do generate.js) ──
func canon(_ v: Any?) -> String {
    guard let v = v else { return "null" }
    if v is NSNull { return "null" }
    if let n = v as? NSNumber {
        // ⚠️ ORDEM IMPORTA: `NSNumber(0/1) as? Bool` FAZ PONTE em Swift — checar o
        // CFTypeID primeiro, senão todo 0/1 inteiro do JSON viraria false/true.
        if CFGetTypeID(n) == CFBooleanGetTypeID() { return n.boolValue ? "true" : "false" }
        if n.doubleValue == n.doubleValue.rounded() && abs(n.doubleValue) < 1e15 {
            return String(n.int64Value)
        }
        return "\(n)"
    }
    if let s = v as? String {
        var out = "\""
        for c in s.unicodeScalars {
            switch c {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if c.value < 0x20 { out += String(format: "\\u%04x", c.value) }
                else { out.unicodeScalars.append(c) }
            }
        }
        return out + "\""
    }
    if let a = v as? [Any] { return "[" + a.map { canon($0) }.joined(separator: ",") + "]" }
    if let d = v as? [String: Any] {
        let keys = d.keys.sorted()
        return "{" + keys.map { canon($0) + ":" + canon(d[$0]!) }.joined(separator: ",") + "}"
    }
    return "\"?\""
}

func fail(_ msg: String) -> Never {
    FileHandle.standardError.write(("✗ " + msg + "\n").data(using: .utf8)!)
    exit(1)
}

let args = CommandLine.arguments
guard args.count > 1 else { fail("uso: runner <dir-dos-vetores>") }
let dir = args[1]
guard let files = try? FileManager.default.contentsOfDirectory(atPath: dir).filter({ $0.hasSuffix(".json") }).sorted(),
      !files.isEmpty else { fail("nenhum vetor em \(dir)") }

var totalSteps = 0
var badVectors = 0

for f in files {
    let path = (dir as NSString).appendingPathComponent(f)
    guard let data = FileManager.default.contents(atPath: path),
          let vec = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let name = vec["name"] as? String,
          let sport = vec["sport"] as? String,
          let players = vec["players"] as? [String: Any],
          let config = vec["config"] as? [String: Any],
          let steps = vec["steps"] as? [[String: Any]] else { fail("vetor ilegível: \(f)") }

    let engine = ScoreEngine(
        config: EngineConfig(json: config),
        p1Name: (players["p1Name"] as? String) ?? "",
        p2Name: (players["p2Name"] as? String) ?? "",
        isDoubles: (players["isDoubles"] as? Bool) ?? false,
        sportName: sport
    )

    var divergiu = -1
    for (i, step) in steps.enumerated() {
        guard let ev = step["event"] as? [String: Any],
              let expected = step["state"] as? [String: Any],
              let kind = ev["kind"] as? String else { fail("passo ilegível em \(name)[\(i)]") }
        switch kind {
        case "open": break   // estado inicial — nada a aplicar
        case "point": engine.apply(.point(team: (ev["team"] as? Int) ?? 0))
        case "undo": engine.apply(.undo)
        case "serveSelect": engine.apply(.serveSelect(team: (ev["team"] as? Int) ?? 0, idx: (ev["idx"] as? Int) ?? 0))
        case "serveConfirm": engine.apply(.serveConfirm)
        case "resolveTie": engine.apply(.resolveTie(rule: (ev["rule"] as? String) ?? ""))
        default: fail("evento desconhecido '\(kind)' em \(name)[\(i)]")
        }
        let mine = canon(engine.snapshot())
        let ref = canon(expected)
        totalSteps += 1
        if mine != ref {
            divergiu = i
            print("✗ \(name): DIVERGE no passo \(i) (evento \(kind))")
            print("  JS   : \(ref)")
            print("  Swift: \(mine)")
            break
        }
    }
    if divergiu == -1 {
        print("✓ \(name): \(steps.count) passos idênticos")
    } else {
        badVectors += 1
    }
}

if badVectors > 0 { fail("\(badVectors) vetor(es) divergente(s)") }
print("✓ PARIDADE Swift×JS: \(files.count) vetores, \(totalSteps) snapshots idênticos")
