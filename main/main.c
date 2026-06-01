/*
 * main.c
 *
 * Industrial Environment Monitoring System  (Phase A - captive portal)
 * Target board : ESP32 Dev Board
 * Framework    : ESP-IDF v6.x
 *
 * Boot logic:
 *   1. Initialise NVS.
 *   2. Check GPIO 0 (BOOT button) - if held LOW > 5 s, wipe config.
 *   3. If no config in NVS  -> run provisioning (soft-AP captive portal).
 *      If config exists     -> connect to saved Wi-Fi and run sensor loop.
 *
 * Sensors:
 *   DHT11        -> GPIO 4   (digital)
 *   Flame sensor -> GPIO 5   (digital, active-LOW)
 *   MQ135        -> GPIO 34  (ADC1 ch 6, oneshot)
 *
 * Cloud:
 *   MQTT  -> mqtts://a2aazipzc1zlp2-ats.iot.us-east-1.amazonaws.com:8883
 *   HTTPS -> POST /prod/sensor-data       sensor reading
 *   HTTPS -> POST /prod/devices/register  registration / heartbeat
 *
 * Every payload includes device_id + location attributes loaded from
 * NVS, so a single firmware binary works for 1000 boards.
 */

#include <stdio.h>
#include <string.h>
#include <inttypes.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"

#include "esp_system.h"
#include "esp_mac.h"
#include "esp_log.h"
#include "esp_err.h"
#include "esp_timer.h"

#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"

#include "mqtt_client.h"
#include "esp_http_client.h"
#include "esp_tls.h"
#include "esp_crt_bundle.h"

#include "driver/gpio.h"
#include "esp_adc/adc_oneshot.h"

#include "dht.h"

#include "config_store.h"
#include "cert_store.h"
#include "fleet_provisioning.h"
#include "ota_manager.h"
#include "shadow_manager.h"
#include "provisioning.h"
#include "wifi.h"

/* ================================================================== */
/*  CONFIGURATION                                                      */
/* ================================================================== */

#define AWS_ENDPOINT_URI    "mqtts://a2aazipzc1zlp2-ats.iot.us-east-1.amazonaws.com"
#define AWS_ENDPOINT_PORT   8883
#define MQTT_TOPIC_FMT      "env/%s/telemetry"

#define API_BASE            "https://tzh11a7qtc.execute-api.us-east-1.amazonaws.com/prod"
#define API_DATA_URL        (API_BASE "/sensor-data")
#define API_DEVICES_URL     (API_BASE "/devices/register")

#define FW_VERSION          "1.2.0-captive"

#define DHT_GPIO            GPIO_NUM_4
#define FIRE_GPIO           GPIO_NUM_5
#define DHT_TYPE            DHT_TYPE_DHT11
#define MQ135_ADC_UNIT      ADC_UNIT_1
#define MQ135_CHANNEL       ADC_CHANNEL_6

#define RESET_BUTTON_GPIO   GPIO_NUM_0   /* BOOT button on most boards */
#define RESET_HOLD_MS       5000

#define SAMPLE_PERIOD_MS         2000
#define REGISTRATION_PERIOD_MS   (5 * 60 * 1000)

/* ================================================================== */
/*  EMBEDDED CERTIFICATES                                              */
/* ================================================================== */

extern const uint8_t aws_root_ca_pem_start[]   asm("_binary_AmazonRootCA1_pem_start");
extern const uint8_t aws_root_ca_pem_end[]     asm("_binary_AmazonRootCA1_pem_end");

/* ================================================================== */
/*  GLOBAL STATE                                                       */
/* ================================================================== */

static const char *TAG = "ENV_MONITOR";

static esp_mqtt_client_handle_t  s_mqtt_client = NULL;
static adc_oneshot_unit_handle_t s_adc_handle  = NULL;
static bool                      s_mqtt_ready  = false;
static int64_t                   s_last_register_ms = 0;

/* Loaded from NVS at start of run_app_mode() */
static device_config_t           s_cfg;
static char                      s_device_cert[CERT_STORE_CERT_MAX];
static char                      s_device_key[CERT_STORE_KEY_MAX];

static char                      s_ip_str[16]  = {0};
static int8_t                    s_rssi        = 0;

/* Cached most-recent sensor reads so the fast flame task can include
 * them in its immediate publish without re-running the slow DHT11.   */
static float                     s_last_temp   = 0.0f;
static float                     s_last_hum    = 0.0f;
static int                       s_last_aq     = 0;

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

static void refresh_network_info(void)
{
    esp_netif_t *netif = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
    esp_netif_ip_info_t ip = {0};
    if (netif && esp_netif_get_ip_info(netif, &ip) == ESP_OK) {
        snprintf(s_ip_str, sizeof s_ip_str, IPSTR, IP2STR(&ip.ip));
    }
    wifi_ap_record_t ap = {0};
    if (esp_wifi_sta_get_ap_info(&ap) == ESP_OK) {
        s_rssi = ap.rssi;
    }
}

/* Check if BOOT button held > RESET_HOLD_MS during early boot */
static bool reset_button_held(void)
{
    gpio_config_t in = {
        .pin_bit_mask = 1ULL << RESET_BUTTON_GPIO,
        .mode         = GPIO_MODE_INPUT,
        .pull_up_en   = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type    = GPIO_INTR_DISABLE,
    };
    gpio_config(&in);

    if (gpio_get_level(RESET_BUTTON_GPIO) != 0) return false;

    ESP_LOGW(TAG, "BOOT button held - keep holding for %d ms to wipe config",
             RESET_HOLD_MS);

    int64_t t0 = esp_timer_get_time() / 1000;
    while (gpio_get_level(RESET_BUTTON_GPIO) == 0) {
        if ((esp_timer_get_time() / 1000) - t0 >= RESET_HOLD_MS) return true;
        vTaskDelay(pdMS_TO_TICKS(100));
    }
    return false;
}

/* ================================================================== */
/*  HTTPS helpers                                                      */
/* ================================================================== */

static esp_err_t https_event_handler(esp_http_client_event_t *evt)
{
    if (evt->event_id == HTTP_EVENT_ON_DATA &&
        !esp_http_client_is_chunked_response(evt->client)) {
        ESP_LOGD(TAG, "[API] %.*s", evt->data_len, (char *) evt->data);
    }
    return ESP_OK;
}

static int https_post_json(const char *url, const char *json, const char *tag)
{
    esp_http_client_config_t config = {
        .url               = url,
        .method            = HTTP_METHOD_POST,
        .transport_type    = HTTP_TRANSPORT_OVER_SSL,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .timeout_ms        = 10000,
        .event_handler     = https_event_handler,
    };
    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (!client) return -1;
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_post_field(client, json, strlen(json));

    int status = -1;
    esp_err_t err = esp_http_client_perform(client);
    if (err == ESP_OK) {
        status = esp_http_client_get_status_code(client);
        if (status >= 200 && status < 300) {
            ESP_LOGI(TAG, "[%s] OK (HTTP %d)", tag, status);
        } else {
            ESP_LOGW(TAG, "[%s] HTTP %d", tag, status);
        }
    } else {
        ESP_LOGE(TAG, "[%s] POST failed: %s", tag, esp_err_to_name(err));
    }
    esp_http_client_cleanup(client);
    return status;
}

/* ------------------------------------------------------------------ */
/*  Registration (with location)                                       */
/* ------------------------------------------------------------------ */

static void send_registration(void)
{
    refresh_network_info();

    char body[768];
    snprintf(body, sizeof body,
        "{"
        "\"device_id\":\"%s\","
        "\"mac\":\"\","
        "\"ip\":\"%s\","
        "\"ssid\":\"%s\","
        "\"rssi\":%d,"
        "\"fw_version\":\"%s\","
        "\"cert_status\":\"ACTIVE\","
        "\"latitude\":%s,"
        "\"longitude\":%s,"
        "\"location\":{"
        "\"place\":\"%s\","
        "\"landmark\":\"%s\","
        "\"district\":\"%s\","
        "\"state\":\"%s\","
        "\"country\":\"%s\","
        "\"latitude\":\"%s\","
        "\"longitude\":\"%s\"}"
        "}",
        s_cfg.device_id,
        s_ip_str,
        s_cfg.wifi_ssid,
        s_rssi,
        FW_VERSION,
        s_cfg.latitude[0]  ? s_cfg.latitude  : "null",
        s_cfg.longitude[0] ? s_cfg.longitude : "null",
        s_cfg.place, s_cfg.landmark, s_cfg.district, s_cfg.state, s_cfg.country,
        s_cfg.latitude, s_cfg.longitude);

    /* Inject MAC into the body before sending */
    uint8_t mac[6] = {0};
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    char mac_str[18];
    snprintf(mac_str, sizeof mac_str, "%02X:%02X:%02X:%02X:%02X:%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    char *placeholder = strstr(body, "\"mac\":\"\"");
    if (placeholder) {
        /* Replace empty mac with real one - safe because room left */
        char tmp[820];
        size_t prefix_len = placeholder - body + strlen("\"mac\":\"");
        memcpy(tmp, body, prefix_len);
        size_t off = prefix_len;
        for (size_t i = 0; i < strlen(mac_str); i++) tmp[off++] = mac_str[i];
        const char *suffix = placeholder + strlen("\"mac\":\"\"");
        size_t suffix_len = strlen(suffix);
        if (off + suffix_len + 2 < sizeof tmp) {
            tmp[off++] = '"';
            memcpy(tmp + off, suffix, suffix_len + 1);
            strncpy(body, tmp, sizeof body - 1);
            body[sizeof body - 1] = '\0';
        }
    }

    ESP_LOGI(TAG, "[REG] %s", body);
    https_post_json(API_DEVICES_URL, body, "REG");
    s_last_register_ms = esp_timer_get_time() / 1000;
}

/* ================================================================== */
/*  MQTT                                                               */
/* ================================================================== */

static void mqtt_event_handler(void *handler_args,
                               esp_event_base_t base,
                               int32_t event_id,
                               void *event_data)
{
    esp_mqtt_event_handle_t event = (esp_mqtt_event_handle_t) event_data;

    switch ((esp_mqtt_event_id_t) event_id) {
    case MQTT_EVENT_CONNECTED:
        s_mqtt_ready = true;
        ESP_LOGI(TAG, "[MQTT] Connected");
        ota_manager_subscribe(s_mqtt_client, s_cfg.device_id);
        shadow_manager_subscribe(s_mqtt_client, s_cfg.device_id);
        shadow_manager_report(s_mqtt_client, s_cfg.device_id, FW_VERSION, s_rssi);
        break;
    case MQTT_EVENT_DISCONNECTED:
        s_mqtt_ready = false;
        ESP_LOGW(TAG, "[MQTT] Disconnected");
        break;
    case MQTT_EVENT_PUBLISHED:
        ESP_LOGI(TAG, "[MQTT] Publish ack (msg_id=%d)", event->msg_id);
        break;
    case MQTT_EVENT_ERROR:
        ESP_LOGE(TAG, "[MQTT] ERROR");
        break;
    case MQTT_EVENT_DATA:
        ota_manager_handle_message(event->topic, event->topic_len, event->data, event->data_len);
        break;
    default: break;
    }
}

static void mqtt_start(void)
{
    const esp_mqtt_client_config_t mqtt_cfg = {
        .broker = {
            .address = { .uri = AWS_ENDPOINT_URI, .port = AWS_ENDPOINT_PORT },
            .verification = { .certificate = (const char *) aws_root_ca_pem_start },
        },
        .credentials = {
            .client_id = s_cfg.device_id,
            .authentication = {
                .certificate = s_device_cert,
                .key         = s_device_key,
            },
        },
        .network = { .timeout_ms = 10000, .reconnect_timeout_ms = 10000 },
        .session = { .keepalive = 60 },
    };
    s_mqtt_client = esp_mqtt_client_init(&mqtt_cfg);
    if (!s_mqtt_client) { ESP_LOGE(TAG, "[MQTT] init failed"); return; }
    esp_mqtt_client_register_event(s_mqtt_client, ESP_EVENT_ANY_ID,
                                   mqtt_event_handler, NULL);
    esp_mqtt_client_start(s_mqtt_client);
}

/* ================================================================== */
/*  Sensors                                                            */
/* ================================================================== */

static void sensors_init(void)
{
    adc_oneshot_unit_init_cfg_t init_cfg = { .unit_id = MQ135_ADC_UNIT };
    ESP_ERROR_CHECK(adc_oneshot_new_unit(&init_cfg, &s_adc_handle));

    adc_oneshot_chan_cfg_t chan_cfg = {
        .bitwidth = ADC_BITWIDTH_DEFAULT,
        .atten    = ADC_ATTEN_DB_12,
    };
    ESP_ERROR_CHECK(adc_oneshot_config_channel(s_adc_handle, MQ135_CHANNEL, &chan_cfg));

    gpio_config_t fire_cfg = {
        .pin_bit_mask = 1ULL << FIRE_GPIO,
        .mode         = GPIO_MODE_INPUT,
        .pull_up_en   = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type    = GPIO_INTR_DISABLE,
    };
    ESP_ERROR_CHECK(gpio_config(&fire_cfg));
}

/* ================================================================== */
/*  Fast flame task                                                    */
/* ================================================================== */
/*  Polls the flame sensor at 10 Hz, completely independent of the     */
/*  slow 2-second sensor cycle. When fire state CHANGES (clear -> fire */
/*  or fire -> clear) it immediately publishes an MQTT message with    */
/*  the cached sensor values + an event marker.                        */
/*                                                                     */
/*  Dashboard MQTT subscriber sees it in roughly:                      */
/*     transition + 100 ms (poll)  +  ~50 ms broker hop                */
/*     ~= 150 ms                                                       */
/*                                                                     */
/*  Compared to the old path (wait for next 2 s cycle + HTTPS + TLS)   */
/*  this is roughly 20-30x faster.                                     */
/* ================================================================== */

static void flame_monitor_task(void *arg)
{
    int last_state = gpio_get_level(FIRE_GPIO);
    ESP_LOGI(TAG, "[FLAME] fast-path task running (initial=%s)",
             last_state == 0 ? "DETECTED" : "clear");

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(100));    /* 10 Hz */

        int now_state = gpio_get_level(FIRE_GPIO);
        if (now_state == last_state) continue;

        /* Debounce: confirm the change after one more sample */
        vTaskDelay(pdMS_TO_TICKS(50));
        int confirm = gpio_get_level(FIRE_GPIO);
        if (confirm != now_state) continue;

        last_state = now_state;
        int fire_detected = (now_state == 0) ? 1 : 0;

        ESP_LOGW(TAG, "*** FLAME TRANSITION: %s *** publishing immediately",
                 fire_detected ? "DETECTED" : "cleared");

        char json[256];
        snprintf(json, sizeof json,
            "{\"device_id\":\"%s\","
            "\"temperature\":%.2f,\"humidity\":%.2f,"
            "\"air_quality\":%d,\"fire\":%d,"
            "\"event\":\"flame_transition\"}",
            s_cfg.device_id,
            s_last_temp, s_last_hum, s_last_aq, fire_detected);

        if (s_mqtt_ready && s_mqtt_client) {
            char topic[96];
            snprintf(topic, sizeof topic, MQTT_TOPIC_FMT, s_cfg.device_id);
            /* QoS 1, retain=0 - MQTT publish is documented thread-safe */
            esp_mqtt_client_publish(s_mqtt_client, topic, json, 0, 1, 0);
        }
        /* HTTPS POST is intentionally NOT sent here. The 2-second cycle
         * will pick up the new fire state on its next tick and POST it.
         * Skipping the slow TLS handshake here keeps fire-to-dashboard
         * latency under ~200 ms.                                       */
    }
}

/* ================================================================== */
/*  Application mode (provisioned)                                     */
/* ================================================================== */

static void run_app_mode(void)
{
    if (!config_store_load(&s_cfg)) {
        ESP_LOGE(TAG, "No config - this shouldn't happen");
        return;
    }

    ESP_LOGI(TAG, "Device: %s @ %s, %s, %s, %s",
             s_cfg.device_id, s_cfg.place, s_cfg.district, s_cfg.state, s_cfg.country);

    wifi_connection();
    refresh_network_info();

    if (!cert_store_load(s_device_cert, sizeof s_device_cert,
                         s_device_key, sizeof s_device_key)) {
        if (!fleet_provisioning_ensure_identity(&s_cfg)) {
            ESP_LOGE(TAG, "Fleet provisioning did not complete. Rebooting.");
            vTaskDelay(pdMS_TO_TICKS(5000));
            esp_restart();
        }
        cert_store_load(s_device_cert, sizeof s_device_cert,
                        s_device_key, sizeof s_device_key);
    }

    ESP_LOGI(TAG, "Network: ip=%s ssid=%s rssi=%d dBm",
             s_ip_str, s_cfg.wifi_ssid, s_rssi);

    send_registration();
    mqtt_start();
    sensors_init();

    /* Fast flame fast-path - publishes on transition without waiting
     * for the slow sensor / HTTPS cycle.                              */
    xTaskCreate(flame_monitor_task, "flame", 4096, NULL, 6, NULL);

    while (1) {
        float temperature = 0.0f, humidity = 0.0f;
        int   mq135_raw   = 0;

        if (dht_read_float_data(DHT_TYPE, DHT_GPIO,
                                &humidity, &temperature) != ESP_OK) {
            ESP_LOGE(TAG, "DHT11 read failed");
        }
        if (adc_oneshot_read(s_adc_handle, MQ135_CHANNEL, &mq135_raw) != ESP_OK) {
            mq135_raw = 0;
        }
        int air_quality   = (mq135_raw * 500) / 4095;
        int fire_detected = (gpio_get_level(FIRE_GPIO) == 0) ? 1 : 0;

        /* Cache the latest readings for the fast flame task */
        s_last_temp = temperature;
        s_last_hum  = humidity;
        s_last_aq   = air_quality;

        char json_data[256];
        snprintf(json_data, sizeof json_data,
                 "{\"device_id\":\"%s\","
                 "\"temperature\":%.2f,\"humidity\":%.2f,"
                 "\"air_quality\":%d,\"fire\":%d}",
                 s_cfg.device_id,
                 temperature, humidity, air_quality, fire_detected);

        ESP_LOGI(TAG, "[%s] T=%.2f H=%.2f AQ=%d Fire=%s",
                 s_cfg.device_id, temperature, humidity, air_quality,
                 fire_detected ? "DETECTED" : "clear");

        if (s_mqtt_ready && s_mqtt_client) {
            char topic[96];
            snprintf(topic, sizeof topic, MQTT_TOPIC_FMT, s_cfg.device_id);
            esp_mqtt_client_publish(s_mqtt_client, topic,
                                    json_data, 0, 1, 0);
        }

        https_post_json(API_DATA_URL, json_data, "API");

        int64_t now = esp_timer_get_time() / 1000;
        if (now - s_last_register_ms >= REGISTRATION_PERIOD_MS) {
            send_registration();
        }

        vTaskDelay(pdMS_TO_TICKS(SAMPLE_PERIOD_MS));
    }
}

/* ================================================================== */
/*  Boot                                                               */
/* ================================================================== */

void app_main(void)
{
    ESP_LOGI(TAG, "==============================================");
    ESP_LOGI(TAG, " Industrial Environment Monitor               ");
    ESP_LOGI(TAG, " Phase A - captive-portal provisioning        ");
    ESP_LOGI(TAG, " ESP-IDF v6.x  -  fw %s", FW_VERSION);
    ESP_LOGI(TAG, "==============================================");

    /* 1) NVS - everything else depends on it */
    config_store_init();

    /* 2) BOOT button - hold > 5 s to wipe config */
    if (reset_button_held()) {
        ESP_LOGW(TAG, "*** Factory reset triggered ***");
        config_store_erase();
        vTaskDelay(pdMS_TO_TICKS(500));
        esp_restart();
    }

    /* 3) Provisioning vs application */
    if (!config_store_has_config()) {
        ESP_LOGW(TAG, "No saved config - entering provisioning mode");
        provisioning_run();          /* does not return */
    }

    run_app_mode();                  /* infinite sensor loop */
}
