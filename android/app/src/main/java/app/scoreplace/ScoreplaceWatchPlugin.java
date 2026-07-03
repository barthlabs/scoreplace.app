package app.scoreplace;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin Capacitor da ponte pro smartwatch (fase 4, Android).
 * Contrato: docs/smartwatch-bridge.md. Este é o ESQUELETO: expõe a interface
 * que o js/watch-bridge.js já espera (sendState + evento watchIntent). O
 * TRANSPORTE (Wear Data Layer, MessageClient) ainda NÃO está ligado — entra
 * no próximo passo, junto do pareamento :wear ↔ celular.
 */
@CapacitorPlugin(name = "ScoreplaceWatch")
public class ScoreplaceWatchPlugin extends Plugin {

    /**
     * JS → nativo: recebe o snapshot de estado (indexado por time) pra empurrar
     * pro relógio.
     * TODO(fase 4): enviar via Wear Data Layer —
     *   Wearable.getMessageClient(ctx).sendMessage(nodeId, "/scoreplace/state", bytes)
     */
    @PluginMethod
    public void sendState(PluginCall call) {
        JSObject snapshot = call.getObject("snapshot");
        // Placeholder: transporte ainda não ligado. Guardo o último estado pra
        // quando o Data Layer entrar (e um "hello" do relógio poder ser servido).
        lastSnapshot = snapshot;
        call.resolve();
    }

    private JSObject lastSnapshot;

    /**
     * nativo → JS: entrega uma intenção do relógio (+1 / desfazer) pro
     * WatchBridge. Será chamado pelo listener do Wear Data Layer quando uma
     * mensagem "/scoreplace/intent" chegar do relógio.
     */
    public void deliverIntent(JSObject intent) {
        JSObject ev = new JSObject();
        ev.put("intent", intent);
        notifyListeners("watchIntent", ev);
    }
}
