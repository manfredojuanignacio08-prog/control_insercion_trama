package com.controltrama.app.data.remote

import com.controltrama.app.data.model.AsignarPatronRequest
import com.controltrama.app.data.model.CrearErrorRequest
import com.controltrama.app.data.model.CrearTelarRequest
import com.controltrama.app.data.model.DetenerTelarRequest
import com.controltrama.app.data.model.ErrorLog
import com.controltrama.app.data.model.HistorialProduccion
import com.controltrama.app.data.model.Patron
import com.controltrama.app.data.model.PatronRequest
import com.controltrama.app.data.model.PasosRequest
import com.controltrama.app.data.model.Telar
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Espejo 1:1 de las rutas que ya expone el backend
 * (routes/patrones.routes.js, routes/telares.routes.js,
 * routes/errores.routes.js). No hay ningún endpoint acá que no exista ya
 * en el servidor real.
 */
interface ApiService {

    // ---------- Patrones ----------

    @GET("api/patrones")
    suspend fun listarPatrones(@Query("buscar") buscar: String? = null): List<Patron>

    @GET("api/patrones/{id}")
    suspend fun obtenerPatron(@Path("id") id: Int): Patron

    @POST("api/patrones")
    suspend fun crearPatron(@Body body: PatronRequest): Patron

    @PUT("api/patrones/{id}")
    suspend fun actualizarPatron(@Path("id") id: Int, @Body body: PatronRequest): Patron

    @DELETE("api/patrones/{id}")
    suspend fun eliminarPatron(@Path("id") id: Int)

    // ---------- Telares ----------

    @GET("api/telares")
    suspend fun listarTelares(): List<Telar>

    @GET("api/telares/{id}")
    suspend fun obtenerTelar(@Path("id") id: Int): Telar

    @POST("api/telares")
    suspend fun crearTelar(@Body body: CrearTelarRequest): Telar

    @POST("api/telares/{id}/asignar-patron")
    suspend fun asignarPatron(
        @Path("id") id: Int,
        @Body body: AsignarPatronRequest
    ): HistorialProduccion

    @POST("api/telares/{id}/detener")
    suspend fun detenerTelar(
        @Path("id") id: Int,
        @Body body: DetenerTelarRequest
    ): HistorialProduccion

    // Este es el endpoint que en el futuro va a llamar el ESP32 cada vez
    // que el sensor óptico detecte una pasada física real. Hoy lo llama la
    // app / la web para simular el avance.
    @POST("api/telares/{id}/avanzar")
    suspend fun avanzarTelar(
        @Path("id") id: Int,
        @Body body: PasosRequest
    ): HistorialProduccion

    @POST("api/telares/{id}/retroceder")
    suspend fun retrocederTelar(
        @Path("id") id: Int,
        @Body body: PasosRequest
    ): HistorialProduccion

    @GET("api/telares/{id}/historial")
    suspend fun historialPorTelar(@Path("id") id: Int): List<HistorialProduccion>

    // Historial global de TODOS los telares (con filtros opcionales por telar
    // y rango de fechas). El backend ya lo expone en /api/historial.
    @GET("api/historial")
    suspend fun historialGlobal(
        @Query("telar_id") telarId: Int? = null,
        @Query("desde") desde: String? = null,
        @Query("hasta") hasta: String? = null
    ): List<HistorialProduccion>

    // ---------- Errores ----------

    @GET("api/errores")
    suspend fun listarErrores(
        @Query("telar_id") telarId: Int? = null,
        @Query("limit") limit: Int? = null
    ): List<ErrorLog>

    @POST("api/errores")
    suspend fun crearError(@Body body: CrearErrorRequest): ErrorLog
}
