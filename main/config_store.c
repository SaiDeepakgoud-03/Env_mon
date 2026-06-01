/*
 * config_store.c
 *
 * NVS-backed implementation of the device configuration store.
 */

#include <string.h>
#include <stdio.h>

#include "esp_log.h"
#include "esp_mac.h"
#include "esp_err.h"
#include "nvs.h"
#include "nvs_flash.h"

#include "config_store.h"

static const char *TAG       = "CFG";
static const char *NS        = "envmon";

/* Cached identifiers derived from MAC */
static char s_default_id[CFG_DEVICE_ID_MAX] = {0};
static char s_short_id[8] = {0};

/* ------------------------------------------------------------------ */

static void compute_identifiers(void)
{
    if (s_default_id[0] != '\0') return;

    uint8_t mac[6] = {0};
    if (esp_read_mac(mac, ESP_MAC_WIFI_STA) != ESP_OK) {
        strcpy(s_default_id, "env_0000");
        strcpy(s_short_id,   "0000");
        return;
    }

    snprintf(s_default_id, sizeof s_default_id,
             "env_%02X%02X", mac[4], mac[5]);
    snprintf(s_short_id,   sizeof s_short_id,
             "%02X%02X", mac[4], mac[5]);
}

const char *config_store_default_device_id(void)
{
    compute_identifiers();
    return s_default_id;
}

const char *config_store_short_id(void)
{
    compute_identifiers();
    return s_short_id;
}

/* ------------------------------------------------------------------ */

int config_store_init(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES ||
        err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "NVS needs to be erased before re-init");
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    return err;
}

/* ------------------------------------------------------------------ */

static bool read_str(nvs_handle_t h, const char *key,
                     char *dst, size_t dst_sz)
{
    size_t len = dst_sz;
    if (nvs_get_str(h, key, dst, &len) == ESP_OK) {
        return true;
    }
    dst[0] = '\0';
    return false;
}

bool config_store_load(device_config_t *out)
{
    if (!out) return false;
    memset(out, 0, sizeof *out);

    nvs_handle_t h;
    if (nvs_open(NS, NVS_READONLY, &h) != ESP_OK) {
        return false;
    }

    read_str(h, "device_id", out->device_id, sizeof out->device_id);
    read_str(h, "ssid",      out->wifi_ssid, sizeof out->wifi_ssid);
    read_str(h, "pass",      out->wifi_pass, sizeof out->wifi_pass);
    read_str(h, "place",     out->place,     sizeof out->place);
    read_str(h, "landmark",  out->landmark,  sizeof out->landmark);
    read_str(h, "district",  out->district,  sizeof out->district);
    read_str(h, "state",     out->state,     sizeof out->state);
    read_str(h, "country",   out->country,   sizeof out->country);
    read_str(h, "lat",       out->latitude,  sizeof out->latitude);
    read_str(h, "lng",       out->longitude, sizeof out->longitude);

    nvs_close(h);

    /* Fallback: empty device_id -> use MAC-derived default */
    if (out->device_id[0] == '\0') {
        strncpy(out->device_id, config_store_default_device_id(),
                sizeof out->device_id - 1);
    }

    bool ok = out->wifi_ssid[0] != '\0';   /* must at least have SSID */
    ESP_LOGI(TAG, "Loaded config: %s (device_id=%s)",
             ok ? "OK" : "incomplete", out->device_id);
    return ok;
}

/* ------------------------------------------------------------------ */

bool config_store_save(const device_config_t *in)
{
    if (!in) return false;

    nvs_handle_t h;
    if (nvs_open(NS, NVS_READWRITE, &h) != ESP_OK) return false;

    esp_err_t err = ESP_OK;
    err |= nvs_set_str(h, "device_id", in->device_id);
    err |= nvs_set_str(h, "ssid",      in->wifi_ssid);
    err |= nvs_set_str(h, "pass",      in->wifi_pass);
    err |= nvs_set_str(h, "place",     in->place);
    err |= nvs_set_str(h, "landmark",  in->landmark);
    err |= nvs_set_str(h, "district",  in->district);
    err |= nvs_set_str(h, "state",     in->state);
    err |= nvs_set_str(h, "country",   in->country);
    err |= nvs_set_str(h, "lat",       in->latitude);
    err |= nvs_set_str(h, "lng",       in->longitude);

    if (err == ESP_OK) err = nvs_commit(h);
    nvs_close(h);

    if (err == ESP_OK) {
        ESP_LOGI(TAG, "Config saved (device_id=%s ssid=%s place=%s)",
                 in->device_id, in->wifi_ssid, in->place);
        return true;
    }
    ESP_LOGE(TAG, "Config save failed: 0x%x", err);
    return false;
}

/* ------------------------------------------------------------------ */

bool config_store_erase(void)
{
    nvs_handle_t h;
    if (nvs_open(NS, NVS_READWRITE, &h) != ESP_OK) return false;
    esp_err_t err = nvs_erase_all(h);
    if (err == ESP_OK) err = nvs_commit(h);
    nvs_close(h);
    ESP_LOGW(TAG, "Config erased (return to provisioning on next boot)");
    return err == ESP_OK;
}

bool config_store_has_config(void)
{
    device_config_t tmp;
    return config_store_load(&tmp);
}
