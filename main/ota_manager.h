#ifndef OTA_MANAGER_H
#define OTA_MANAGER_H

#include "mqtt_client.h"

void ota_manager_subscribe(esp_mqtt_client_handle_t client, const char *device_id);
void ota_manager_handle_message(const char *topic, int topic_len, const char *payload, int payload_len);

#endif
