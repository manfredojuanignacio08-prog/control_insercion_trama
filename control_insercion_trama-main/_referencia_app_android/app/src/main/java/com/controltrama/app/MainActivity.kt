package com.controltrama.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.controltrama.app.ui.historial.HistorialScreen
import com.controltrama.app.ui.patrones.PatronesListScreen
import com.controltrama.app.ui.telar.TelarControlScreen
import com.controltrama.app.ui.theme.ControlTramaTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            ControlTramaTheme {
                AppScaffold()
            }
        }
    }
}

// Por ahora hay un solo telar físico (id 1), igual que asume el frontend
// web. Cuando haya más, esto pasa a ser una pantalla selectora.
private const val TELAR_ID = 1

/**
 * Estructura principal: barra de navegación inferior con las 3 secciones,
 * espejo de las secciones de la web (Biblioteca / Telar / Historial).
 */
@Composable
fun AppScaffold() {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val rutaActual = backStackEntry?.destination?.route

    val destinos = listOf(
        Triple("patrones", "Biblioteca", Icons.Filled.List),
        Triple("telar", "Telar", Icons.Filled.PlayArrow),
        Triple("historial", "Historial", Icons.Filled.DateRange),
    )

    Scaffold(
        bottomBar = {
            NavigationBar {
                destinos.forEach { (ruta, etiqueta, icono) ->
                    NavigationBarItem(
                        selected = rutaActual == ruta,
                        onClick = {
                            navController.navigate(ruta) {
                                // evita apilar la misma pantalla mil veces
                                popUpTo("patrones") { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(icono, contentDescription = etiqueta) },
                        label = { Text(etiqueta) }
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = "patrones",
            modifier = Modifier.fillMaxSize().padding(innerPadding)
        ) {
            composable("patrones") { PatronesListScreen() }
            composable("telar") { TelarControlScreen(telarId = TELAR_ID) }
            composable("historial") { HistorialScreen(telarId = TELAR_ID) }
        }
    }
}
