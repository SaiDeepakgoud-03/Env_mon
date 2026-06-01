/*
 * wifi.c
 *
 * Wi-Fi station-mode helper for the application loop.
 * Reads SSID / password from the NVS config_store on every call.
 */

#include <string.h>
#include <stdbool.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"

#include "esp_system.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"

#include "config_store.h"
#include "wifi.h"

#define WIFI_MAX_RETRY        50

static const char *TAG = "WIFI";
static EventGroupHandle_t s_grp;
static int s_retry = 0;

#define BIT_CONNECTED   BIT0
#define BIT_FAILED      BIT1

static void on_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
        return;
    }
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        if (++s_retry < WIFI_MAX_RETRY) {
            ESP_LOGW(TAG, "Disconnected. Retry %d/%d", s_retry, WIFI_MAX_RETRY);
            esp_wifi_connect();
        } else {
            xEventGroupSetBits(s_grp, BIT_FAILED);
        }
        return;
    }
    if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *e = data;
        ESP_LOGI(TAG, "Got IP: " IPSTR, IP2STR(&e->ip_info.ip));
        s_retry = 0;
        xEventGroupSetBits(s_grp, BIT_CONNECTED);
    }
}

bool wifi_connect_with_saved_credentials(void)
{
    device_config_t cfg;
    if (!config_store_load(&cfg) || cfg.wifi_ssid[0] == '\0') {
        ESP_LOGE(TAG, "No SSID configured in NVS");
        return false;
    }

    /* Netif and default loop are already up because the provisioning
     * step earlier in boot created them. If not (cold path), bring up. */
    static bool s_netif_inited = false;
    if (!s_netif_inited) {
        esp_netif_init();
        esp_event_loop_create_default();
        esp_netif_create_default_wifi_sta();
        wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
        esp_wifi_init(&init);
        s_netif_inited = true;
    }

    s_grp = xEventGroupCreate();

    esp_event_handler_instance_t any_id, got_ip;
    esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                        &on_event, NULL, &any_id);
    esp_event_handler_instance_register(IP_EVENT,   IP_EVENT_STA_GOT_IP,
                                        &on_event, NULL, &got_ip);

    wifi_config_t wifi_cfg = {0};
    strncpy((char *)wifi_cfg.sta.ssid,     cfg.wifi_ssid, sizeof wifi_cfg.sta.ssid);
    strncpy((char *)wifi_cfg.sta.password, cfg.wifi_pass, sizeof wifi_cfg.sta.password);
    wifi_cfg.sta.threshold.authmode = WIFI_AUTH_OPEN;   /* accept any auth mode */

    esp_wifi_set_mode(WIFI_MODE_STA);
    esp_wifi_set_config(WIFI_IF_STA, &wifi_cfg);
    esp_wifi_start();
    esp_wifi_set_ps(WIFI_PS_NONE);

    ESP_LOGI(TAG, "Connecting to SSID \"%s\" ...", cfg.wifi_ssid);

    EventBits_t bits = xEventGroupWaitBits(
        s_grp, BIT_CONNECTED | BIT_FAILED,
        pdFALSE, pdFALSE, portMAX_DELAY);

    return (bits & BIT_CONNECTED) != 0;
}

void wifi_connection(void)
{
    if (!wifi_connect_with_saved_credentials()) {
        ESP_LOGE(TAG, "Wi-Fi failed - rebooting into provisioning");
        config_store_erase();    /* force provisioning on next boot */
        vTaskDelay(pdMS_TO_TICKS(1000));
        esp_restart();
    }
}
