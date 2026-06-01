/*
 * config_store.h
 *
 * Persistent device configuration (in NVS flash).
 *
 * The provisioning module writes here when the user submits the
 * captive portal form. The normal application reads from here on
 * boot to decide whether to enter provisioning mode or run the
 * sensor loop, and to fetch Wi-Fi credentials + location metadata.
 *
 * Reset behaviour:
 *   - GPIO 0 (BOOT button on most ESP32 dev boards) held LOW for
 *     >5 seconds at boot will wipe the config and force the device
 *     back into provisioning mode.
 *   - config_store_erase() can be called from any code path.
 */

#ifndef CONFIG_STORE_H
#define CONFIG_STORE_H

#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Field length budgets (bytes including \0) */
#define CFG_DEVICE_ID_MAX     32
#define CFG_SSID_MAX          33   /* 802.11 SSID is up to 32 chars */
#define CFG_PASSPHRASE_MAX    65   /* WPA2 is up to 64 chars        */
#define CFG_PLACE_MAX         64
#define CFG_LANDMARK_MAX      64
#define CFG_DISTRICT_MAX      48
#define CFG_STATE_MAX         48
#define CFG_COUNTRY_MAX       32
#define CFG_GEO_MAX           24   /* string form of float, e.g. "17.5325002" */

typedef struct {
    char device_id  [CFG_DEVICE_ID_MAX];
    char wifi_ssid  [CFG_SSID_MAX];
    char wifi_pass  [CFG_PASSPHRASE_MAX];
    char place      [CFG_PLACE_MAX];
    char landmark   [CFG_LANDMARK_MAX];
    char district   [CFG_DISTRICT_MAX];
    char state      [CFG_STATE_MAX];
    char country    [CFG_COUNTRY_MAX];
    char latitude   [CFG_GEO_MAX];     /* optional, decimal-degree string */
    char longitude  [CFG_GEO_MAX];     /* optional, decimal-degree string */
} device_config_t;

/**
 * @brief Initialise NVS partition. Safe to call multiple times.
 *        Returns ESP_OK on success.
 */
int config_store_init(void);

/**
 * @brief Load saved configuration into *out.
 * @return true if a complete (at minimum SSID set) config was found.
 *         false if nothing has been provisioned yet.
 */
bool config_store_load(device_config_t *out);

/**
 * @brief Persist the given configuration. Overwrites any existing.
 * @return true on success.
 */
bool config_store_save(const device_config_t *in);

/**
 * @brief Wipe stored configuration entirely (back to provisioning).
 * @return true on success.
 */
bool config_store_erase(void);

/**
 * @brief Quick helper - true if there's saved config to act on.
 */
bool config_store_has_config(void);

/**
 * @brief Returns a stable identifier derived from MAC (env_XXXX).
 *        Used as a fallback when the user leaves Device ID empty.
 *        The pointer points to a static buffer - do not free.
 */
const char *config_store_default_device_id(void);

/**
 * @brief Returns the last-4-hex of the MAC, used in the AP SSID
 *        (e.g. "EnvMon-Setup-A1B2"). Static buffer.
 */
const char *config_store_short_id(void);

#ifdef __cplusplus
}
#endif

#endif /* CONFIG_STORE_H */
