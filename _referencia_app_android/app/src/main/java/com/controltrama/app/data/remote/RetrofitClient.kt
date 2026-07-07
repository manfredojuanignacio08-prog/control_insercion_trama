package com.controltrama.app.data.remote

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Punto único de configuración de red. El resto de la app nunca crea un
 * Retrofit propio: siempre usa RetrofitClient.apiService.
 */
object RetrofitClient {

    // ⚠️ CAMBIAR ESTA URL SEGÚN DÓNDE ESTÉ CORRIENDO EL BACKEND NODE.JS
    // (¡la URL del backend, NO la de Supabase! La app nunca habla directo
    // con la base de datos: siempre pasa por la API, igual que la web).
    //
    //  - Emulador de Android Studio, backend corriendo en tu propia PC
    //    (npm start): "http://10.0.2.2:3000/"
    //    (10.0.2.2 es la dirección especial con la que el EMULADOR ve el
    //    "localhost" de la computadora que lo corre — un celular físico NO
    //    puede usar esta dirección).
    //
    //  - Celular físico en la misma red Wi-Fi que la PC del backend:
    //      "http://IP_DE_TU_PC:3000/"  (ej. "http://192.168.1.50:3000/")
    //
    //  - Backend desplegado en la nube (ej. Render) con HTTPS:
    //      "https://tu-backend.onrender.com/"
    //
    // La URL SIEMPRE termina en "/" — Retrofit lo exige para poder pegarle
    // atrás las rutas relativas que están en ApiService (ej. "api/patrones").
    private const val BASE_URL = "http://10.0.2.2:3000/"

    // Muestra en el Logcat de Android Studio cada pedido y respuesta
    // completa (URL, headers, body). Muy útil mientras se prueba contra el
    // backend real; se puede bajar a Level.BASIC para producción.
    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(loggingInterceptor)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    val apiService: ApiService by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
}
