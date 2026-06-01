#include <stdio.h>
#include <string.h>
#include "esp_log.h"
#include "ota_manager.h"

static const char *TAG = "OTA";

void ota_manager_subscribe(esp_mqtt_client_handle_t client, const char *device_id)
{
    char topic[160];
    snprintf(topic, sizeof topic, "$aws/things/%s/jobs/notify-next", device_id);
    esp_mqtt_client_subscribe(client, topic, 1);
    snprintf(topic, sizeof topic, "$aws/things/%s/jobs/start-next/accepted", device_id);
    esp_mqtt_client_subscribe(client, topic, 1);
    snprintf(topic, sizeof topic, "env/%s/ota", device_id);
    esp_mqtt_client_subscribe(client, topic, 1);
    ESP_LOGI(TAG, "Subscribed to OTA topics for %s", device_id);
}

void ota_manager_handle_message(const char *topic, int topic_len, const char *payload, int payload_len)
{
    ESP_LOGI(TAG, "OTA message topic=%.*s payload=%.*s", topic_len, topic, payload_len, payload);
    /* Production handler:
     * - Parse IoT Job document.
     * - Resolve HTTPS firmware URL or signed S3 URL.
     * - Call esp_https_ota().
     * - Report SUCCEEDED/FAILED to IoT Jobs update topic.
     */
}
