package com.controltrama.app.data.model

import com.google.gson.annotations.SerializedName

/** Una fila de errores_log (GET /api/errores). */
data class ErrorLog(
    val id: Int,
    @SerializedName("telar_id")
    val telarId: Int?,
    val titulo: String?,
    val mensaje: String?,
    val codigo: String?,
    @SerializedName("creado_at")
    val creadoAt: String
)

/** Cuerpo para POST /api/errores */
data class CrearErrorRequest(
    @SerializedName("telar_id")
    val telarId: Int? = null,
    val titulo: String,
    val mensaje: String? = null,
    val codigo: String? = null
)

/**
 * Forma en la que el backend devuelve CUALQUIER error, sin importar el
 * endpoint — ver middleware/errorHandler.js: siempre es { "error": "..." }.
 * Se usa en TramaRepository para mostrar el mensaje real del backend en vez
 * de un error genérico de Retrofit.
 */
data class ApiErrorResponse(
    val error: String
)
