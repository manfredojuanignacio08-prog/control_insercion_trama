package com.controltrama.app.data.repository

import com.controltrama.app.data.model.ApiErrorResponse
import com.controltrama.app.data.model.AsignarPatronRequest
import com.controltrama.app.data.model.CrearErrorRequest
import com.controltrama.app.data.model.CrearTelarRequest
import com.controltrama.app.data.model.DetenerTelarRequest
import com.controltrama.app.data.model.ErrorLog
import com.controltrama.app.data.model.HistorialProduccion
import com.controltrama.app.data.model.PasosRequest
import com.controltrama.app.data.model.Patron
import com.controltrama.app.data.model.PatronRequest
import com.controltrama.app.data.model.Telar
import com.controltrama.app.data.remote.ApiService
import com.controltrama.app.data.remote.RetrofitClient
import com.google.gson.Gson
import retrofit2.HttpException
import java.io.IOException

/**
 * Capa intermedia entre las pantallas (ViewModels) y Retrofit. Ningún
 * ViewModel llama a ApiService directamente: siempre pasa por acá, así
 * toda la app maneja los errores de red de la misma forma — el mismo
 * espíritu que el middleware/errorHandler.js centralizado del backend.
 */
class TramaRepository(private val api: ApiService = RetrofitClient.apiService) {

    // ---------- Patrones ----------

    suspend fun listarPatrones(buscar: String? = null): ApiResult<List<Patron>> =
        safeCall { api.listarPatrones(buscar) }

    suspend fun obtenerPatron(id: Int): ApiResult<Patron> =
        safeCall { api.obtenerPatron(id) }

    suspend fun crearPatron(body: PatronRequest): ApiResult<Patron> =
        safeCall { api.crearPatron(body) }

    suspend fun actualizarPatron(id: Int, body: PatronRequest): ApiResult<Patron> =
        safeCall { api.actualizarPatron(id, body) }

    suspend fun eliminarPatron(id: Int): ApiResult<Unit> =
        safeCall { api.eliminarPatron(id) }

    // ---------- Telares ----------

    suspend fun listarTelares(): ApiResult<List<Telar>> =
        safeCall { api.listarTelares() }

    suspend fun obtenerTelar(id: Int): ApiResult<Telar> =
        safeCall { api.obtenerTelar(id) }

    suspend fun crearTelar(codigo: String, nombre: String? = null): ApiResult<Telar> =
        safeCall { api.crearTelar(CrearTelarRequest(codigo, nombre)) }

    suspend fun asignarPatron(telarId: Int, patronId: Int): ApiResult<HistorialProduccion> =
        safeCall { api.asignarPatron(telarId, AsignarPatronRequest(patronId)) }

    suspend fun avanzar(telarId: Int, pasos: Int? = null): ApiResult<HistorialProduccion> =
        safeCall { api.avanzarTelar(telarId, PasosRequest(pasos)) }

    suspend fun retroceder(telarId: Int, pasos: Int? = null): ApiResult<HistorialProduccion> =
        safeCall { api.retrocederTelar(telarId, PasosRequest(pasos)) }

    suspend fun detener(telarId: Int): ApiResult<HistorialProduccion> =
        safeCall { api.detenerTelar(telarId, DetenerTelarRequest()) }

    suspend fun historialPorTelar(telarId: Int): ApiResult<List<HistorialProduccion>> =
        safeCall { api.historialPorTelar(telarId) }

    suspend fun historialGlobal(
        telarId: Int? = null,
        desde: String? = null,
        hasta: String? = null
    ): ApiResult<List<HistorialProduccion>> =
        safeCall { api.historialGlobal(telarId, desde, hasta) }

    // ---------- Errores ----------

    suspend fun listarErrores(telarId: Int? = null, limit: Int? = null): ApiResult<List<ErrorLog>> =
        safeCall { api.listarErrores(telarId, limit) }

    suspend fun crearError(
        telarId: Int?,
        titulo: String,
        mensaje: String? = null,
        codigo: String? = null
    ): ApiResult<ErrorLog> =
        safeCall { api.crearError(CrearErrorRequest(telarId, titulo, mensaje, codigo)) }

    // ---------- Manejo de errores centralizado ----------

    /**
     * Envuelve cualquier llamada de red: convierte excepciones y respuestas
     * de error HTTP en un ApiResult.Error con un mensaje legible para
     * mostrar en pantalla, en vez de dejar que la excepción rompa la app.
     */
    private suspend fun <T> safeCall(call: suspend () -> T): ApiResult<T> {
        return try {
            ApiResult.Success(call())
        } catch (e: HttpException) {
            // El backend siempre devuelve los errores como { "error": "..." }
            // (ver middleware/errorHandler.js) — se parsea ese cuerpo para
            // mostrar el mensaje real en vez de uno genérico.
            val mensaje = e.response()?.errorBody()?.string()?.let { cuerpo ->
                try {
                    Gson().fromJson(cuerpo, ApiErrorResponse::class.java).error
                } catch (parseError: Exception) {
                    null
                }
            } ?: "Error del servidor (código ${e.code()})"
            ApiResult.Error(mensaje)
        } catch (e: IOException) {
            ApiResult.Error("No se pudo conectar con el servidor. Revisá tu conexión.")
        } catch (e: Exception) {
            ApiResult.Error(e.message ?: "Error inesperado")
        }
    }
}
