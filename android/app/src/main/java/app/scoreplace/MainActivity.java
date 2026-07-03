package app.scoreplace;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Ponte pro smartwatch (fase 4). Transporte ainda não ligado.
        registerPlugin(ScoreplaceWatchPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
