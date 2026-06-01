#ifndef SHADOW_MANAGER_H
#define SHADOW_MANAGER_H

#include "mqtt_client.h"

void shadow_manager_subscribe(esp_mqtt_client_handle_t client, const char *device_id);
void shadow_manager_report(esp_mqtt_client_handle_t client, const char *device_id, const char *firmware_version, int rssi);

#endif
