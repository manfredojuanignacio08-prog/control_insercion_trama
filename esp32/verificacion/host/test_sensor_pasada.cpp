#include "Arduino.h"
#include "config_nivel2.h"
#include "sensor_pasada.h"
#include <cassert>
#include <cstdio>
// pulso: sube tiempo, dispara ISR, y libera reposo como haría el loop
static void pulso(unsigned long dt=200){ g_ms+=dt; isrPasada(); esperandoReposo=false; }
int main(){
  // --- #13: tres retrocesos acumulados descuentan tres pasadas (antes: una)
  g_ms=1000; for(int i=0;i<10;i++) pulso();
  assert(sensorPasadaTotal()==10);
  sensorPasadaAvisarRetroceso(3, true);           // maquina en marcha: no reclasifica, queda pendiente
  bool r; pulso(); assert(sensorPasadaHuboPulso(&r) && r); assert(sensorPasadaTotal()==9);
  pulso(); sensorPasadaHuboPulso(&r); assert(r && sensorPasadaTotal()==8);
  pulso(); sensorPasadaHuboPulso(&r); assert(r && sensorPasadaTotal()==7);
  pulso(); sensorPasadaHuboPulso(&r); assert(!r && sensorPasadaTotal()==8);   // el cuarto ya es hacia adelante
  // --- retroceso que el sensor vio ANTES del aviso, con la maquina en pausa: se reclasifica
  sensorPasadaFijarTotal(50);
  pulso(); sensorPasadaHuboPulso(&r); assert(!r && sensorPasadaTotal()==51);  // contado como +1
  g_ms+=1500; sensorPasadaAvisarRetroceso(1, false);                          // llega el aviso 1,5 s despues
  assert(sensorPasadaTotal()==49);                                            // 51 -> 49 (era un -1, no un +1)
  assert(sensorPasadaTomarReclasificados()==1 && sensorPasadaTomarReclasificados()==0);
  pulso(); sensorPasadaHuboPulso(&r); assert(!r && sensorPasadaTotal()==50);  // el siguiente pulso NO se descuenta
  // aviso tardio fuera de ventana: no reclasifica, queda pendiente
  g_ms+=10000; sensorPasadaAvisarRetroceso(1,false); assert(sensorPasadaTotal()==50);
  pulso(); sensorPasadaHuboPulso(&r); assert(r && sensorPasadaTotal()==49);
  // --- #14: periodo de gracia
  g_ms=100000; sensorPasadaFijarTotal(0);
  ultimoPulsoMs = 0;                                  // como recien encendido
  sensorPasadaMarcarArranque();                       // pasa a "tejiendo"
  assert(!sensorPasadaSinSenal());                    // antes: true al instante
  g_ms+=10000; assert(!sensorPasadaSinSenal());       // 10 s sin pulso: todavia en gracia (15 s)
  g_ms+=6000;  assert(sensorPasadaSinSenal());        // 16 s: sin senal
  sensorPasadaMarcarArranque(); g_ms+=1000; pulso(); pulso();
  assert(!sensorPasadaSinSenal());                    // con pulsos rige el timeout de 3 s
  g_ms+=2900; assert(!sensorPasadaSinSenal());
  g_ms+=200;  assert(sensorPasadaSinSenal());
  // pausa larga con pulsos viejos y nuevo arranque: vuelve la gracia
  sensorPasadaMarcarArranque(); g_ms+=5000; assert(!sensorPasadaSinSenal());
  // contador en cero + retroceso: no queda negativo
  sensorPasadaFijarTotal(0); sensorPasadaAvisarRetroceso(1,true); pulso(); sensorPasadaHuboPulso(&r); assert(sensorPasadaTotal()==0);
  // --- aviso de retroceso que nunca se consumio: caduca a los 30 s y no descuenta un pulso posterior
  g_ms=500000; sensorPasadaFijarTotal(20); sensorPasadaAvisarRetroceso(1, true);
  g_ms+=31000; sensorPasadaActualizar(); pulso(); sensorPasadaHuboPulso(&r); assert(!r && sensorPasadaTotal()==21);
  // --- y se descarta al arrancar el tejido
  sensorPasadaAvisarRetroceso(2, true); sensorPasadaMarcarArranque(); pulso(); sensorPasadaHuboPulso(&r); assert(!r && sensorPasadaTotal()==22);
  // --- un aviso vigente (menos de 30 s) si se consume
  sensorPasadaAvisarRetroceso(1, true); g_ms+=5000; sensorPasadaActualizar(); pulso(); sensorPasadaHuboPulso(&r); assert(r && sensorPasadaTotal()==21);
  puts("sensor_pasada.h OK");
}
