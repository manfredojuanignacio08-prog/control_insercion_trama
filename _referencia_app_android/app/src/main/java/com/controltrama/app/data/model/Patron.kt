package com.controltrama.app.data.model

import com.google.gson.annotations.SerializedName

/**
 * Representa un patrón de tejido tal como lo devuelve el backend
 * (GET /api/patrones, GET /api/patrones/:id).
 *
 * Los nombres de las propiedades están en camelCase (convención de Kotlin);
 * @SerializedName mapea cada una al nombre real en snake_case que usa la
 * API — son EXACTAMENTE los mismos campos que ya devuelve
 * patrones.controller.js en el backend, no hay que inventar ninguno nuevo.
 */
data class Patron(
    val id: Int,
    val nombre: String,
    val filas: Int,
    val columnas: Int,

    // Cuántas pasadas de hilo lleva cada celda. Es una matriz (lista de
    // listas) de enteros, ej: [[1,2],[3,1]].
    @SerializedName("matriz_pasadas")
    val matrizPasadas: List<List<Int>>,

    // Patrón binario (0/1) de estructura textil. Puede venir null si el
    // patrón no lo tiene calculado todavía.
    @SerializedName("matriz_ligamento")
    val matrizLigamento: List<List<Int>>? = null,

    // Un color hexadecimal por fila, ej: ["#ff0000", "#00ff00"].
    @SerializedName("colores_filas")
    val coloresFilas: List<String>? = null,

    // Campo abierto, ej: {"tipo": "Tafetán"}. Si en el futuro necesita
    // valores que no sean texto, cambiar el tipo a Map<String, Any>.
    val metadata: Map<String, String>? = null,

    @SerializedName("creado_at")
    val creadoAt: String? = null,

    @SerializedName("modificado_at")
    val modificadoAt: String? = null
)

/**
 * Cuerpo que se manda al CREAR (POST) o EDITAR (PUT) un patrón. No incluye
 * id ni las fechas porque esos los genera el backend.
 */
data class PatronRequest(
    val nombre: String,
    val filas: Int,
    val columnas: Int,
    @SerializedName("matriz_pasadas")
    val matrizPasadas: List<List<Int>>,
    @SerializedName("matriz_ligamento")
    val matrizLigamento: List<List<Int>>? = null,
    @SerializedName("colores_filas")
    val coloresFilas: List<String>? = null,
    val metadata: Map<String, String>? = null
)
