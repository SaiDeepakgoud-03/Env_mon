/*
 * wifi.h
 *
 * Wi-Fi station-mode bring-up. In Phase A, the SSID and password are
 * loaded from the NVS-backed config_store, not hardcoded.
 *
 * Returns once an IP has been acquired (blocking).
 */

#ifndef WIFI_H
#define WIFI_H

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Connect using credentials currently in NVS.
 *        Blocks until DHCP succeeds.
 *
 * @return true  on success (IP acquired)
 *         false if no SSID is configured or connection ultimately fails.
 */
bool wifi_connect_with_saved_credentials(void);

/**
 * @brief Legacy entry point - calls
 *        wifi_connect_with_saved_credentials() and reboots on failure.
 *        Provided for source compatibility with earlier firmware.
 */
void wifi_connection(void);

#ifdef __cplusplus
}
#endif

#endif /* WIFI_H */
