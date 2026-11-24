# AndroidX DataStore shared counter

Fontes originais do módulo `androidx.datastore:datastore-core-android:1.1.7`. O AAR do Google distribui o contador sem símbolos. O módulo de telefone recompila o mesmo JNI e inclui no Android App Bundle seus símbolos completos de depuração. Para atualizar a dependência, atualize em conjunto a versão Gradle, as fontes e os hashes.

[AndroidX no commit 420da5f291449f11801e378c6789a328a06ec6cb](https://android.googlesource.com/platform/frameworks/support/+/420da5f291449f11801e378c6789a328a06ec6cb/datastore/datastore-core/src/androidMain/cpp/)

SHA-256 dos originais, verificáveis com `shasum -a 256 -c SHA256SUMS` neste diretório.

## Verificação

`scripts/android-release.sh --local-only` valida os símbolos incorporados ao AAB, identidade binária com o APK e com a saída do CMake, as quatro funções JNI e o alinhamento de 16 KB. Os testes de regressão do verificador usam esses artefatos e o SDK indicado em `ANDROID_HOME`. Execute `python3 scripts/test-android-native-symbols.py` a partir da raiz.

Para exercitar o contador no APK minificado, com o emulador selecionado em `ANDROID_SERIAL`, execute na pasta `android`:

```sh
./gradlew -PscoreplaceTestBuildType=release -PscoreplaceTestRunner=app.scoreplace.DataStoreCounterInstrumentation :app:assembleReleaseAndroidTest :app:assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
adb install -r app/build/outputs/apk/androidTest/release/app-release-androidTest.apk
adb shell am instrument -w app.scoreplace.test/app.scoreplace.DataStoreCounterInstrumentation
```

O resultado esperado é `counter=PASS: two mappings observed 0, 1, 2` com `INSTRUMENTATION_CODE: -1`.
