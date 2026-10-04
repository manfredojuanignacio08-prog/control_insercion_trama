#pragma once
#include "Arduino.h"
typedef struct { unsigned timeout_ms; unsigned idle_core_mask; bool trigger_panic; } esp_task_wdt_config_t;
inline esp_err_t esp_task_wdt_init(const esp_task_wdt_config_t*){return 0;}
inline esp_err_t esp_task_wdt_reconfigure(const esp_task_wdt_config_t*){return 0;}
inline esp_err_t esp_task_wdt_add(void*){return 0;} inline esp_err_t esp_task_wdt_reset(){return 0;}
enum { ESP_RST_TASK_WDT, ESP_RST_INT_WDT, ESP_RST_WDT, ESP_RST_BROWNOUT, ESP_RST_PANIC, ESP_RST_POWERON };
inline int esp_reset_reason(){return ESP_RST_POWERON;}
