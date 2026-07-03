package app.scoreplace.wear;

import android.app.Activity;
import android.os.Bundle;

/**
 * scoreplace Wear OS — controle de placar ao vivo (preview estático).
 * Escopo: placar grande + games no topo + bola no sacador + desfazer.
 * Dados mock nesta etapa; a ponte ao vivo com o celular (Wear Data Layer →
 * motor GSM no JS do app) é a fase seguinte.
 */
public class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
    }
}
