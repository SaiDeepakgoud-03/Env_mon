#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "mqtt_client.h"
#include "cJSON.h"
#include "cert_store.h"
#include "fleet_provisioning.h"

#define AWS_ENDPOINT_URI "mqtts://a2aazipzc1zlp2-ats.iot.us-east-1.amazonaws.com"
#define AWS_ENDPOINT_PORT 8883
#define FLEET_TEMPLATE_NAME "envmon-dev-fleet"

#define BIT_DONE BIT0
#define BIT_FAILED BIT1
#define FLEET_RX_MAX 12288

extern const uint8_t aws_root_ca_pem_start[] asm("_binary_AmazonRootCA1_pem_start");
extern const uint8_t claim_cert_pem_start[] asm("_binary_claim_pem_crt_start");
extern const uint8_t claim_key_pem_start[] asm("_binary_claim_private_pem_key_start");

static const char *TAG = "FLEET_PROV";

typedef struct {
    EventGroupHandle_t group;
    esp_mqtt_client_handle_t client;
    const device_config_t *config;
    char certificate[CERT_STORE_CERT_MAX];
    char private_key[CERT_STORE_KEY_MAX];
    char ownership_token[2048];
    char serial[20];
    char rx_topic[220];
    char rx_payload[FLEET_RX_MAX];
    int rx_expected;
    int rx_received;
} fleet_state_t;

static fleet_state_t s_state;

static void mac_string(char *out, size_t out_size)
{
    uint8_t mac[6] = {0};
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    snprintf(out, out_size, "%02X%02X%02X%02X%02X%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}

static void sanitize_iot_attribute(const char *in, char *out, size_t out_size)
{
    size_t j = 0;
    if (!out_size) return;

    for (size_t i = 0; in && in[i] && j + 1 < out_size; i++) {
        char c = in[i];
        bool ok = (c >= 'a' && c <= 'z') ||
                  (c >= 'A' && c <= 'Z') ||
                  (c >= '0' && c <= '9') ||
                  c == '_' || c == '.' || c == ',' || c == '@' ||
                  c == '/' || c == ':' || c == '#' || c == '=' ||
                  c == '[' || c == ']' || c == '-';
        out[j++] = ok ? c : '_';
    }
    out[j] = '\0';
}

static void publish_create_certificate(void)
{
    esp_mqtt_client_subscribe(s_state.client, "$aws/certificates/create/json/accepted", 1);
    esp_mqtt_client_subscribe(s_state.client, "$aws/certificates/create/json/rejected", 1);
    esp_mqtt_client_publish(s_state.client, "$aws/certificates/create/json", "{}", 0, 1, 0);
    ESP_LOGI(TAG, "Requested permanent certificate from AWS IoT");
}

static void publish_register_thing(void)
{
    char topic[180];
    char payload[3072];
    char thing_name[64];
    char device_id[64];

    sanitize_iot_attribute(s_state.config->device_id, thing_name, sizeof thing_name);
    sanitize_iot_attribute(s_state.config->device_id, device_id, sizeof device_id);

    snprintf(topic, sizeof topic,
             "$aws/provisioning-templates/%s/provision/json",
             FLEET_TEMPLATE_NAME);

    snprintf(payload, sizeof payload,
        "{"
        "\"certificateOwnershipToken\":\"%s\","
        "\"parameters\":{"
        "\"ThingName\":\"%s\","
        "\"SerialNumber\":\"%s\","
        "\"DeviceId\":\"%s\""
        "}}",
        s_state.ownership_token,
        thing_name,
        s_state.serial,
        device_id);

    char accepted[220];
    char rejected[220];
    snprintf(accepted, sizeof accepted, "$aws/provisioning-templates/%s/provision/json/accepted", FLEET_TEMPLATE_NAME);
    snprintf(rejected, sizeof rejected, "$aws/provisioning-templates/%s/provision/json/rejected", FLEET_TEMPLATE_NAME);
    esp_mqtt_client_subscribe(s_state.client, accepted, 1);
    esp_mqtt_client_subscribe(s_state.client, rejected, 1);
    esp_mqtt_client_publish(s_state.client, topic, payload, 0, 1, 0);
    ESP_LOGI(TAG, "Submitted Fleet Provisioning register request");
}

static bool copy_json_string(cJSON *root, const char *name, char *out, size_t out_size)
{
    cJSON *item = cJSON_GetObjectItemCaseSensitive(root, name);
    if (!cJSON_IsString(item) || !item->valuestring) return false;
    strlcpy(out, item->valuestring, out_size);
    return true;
}

static void handle_create_accepted(const char *payload, int payload_len)
{
    char *text = malloc(payload_len + 1);
    if (!text) {
        xEventGroupSetBits(s_state.group, BIT_FAILED);
        return;
    }
    memcpy(text, payload, payload_len);
    text[payload_len] = '\0';

    cJSON *root = cJSON_Parse(text);
    free(text);
    if (!root) {
        ESP_LOGE(TAG, "Create certificate response was not JSON");
        xEventGroupSetBits(s_state.group, BIT_FAILED);
        return;
    }

    bool ok = copy_json_string(root, "certificatePem", s_state.certificate, sizeof s_state.certificate) &&
              copy_json_string(root, "privateKey", s_state.private_key, sizeof s_state.private_key) &&
              copy_json_string(root, "certificateOwnershipToken", s_state.ownership_token, sizeof s_state.ownership_token);
    cJSON_Delete(root);

    if (!ok) {
        ESP_LOGE(TAG, "Create certificate response missing certificate/key/token");
        xEventGroupSetBits(s_state.group, BIT_FAILED);
        return;
    }

    ESP_LOGI(TAG, "Received permanent certificate and ownership token");
    publish_register_thing();
}

static void handle_register_accepted(void)
{
    if (cert_store_save(s_state.certificate, s_state.private_key)) {
        ESP_LOGI(TAG, "Fleet Provisioning complete");
        xEventGroupSetBits(s_state.group, BIT_DONE);
    } else {
        ESP_LOGE(TAG, "Failed to save permanent certificate");
        xEventGroupSetBits(s_state.group, BIT_FAILED);
    }
}

static void fleet_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data)
{
    esp_mqtt_event_handle_t event = (esp_mqtt_event_handle_t) event_data;

    switch ((esp_mqtt_event_id_t) event_id) {
    case MQTT_EVENT_CONNECTED:
        ESP_LOGI(TAG, "Claim MQTT connected");
        publish_create_certificate();
        break;
    case MQTT_EVENT_DATA: {
        if (event->current_data_offset == 0) {
            memset(s_state.rx_topic, 0, sizeof s_state.rx_topic);
            memset(s_state.rx_payload, 0, sizeof s_state.rx_payload);
            s_state.rx_received = 0;
            s_state.rx_expected = event->total_data_len;

            int topic_len = event->topic_len < (int)sizeof(s_state.rx_topic) - 1
                          ? event->topic_len
                          : (int)sizeof(s_state.rx_topic) - 1;
            memcpy(s_state.rx_topic, event->topic, topic_len);
            ESP_LOGI(TAG, "MQTT data topic=%s total=%d", s_state.rx_topic, s_state.rx_expected);
        }

        if (event->current_data_offset + event->data_len >= FLEET_RX_MAX) {
            ESP_LOGE(TAG, "Fleet response too large: offset=%d len=%d max=%d",
                     event->current_data_offset, event->data_len, FLEET_RX_MAX);
            xEventGroupSetBits(s_state.group, BIT_FAILED);
            break;
        }

        memcpy(s_state.rx_payload + event->current_data_offset, event->data, event->data_len);
        s_state.rx_received += event->data_len;

        if (s_state.rx_received < s_state.rx_expected) {
            ESP_LOGI(TAG, "MQTT chunk %d/%d", s_state.rx_received, s_state.rx_expected);
            break;
        }

        if (strstr(s_state.rx_topic, "/rejected")) {
            ESP_LOGE(TAG, "Fleet Provisioning rejected: %.*s", s_state.rx_expected, s_state.rx_payload);
            xEventGroupSetBits(s_state.group, BIT_FAILED);
        } else if (strcmp(s_state.rx_topic, "$aws/certificates/create/json/accepted") == 0) {
            handle_create_accepted(s_state.rx_payload, s_state.rx_expected);
        } else if (strstr(s_state.rx_topic, "/provision/json/accepted")) {
            handle_register_accepted();
        }
        break;
    }
    case MQTT_EVENT_ERROR:
        ESP_LOGE(TAG, "Claim MQTT error");
        break;
    default:
        break;
    }
}

bool fleet_provisioning_ensure_identity(const device_config_t *config)
{
    if (cert_store_has_device_identity()) {
        ESP_LOGI(TAG, "Permanent certificate already exists");
        return true;
    }

    memset(&s_state, 0, sizeof s_state);
    s_state.group = xEventGroupCreate();
    s_state.config = config;
    mac_string(s_state.serial, sizeof s_state.serial);

    ESP_LOGW(TAG, "No permanent certificate. Starting Fleet Provisioning by claim.");

    esp_mqtt_client_config_t mqtt_cfg = {
        .broker = {
            .address = { .uri = AWS_ENDPOINT_URI, .port = AWS_ENDPOINT_PORT },
            .verification = { .certificate = (const char *) aws_root_ca_pem_start },
        },
        .credentials = {
            .client_id = s_state.serial,
            .authentication = {
                .certificate = (const char *) claim_cert_pem_start,
                .key = (const char *) claim_key_pem_start,
            },
        },
        .network = { .timeout_ms = 10000, .reconnect_timeout_ms = 10000 },
        .buffer = { .size = 8192, .out_size = 4096 },
    };

    s_state.client = esp_mqtt_client_init(&mqtt_cfg);
    if (!s_state.client) {
        ESP_LOGE(TAG, "Claim MQTT init failed");
        vEventGroupDelete(s_state.group);
        return false;
    }

    esp_mqtt_client_register_event(s_state.client, ESP_EVENT_ANY_ID, fleet_event_handler, NULL);
    esp_mqtt_client_start(s_state.client);

    EventBits_t bits = xEventGroupWaitBits(
        s_state.group,
        BIT_DONE | BIT_FAILED,
        pdFALSE,
        pdFALSE,
        pdMS_TO_TICKS(90000));

    esp_mqtt_client_stop(s_state.client);
    esp_mqtt_client_destroy(s_state.client);
    vEventGroupDelete(s_state.group);

    if (bits & BIT_DONE) return true;
    ESP_LOGE(TAG, "Fleet Provisioning timed out or failed");
    return false;
}
