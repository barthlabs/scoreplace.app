# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ── v1.7.76: R8 LIGADO (ordem do dono, 3ª vez) ──────────────────────────────
# Este app é uma WebView + plugins do Capacitor resolvidos por REFLEXÃO: o
# runtime instancia a classe do plugin pelo NOME e chama métodos anotados. R8
# não enxerga essas chamadas, então sem as regras abaixo ele apaga/renomeia o
# plugin e o app sobe com login, push, share e status bar MORTOS — falha em
# runtime, não em compilação. Por isso as regras são generosas de propósito.
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * { @com.getcapacitor.PluginMethod public *; }
-keepclassmembers class * { @com.getcapacitor.JSGetter *; }
-keepclassmembers class * { @com.getcapacitor.JSSetter *; }
# Plugins da comunidade/Firebase declarados no capacitor.config (também por nome)
-keep class io.capawesome.** { *; }
-keep class com.capacitorjs.** { *; }
-keep class com.getcapacitor.community.** { *; }
-keep class app.scoreplace.** { *; }
# Ponte JS→nativo: qualquer @JavascriptInterface morre se for renomeada
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
# Firebase/Google: modelos e callbacks resolvidos por reflexão
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.**
# Stack trace legível NO console do Play (é o que o aviso de desofuscação quer)
-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,Exceptions

# O plugin @capacitor-firebase/authentication traz handlers para TODOS os provedores
# (Facebook, Twitter, Play Games…) mesmo quando o app só usa Google e Apple. As classes
# dos provedores não usados não estão no APK, e o R8 trata referência ausente como ERRO.
# Não é problema: esses caminhos nunca executam aqui. `dontwarn` silencia a checagem
# sem manter código nenhum a mais.
-dontwarn com.facebook.**
-dontwarn com.twitter.**
-dontwarn com.google.android.gms.games.**

# ── Wear: a camada de dados do relógio é resolvida pelo Google Play Services ──
-keep class com.google.android.gms.wearable.** { *; }
-keep class * implements com.google.android.gms.wearable.MessageClient$OnMessageReceivedListener { *; }
-keep class * implements com.google.android.gms.wearable.DataClient$OnDataChangedListener { *; }
-keep class * extends com.google.android.gms.wearable.WearableListenerService { *; }
