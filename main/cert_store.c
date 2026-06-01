#include <string.h>
#include "esp_log.h"
#include "nvs.h"
#include "cert_store.h"

static const char *TAG = "CERT_STORE";
static const char *NS = "envmon_cert";

static bool read_str(nvs_handle_t handle, const char *key, char *dst, size_t dst_size)
{
    size_t length = dst_size;
    esp_err_t err = nvs_get_str(handle, key, dst, &length);
    if (err != ESP_OK) {
        dst[0] = '\0';
        return false;
    }
    return true;
}

bool cert_store_has_device_identity(void)
{
    nvs_handle_t handle;
    if (nvs_open(NS, NVS_READONLY, &handle) != ESP_OK) return false;
    char probe[16] = {0};
    bool ok = read_str(handle, "cert", probe, sizeof probe);
    nvs_close(handle);
    return ok;
}

bool cert_store_load(char *certificate, size_t certificate_size, char *private_key, size_t private_key_size)
{
    nvs_handle_t handle;
    if (nvs_open(NS, NVS_READONLY, &handle) != ESP_OK) return false;

    bool ok = read_str(handle, "cert", certificate, certificate_size) &&
              read_str(handle, "key", private_key, private_key_size);
    nvs_close(handle);
    ESP_LOGI(TAG, "Permanent device identity %s", ok ? "loaded" : "missing");
    return ok;
}

bool cert_store_save(const char *certificate, const char *private_key)
{
    nvs_handle_t handle;
    if (nvs_open(NS, NVS_READWRITE, &handle) != ESP_OK) return false;

    esp_err_t err = nvs_set_str(handle, "cert", certificate);
    if (err == ESP_OK) err = nvs_set_str(handle, "key", private_key);
    if (err == ESP_OK) err = nvs_commit(handle);
    nvs_close(handle);

    ESP_LOGI(TAG, "Permanent device identity save %s", err == ESP_OK ? "OK" : "FAILED");
    return err == ESP_OK;
}

bool cert_store_erase(void)
{
    nvs_handle_t handle;
    if (nvs_open(NS, NVS_READWRITE, &handle) != ESP_OK) return false;
    esp_err_t err = nvs_erase_all(handle);
    if (err == ESP_OK) err = nvs_commit(handle);
    nvs_close(handle);
    return err == ESP_OK;
}
