# main/CMakeLists.txt - Phase A (captive portal + NVS + sensor loop)

idf_component_register(
    SRCS
        "main.c"
        "wifi.c"
        "config_store.c"
        "cert_store.c"
        "provisioning.c"
        "fleet_provisioning.c"
        "ota_manager.c"
        "shadow_manager.c"

    INCLUDE_DIRS
        "."

    REQUIRES
        esp_wifi
        esp_event
        esp_netif
        esp_http_client
        esp_http_server
        esp_adc
        esp_timer
        nvs_flash
        driver
        mqtt
        lwip
        espressif__cjson

    EMBED_TXTFILES
        "AmazonRootCA1.pem"
        "claim.pem.crt"
        "claim.private.pem.key"
)
