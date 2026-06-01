#include <stdio.h>
#include "shadow_manager.h"

void shadow_manager_subscribe(esp_mqtt_client_handle_t client, const char *device_id)
{
    char topic[160];
    snprintf(topic, sizeof topic, "$aws/things/%s/shadow/update/delta", device_id);
    esp_mqtt_client_subscribe(client, topic, 1);
}

void shadow_manager_report(esp_mqtt_client_handle_t client, const char *device_id, const char *firmware_version, int rssi)
{
    char topic[160];
    char payload[256];
    snprintf(topic, sizeof topic, "$aws/things/%s/shadow/update", device_id);
    snprintf(payload, sizeof payload,
             "{\"state\":{\"reported\":{\"firmware_version\":\"%s\",\"wifi_rssi\":%d,\"ota_state\":\"idle\"}}}",
             firmware_version, rssi);
    esp_mqtt_client_publish(client, topic, payload, 0, 1, 0);
}
