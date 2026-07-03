package app.scoreplace;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;

import java.nio.charset.StandardCharsets;

/**
 * Plugin Capacitor da ponte pro smartwatch (fase 4, Android) — lado do celular.
 * Contrato: docs/smartwatch-bridge.md. Transporte = Wear Data Layer:
 *   - JS→relógio: MessageClient.sendMessage(node, "/scoreplace/state", json)
 *   - relógio→JS: OnMessageReceived("/scoreplace/intent") → evento watchIntent
 * O motor GSM (fonte única) roda no JS (WatchBridge → bracket-ui.js).
 */
@CapacitorPlugin(name = "ScoreplaceWatch")
public class ScoreplaceWatchPlugin extends Plugin implements MessageClient.OnMessageReceivedListener {

    private static final String PATH_STATE = "/scoreplace/state";
    private static final String PATH_INTENT = "/scoreplace/intent";

    @Override
    public void load() {
        try {
            Wearable.getMessageClient(getContext()).addListener(this);
        } catch (Exception e) { /* sem Play Services / sem relógio: fica inerte */ }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            Wearable.getMessageClient(getContext()).removeListener(this);
        } catch (Exception e) { /* ignore */ }
        super.handleOnDestroy();
    }

    // JS → nativo: empurra o snapshot de estado pros relógios conectados.
    @PluginMethod
    public void sendState(PluginCall call) {
        JSObject snapshot = call.getObject("snapshot");
        final byte[] bytes = (snapshot != null ? snapshot.toString() : "{}")
            .getBytes(StandardCharsets.UTF_8);
        try {
            Wearable.getNodeClient(getContext()).getConnectedNodes()
                .addOnSuccessListener(nodes -> {
                    MessageClient mc = Wearable.getMessageClient(getContext());
                    for (Node node : nodes) {
                        mc.sendMessage(node.getId(), PATH_STATE, bytes);
                    }
                });
        } catch (Exception e) { /* sem nó conectado: no-op */ }
        call.resolve();
    }

    // nativo → JS: intenção do relógio (+1 / desfazer / hello) chega aqui e é
    // entregue ao WatchBridge, que dirige o motor GSM.
    @Override
    public void onMessageReceived(MessageEvent event) {
        if (!PATH_INTENT.equals(event.getPath())) return;
        try {
            String json = new String(event.getData(), StandardCharsets.UTF_8);
            JSObject ev = new JSObject();
            ev.put("intent", new JSObject(json));
            notifyListeners("watchIntent", ev);
        } catch (Exception e) { /* intenção malformada: ignora */ }
    }
}
