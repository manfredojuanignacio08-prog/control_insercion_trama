// ─────────────────────────────────────────────────────────────────────
// Este archivo NO es un build.gradle.kts completo — es el bloque de
// dependencias que hay que FUSIONAR dentro del build.gradle.kts real del
// módulo "app" que genera Android Studio al crear el proyecto.
//
// Ver README.md para el paso a paso completo.
// ─────────────────────────────────────────────────────────────────────

dependencies {
    // Básicos de Android + Compose (Android Studio ya los agrega solo al
    // crear un proyecto "Empty Activity" con Compose; se listan igual acá
    // por si hay que agregarlos a mano o actualizar versiones)
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.activity:activity-compose:1.9.1")
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")

    // Iconos de Material usados en la barra de navegación (List, PlayArrow,
    // DateRange). Son del set "core", que ya viene con Compose, pero se
    // declara explícito para que los imports resuelvan sin sorpresas.
    implementation("androidx.compose.material:material-icons-core")

    // Navegación entre pantallas (Compose)
    implementation("androidx.navigation:navigation-compose:2.7.7")

    // ViewModel integrado con Compose (collectAsState, viewModel())
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.4")

    // ---- Las 3 que hay que agregar a mano para consumir la API ----

    // Cliente HTTP + conversión automática de JSON a nuestras data class
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")

    // Ver en Logcat cada pedido/respuesta mientras se desarrolla
    // (RetrofitClient.kt ya lo tiene enchufado, solo falta esta línea)
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Coroutines (las funciones "suspend" del ApiService las necesitan)
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
}
