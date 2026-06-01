/*
 * provisioning.h
 *
 * Soft-AP captive-portal provisioning.
 *
 * Call provisioning_run() when the device boots without a stored
 * configuration. It will:
 *
 *   1.  Start an open Wi-Fi access point named  EnvMon-Setup-XXXX
 *       (XXXX = last 4 hex of the MAC).
 *   2.  Start a tiny DNS responder that maps every hostname to the
 *       AP gateway IP. This is what makes phones / laptops auto-open
 *       the captive portal page.
 *   3.  Start an HTTP server on 192.168.4.1 that:
 *         GET  /          -> the configuration form (HTML)
 *         GET  /scan      -> JSON of nearby APs (Wi-Fi scan results)
 *         POST /save      -> validates form, writes NVS, reboots
 *         GET  *          -> redirect to /  (captive portal helpers)
 *   4.  Block until the user submits the form successfully.
 *
 * The function does not return: a successful save triggers
 * esp_restart() so the device comes up cleanly in station mode.
 */

#ifndef PROVISIONING_H
#define PROVISIONING_H

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Run the captive-portal provisioning workflow.
 *        Does not return on success (device reboots).
 */
void provisioning_run(void);

#ifdef __cplusplus
}
#endif

#endif /* PROVISIONING_H */
