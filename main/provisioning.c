/*
 * provisioning.c
 *
 * Soft-AP captive-portal provisioning implementation.
 *
 * Designed for ESP-IDF v6.x. Uses esp_http_server for the web UI
 * and a minimal UDP DNS responder for the captive-portal redirect.
 */

#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <sys/param.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "freertos/semphr.h"

#include "esp_system.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"

#include "esp_http_server.h"

#include "lwip/sockets.h"
#include "lwip/netdb.h"

#include "config_store.h"
#include "provisioning.h"

static const char *TAG = "PROV";

/* -------------------------------------------------------------- */
/*  Background Wi-Fi scan cache                                    */
/* -------------------------------------------------------------- */
/* The captive portal used to do a synchronous scan on every       */
/* /scan request, which made the page feel sluggish (3-6 s each    */
/* time). Instead, a background task runs the scan once at boot    */
/* and refreshes it every 20 s. /scan just returns the cached      */
/* JSON instantly.                                                 */

#define SCAN_CACHE_MAX_BYTES   2048
#define SCAN_REFRESH_MS        20000

static SemaphoreHandle_t s_scan_lock = NULL;
static char              s_scan_cache[SCAN_CACHE_MAX_BYTES] = "[]";
static size_t            s_scan_cache_len = 2;
static bool              s_scan_busy      = false;

static void delayed_restart_task(void *arg)
{
    vTaskDelay(pdMS_TO_TICKS(2000));
    esp_restart();
}

static void set_cors_headers(httpd_req_t *req)
{
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "content-type");
}

/* ------------------------------------------------------------------ */
/*  Form HTML  (served at GET /)                                       */
/* ------------------------------------------------------------------ */
/* Keep this minimal but pleasant. Inline CSS only - no CDN required. */

static const char *PORTAL_HTML =
"<!doctype html><html lang=\"en\"><head>"
"<meta charset=\"utf-8\">"
"<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
"<title>EnvMon · Device setup</title>"
"<style>"
"*,*::before,*::after{box-sizing:border-box}"
"body{margin:0;min-height:100vh;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0f172a;color:#e2e8f0;padding:14px}"
".card{width:100%;max-width:520px;margin:0 auto;background:#111827;border:1px solid #334155;border-radius:14px;padding:20px}"
"h1{margin:0 0 4px;font-size:22px;color:#f8fafc;letter-spacing:-.01em}"
"p.sub{margin:0 0 18px;color:#94a3b8;font-size:13px}"
"label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;"
"color:#94a3b8;margin:14px 0 6px}"
"input,select{width:100%;padding:12px;border-radius:8px;font-size:16px;background:#0f172a;color:#e2e8f0;border:1px solid #475569;outline:none}"
"input:focus,select:focus{border-color:#60a5fa}"
"button{margin-top:22px;width:100%;padding:12px;border:0;border-radius:10px;"
"background:linear-gradient(135deg,#2563eb,#60a5fa);color:#fff;font-weight:600;font-size:15px;cursor:pointer}"
"button:disabled{opacity:.5;cursor:wait}"
".grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}"
".pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;"
"font-size:11px;font-weight:600;background:rgba(34,197,94,.15);color:#4ade80;"
"border:1px solid rgba(34,197,94,.4)}"
".pill .dot{width:6px;height:6px;border-radius:50%;background:currentColor}"
".msg{margin-top:14px;padding:10px 12px;border-radius:8px;font-size:13px;display:none}"
".msg.ok {background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.4);color:#86efac;display:block}"
".msg.err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.4);color:#fca5a5;display:block}"
"footer{margin-top:18px;font-size:11px;color:#64748b;text-align:center}"
"</style></head><body><div class=\"card\">"
"<span class=\"pill\"><span class=\"dot\"></span>Setup mode</span>"
"<h1 style=\"margin-top:10px\">Configure this device</h1>"
"<p class=\"sub\">Fill in Wi-Fi and installation location. Device ID is generated from this board's MAC address.</p>"
"<form id=\"f\">"
"<label>Device ID</label>"
"<input name=\"device_id\" id=\"did\" placeholder=\"env_0000\" maxlength=\"31\" readonly>"
"<label>Wi-Fi network</label>"
"<select name=\"wifi_ssid\" id=\"ssid\"><option value=\"\">Loading networks...</option></select>"
"<input name=\"wifi_ssid_manual\" id=\"ssid_manual\" placeholder=\"Or type Wi-Fi name manually\" maxlength=\"32\">"
"<label>Wi-Fi password</label>"
"<input name=\"wifi_pass\" type=\"password\" placeholder=\"\" maxlength=\"63\">"
"<div class=\"grid\">"
"<div><label>Place</label><input name=\"place\" placeholder=\"Kukatpally\" maxlength=\"63\" required></div>"
"<div><label>Landmark</label><input name=\"landmark\" placeholder=\"Near main road\" maxlength=\"63\"></div>"
"<div><label>District</label><input name=\"district\" placeholder=\"Hyderabad\" maxlength=\"47\" required></div>"
"<div><label>State</label><select name=\"state\" required>"
"<option value=\"\">Select state</option><option>Andhra Pradesh</option><option>Arunachal Pradesh</option><option>Assam</option><option>Bihar</option>"
"<option>Chhattisgarh</option><option>Goa</option><option>Gujarat</option><option>Haryana</option><option>Himachal Pradesh</option>"
"<option>Jharkhand</option><option>Karnataka</option><option>Kerala</option><option>Madhya Pradesh</option><option>Maharashtra</option>"
"<option>Manipur</option><option>Meghalaya</option><option>Mizoram</option><option>Nagaland</option><option>Odisha</option>"
"<option>Punjab</option><option>Rajasthan</option><option>Sikkim</option><option>Tamil Nadu</option><option>Telangana</option>"
"<option>Tripura</option><option>Uttar Pradesh</option><option>Uttarakhand</option><option>West Bengal</option>"
"<option>Andaman and Nicobar Islands</option><option>Chandigarh</option><option>Dadra and Nagar Haveli and Daman and Diu</option>"
"<option>Delhi</option><option>Jammu and Kashmir</option><option>Ladakh</option><option>Lakshadweep</option><option>Puducherry</option>"
"</select></div>"
"</div>"
"<label>Country</label>"
"<select name=\"country\" required><option value=\"India\" selected>India</option><option>Other</option></select>"
"<label>GPS coordinates <span style=\"color:#94a3b8;text-transform:none;letter-spacing:0\">(optional - for the map)</span></label>"
"<div class=\"grid\">"
"<div><input name=\"latitude\"  id=\"lat\" placeholder=\"Latitude (e.g. 17.5325)\"  maxlength=\"23\"></div>"
"<div><input name=\"longitude\" id=\"lng\" placeholder=\"Longitude (e.g. 78.4356)\" maxlength=\"23\"></div>"
"</div>"
"<button id=\"gpsBtn\" type=\"button\">Use my phone location</button>"
"<button id=\"scanBtn\" type=\"button\">Scan Wi-Fi again</button>"
"<button id=\"btn\" type=\"submit\">Save and reboot</button>"
"<div id=\"msg\" class=\"msg\"></div>"
"</form>"
"<footer>EnvMon Location Environment Monitor</footer>"
"</div>"
"<script>"
"function $(s){return document.querySelector(s)}"
"async function loadIdentity(){try{const r=await fetch('/identity');const j=await r.json();if(j.device_id){$('#did').value=j.device_id;}}catch(e){$('#did').placeholder='env_auto';}}"
"async function loadScan(){"
"  try{"
"    $('#scanBtn').disabled=true;$('#scanBtn').textContent='Scanning...';"
"    const r = await fetch('/scan'); const aps = await r.json();"
"    const sel = $('#ssid'); sel.innerHTML='';"
"    sel.innerHTML='<option value=\"\">Select Wi-Fi or type manually below</option>';"
"    aps.forEach(a=>{"
"      const o=document.createElement('option');"
"      o.value=a.ssid; o.textContent=a.ssid+'  ('+a.rssi+' dBm'+(a.auth?'':' · open')+')';"
"      sel.appendChild(o);"
"    });"
"  }catch(e){$('#msg').textContent='Scan failed. Type Wi-Fi name manually.'; $('#msg').className='msg err';}"
"  finally{$('#scanBtn').disabled=false;$('#scanBtn').textContent='Scan Wi-Fi again';}"
"}"
"loadIdentity();loadScan();"
"$('#scanBtn').addEventListener('click',loadScan);"
"$('#gpsBtn').addEventListener('click',()=>{"
"  if(!navigator.geolocation){$('#msg').textContent='Geolocation not available'; $('#msg').className='msg err';return;}"
"  $('#gpsBtn').disabled=true;$('#gpsBtn').textContent='Locating...';"
"  navigator.geolocation.getCurrentPosition(p=>{"
"    $('#lat').value=p.coords.latitude.toFixed(6);"
"    $('#lng').value=p.coords.longitude.toFixed(6);"
"    $('#msg').textContent='Location captured';$('#msg').className='msg ok';"
"    $('#gpsBtn').disabled=false;$('#gpsBtn').textContent='Use my phone location';"
"  },e=>{"
"    $('#msg').textContent='Location denied. Enter manually.';$('#msg').className='msg err';"
"    $('#gpsBtn').disabled=false;$('#gpsBtn').textContent='Use my phone location';"
"  },{enableHighAccuracy:true,timeout:8000});"
"});"
"$('#f').addEventListener('submit',async ev=>{"
"  ev.preventDefault();"
"  const btn=$('#btn'); btn.disabled=true; btn.textContent='Saving…';"
"  const data=Object.fromEntries(new FormData(ev.target).entries());"
"  if(data.wifi_ssid_manual){data.wifi_ssid=data.wifi_ssid_manual;}"
"  try{"
"    const r=await fetch('/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});"
"    const j=await r.json();"
"    if(j.ok){$('#msg').textContent='Saved. Device will reboot in 3 s…'; $('#msg').className='msg ok';"
"      setTimeout(()=>{document.body.innerHTML='<div class=\"card\" style=\"text-align:center\"><h1>Rebooted</h1><p class=\\\"sub\\\">You can now close this page and reconnect to your normal Wi-Fi.</p></div>';},3000);"
"    } else {$('#msg').textContent='Error: '+(j.error||'unknown'); $('#msg').className='msg err'; btn.disabled=false; btn.textContent='Save and reboot';}"
"  }catch(e){$('#msg').textContent='Network error: '+e.message; $('#msg').className='msg err'; btn.disabled=false; btn.textContent='Save and reboot';}"
"});"
"</script></body></html>";

/* ------------------------------------------------------------------ */
/*  HTTP HANDLERS                                                      */
/* ------------------------------------------------------------------ */

static esp_err_t root_get_handler(httpd_req_t *req)
{
    set_cors_headers(req);
    httpd_resp_set_type(req, "text/html");
    httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
    return httpd_resp_send(req, PORTAL_HTML, HTTPD_RESP_USE_STRLEN);
}

/* Run one scan synchronously and write the JSON into s_scan_cache. */
static void rescan_into_cache(void)
{
    wifi_scan_config_t scan_cfg = {0};
    if (esp_wifi_scan_start(&scan_cfg, true) != ESP_OK) {
        return;
    }
    uint16_t ap_count = 0;
    esp_wifi_scan_get_ap_num(&ap_count);
    if (ap_count > 24) ap_count = 24;
    if (ap_count == 0) return;

    wifi_ap_record_t *aps = calloc(ap_count, sizeof(wifi_ap_record_t));
    if (!aps) return;
    if (esp_wifi_scan_get_ap_records(&ap_count, aps) != ESP_OK) {
        free(aps);
        return;
    }

    /* Build JSON into a temp buffer, then copy under lock */
    char tmp[SCAN_CACHE_MAX_BYTES];
    int n = 0;
    n += snprintf(tmp + n, sizeof tmp - n, "[");
    bool first = true;
    for (int i = 0; i < ap_count && n < (int)(sizeof tmp - 200); i++) {
        if (aps[i].ssid[0] == '\0') continue;
        n += snprintf(tmp + n, sizeof tmp - n,
                      "%s{\"ssid\":\"%s\",\"rssi\":%d,\"auth\":%d}",
                      first ? "" : ",",
                      (const char *)aps[i].ssid,
                      aps[i].rssi,
                      aps[i].authmode != WIFI_AUTH_OPEN);
        first = false;
    }
    n += snprintf(tmp + n, sizeof tmp - n, "]");
    free(aps);

    if (xSemaphoreTake(s_scan_lock, portMAX_DELAY) == pdTRUE) {
        memcpy(s_scan_cache, tmp, n);
        s_scan_cache[n]  = '\0';
        s_scan_cache_len = n;
        xSemaphoreGive(s_scan_lock);
    }
    ESP_LOGI(TAG, "Wi-Fi scan cache refreshed (%d bytes)", n);
}

/* Background task: scan immediately, then every SCAN_REFRESH_MS. */
static void scan_task(void *arg)
{
    rescan_into_cache();
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(SCAN_REFRESH_MS));
        rescan_into_cache();
    }
}

/* One-shot rescan worker, used when the user clicks "Scan again". */
static void one_shot_rescan(void *arg)
{
    rescan_into_cache();
    s_scan_busy = false;
    vTaskDelete(NULL);
}

/* GET /scan -> JSON array of {ssid, rssi, auth}  (returns cache instantly).
 * Optional ?refresh=1 kicks off a fresh scan in the background. */
static esp_err_t scan_get_handler(httpd_req_t *req)
{
    set_cors_headers(req);
    char query[24] = {0};
    if (httpd_req_get_url_query_str(req, query, sizeof query) == ESP_OK
        && strstr(query, "refresh=1") && !s_scan_busy) {
        s_scan_busy = true;
        xTaskCreate(one_shot_rescan, "rescan", 4096, NULL, 4, NULL);
    }

    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Cache-Control", "no-cache");

    if (xSemaphoreTake(s_scan_lock, pdMS_TO_TICKS(500)) == pdTRUE) {
        esp_err_t r = httpd_resp_send(req, s_scan_cache, s_scan_cache_len);
        xSemaphoreGive(s_scan_lock);
        return r;
    }
    return httpd_resp_send(req, "[]", 2);
}

/* GET /identity -> default device identity derived from MAC */
static esp_err_t identity_get_handler(httpd_req_t *req)
{
    char buf[80];
    snprintf(buf, sizeof buf,
             "{\"device_id\":\"%s\",\"short_id\":\"%s\"}",
             config_store_default_device_id(),
             config_store_short_id());

    set_cors_headers(req);
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
    return httpd_resp_sendstr(req, buf);
}

/* ------- Tiny JSON helpers ------- */

static const char *json_find_value(const char *body, const char *key)
{
    /* Locates "key":"value" - returns pointer just past the opening quote. */
    char needle[40];
    snprintf(needle, sizeof needle, "\"%s\"", key);
    const char *p = strstr(body, needle);
    if (!p) return NULL;
    p = strchr(p + strlen(needle), ':');
    if (!p) return NULL;
    p++;
    while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r') p++;
    if (*p != '"') return NULL;
    return p + 1;
}

static void json_copy_str(const char *body, const char *key,
                          char *dst, size_t dst_sz)
{
    dst[0] = '\0';
    const char *v = json_find_value(body, key);
    if (!v) return;
    size_t i = 0;
    while (*v && *v != '"' && i + 1 < dst_sz) {
        if (*v == '\\' && v[1]) {     /* tiny escape support */
            v++;
            switch (*v) {
                case 'n':  dst[i++] = '\n'; break;
                case 't':  dst[i++] = '\t'; break;
                case '"':  dst[i++] = '"';  break;
                case '\\': dst[i++] = '\\'; break;
                default:   dst[i++] = *v;
            }
            v++;
        } else {
            dst[i++] = *v++;
        }
    }
    dst[i] = '\0';
}

/* POST /save */
static esp_err_t save_post_handler(httpd_req_t *req)
{
    set_cors_headers(req);
    int total = req->content_len;
    if (total <= 0 || total > 1500) {
        httpd_resp_set_type(req, "application/json");
        httpd_resp_set_status(req, "400 Bad Request");
        httpd_resp_sendstr(req, "{\"ok\":false,\"error\":\"body size\"}");
        return ESP_OK;
    }

    char *body = malloc(total + 1);
    if (!body) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "oom");
        return ESP_FAIL;
    }
    int received = 0;
    while (received < total) {
        int r = httpd_req_recv(req, body + received, total - received);
        if (r <= 0) { free(body); httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "recv"); return ESP_FAIL; }
        received += r;
    }
    body[received] = '\0';

    device_config_t cfg = {0};
    json_copy_str(body, "device_id", cfg.device_id, sizeof cfg.device_id);
    json_copy_str(body, "wifi_ssid", cfg.wifi_ssid, sizeof cfg.wifi_ssid);
    if (cfg.wifi_ssid[0] == '\0') {
        json_copy_str(body, "wifi_ssid_manual", cfg.wifi_ssid, sizeof cfg.wifi_ssid);
    }
    json_copy_str(body, "wifi_pass", cfg.wifi_pass, sizeof cfg.wifi_pass);
    json_copy_str(body, "place",     cfg.place,     sizeof cfg.place);
    json_copy_str(body, "landmark",  cfg.landmark,  sizeof cfg.landmark);
    json_copy_str(body, "district",  cfg.district,  sizeof cfg.district);
    json_copy_str(body, "state",     cfg.state,     sizeof cfg.state);
    json_copy_str(body, "country",   cfg.country,   sizeof cfg.country);
    json_copy_str(body, "latitude",  cfg.latitude,  sizeof cfg.latitude);
    json_copy_str(body, "longitude", cfg.longitude, sizeof cfg.longitude);
    free(body);

    /* Default device_id if blank */
    if (cfg.device_id[0] == '\0') {
        strncpy(cfg.device_id, config_store_default_device_id(),
                sizeof cfg.device_id - 1);
    }

    /* Validation */
    httpd_resp_set_type(req, "application/json");
    if (cfg.wifi_ssid[0] == '\0') {
        httpd_resp_sendstr(req, "{\"ok\":false,\"error\":\"wifi_ssid required\"}");
        return ESP_OK;
    }
    if (cfg.place[0] == '\0' || cfg.district[0] == '\0' ||
        cfg.state[0] == '\0' || cfg.country[0] == '\0') {
        httpd_resp_sendstr(req, "{\"ok\":false,\"error\":\"place/district/state/country required\"}");
        return ESP_OK;
    }

    if (!config_store_save(&cfg)) {
        httpd_resp_sendstr(req, "{\"ok\":false,\"error\":\"nvs save failed\"}");
        return ESP_OK;
    }

    httpd_resp_sendstr(req, "{\"ok\":true}");

    /* Reboot after browser receives the 200 */
    ESP_LOGI(TAG, "Provisioning saved. Restarting in 2 s ...");
    xTaskCreate(delayed_restart_task, "restart", 2048, NULL, 3, NULL);
    return ESP_OK;             /* unreached */
}

/* ------------------------------------------------------------------ */
/*  Captive-portal detection handlers                                  */
/* ------------------------------------------------------------------ */
/*  Mobile OSes probe specific URLs after joining a Wi-Fi to decide    */
/*  "is this a real internet connection or a captive portal?".         */
/*  We answer those probes in the way that triggers the captive-       */
/*  portal popup automatically:                                        */
/*                                                                     */
/*    Android : /generate_204, /gen_204                                */
/*              Expected:  HTTP 204 empty (=internet OK).              */
/*              We return: HTTP 302 -> http://192.168.4.1/             */
/*                                                                     */
/*    iOS / mac:  /hotspot-detect.html, /library/test/success.html     */
/*              Expected:  exact "Success" HTML.                       */
/*              We return: a different short page -> iOS shows portal. */
/*                                                                     */
/*    Windows : /connecttest.txt, /ncsi.txt                            */
/*              Expected:  "Microsoft Connect Test".                   */
/*              We return: 302 -> http://192.168.4.1/                  */
/*                                                                     */
/*    Everything else: 302 -> http://192.168.4.1/                      */
/* ------------------------------------------------------------------ */

static esp_err_t captive_redirect_handler(httpd_req_t *req)
{
    set_cors_headers(req);
    httpd_resp_set_status(req, "302 Found");
    httpd_resp_set_hdr(req, "Location", "http://192.168.4.1/");
    httpd_resp_set_hdr(req, "Cache-Control", "no-cache, no-store, must-revalidate");
    httpd_resp_send(req, NULL, 0);
    return ESP_OK;
}

static esp_err_t options_handler(httpd_req_t *req)
{
    set_cors_headers(req);
    httpd_resp_send(req, NULL, 0);
    return ESP_OK;
}

/* iOS / macOS look for a body containing <TITLE>Success</TITLE>.
 * If they see anything else, the captive-portal popup fires.        */
static esp_err_t ios_probe_handler(httpd_req_t *req)
{
    static const char *PORTAL_NOT_SUCCESS =
        "<HTML><HEAD><TITLE>Captive Portal</TITLE></HEAD>"
        "<BODY>Setup required</BODY></HTML>";
    httpd_resp_set_type(req, "text/html");
    httpd_resp_set_hdr(req, "Cache-Control", "no-cache, no-store, must-revalidate");
    return httpd_resp_send(req, PORTAL_NOT_SUCCESS, HTTPD_RESP_USE_STRLEN);
}

/* ------------------------------------------------------------------ */
/*  HTTP server bring-up                                               */
/* ------------------------------------------------------------------ */

static httpd_handle_t s_httpd = NULL;

static void start_webserver(void)
{
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port      = 80;
    config.lru_purge_enable = true;
    config.uri_match_fn     = httpd_uri_match_wildcard;
    config.max_uri_handlers = 20;            /* room for OS probes      */

    if (httpd_start(&s_httpd, &config) != ESP_OK) {
        ESP_LOGE(TAG, "httpd_start failed");
        return;
    }

    httpd_uri_t root     = { .uri = "/",         .method = HTTP_GET,  .handler = root_get_handler };
    httpd_uri_t scan     = { .uri = "/scan",     .method = HTTP_GET,  .handler = scan_get_handler };
    httpd_uri_t identity = { .uri = "/identity", .method = HTTP_GET,  .handler = identity_get_handler };
    httpd_uri_t save     = { .uri = "/save",     .method = HTTP_POST, .handler = save_post_handler };

    /* OS captive-portal probe endpoints (MUST be registered BEFORE the
     * wildcard so they match first). */
    httpd_uri_t and_204  = { .uri = "/generate_204",     .method = HTTP_GET, .handler = captive_redirect_handler };
    httpd_uri_t and_g204 = { .uri = "/gen_204",          .method = HTTP_GET, .handler = captive_redirect_handler };
    httpd_uri_t ios_hot  = { .uri = "/hotspot-detect.html", .method = HTTP_GET, .handler = ios_probe_handler };
    httpd_uri_t ios_lib  = { .uri = "/library/test/success.html", .method = HTTP_GET, .handler = ios_probe_handler };
    httpd_uri_t win_con  = { .uri = "/connecttest.txt",  .method = HTTP_GET, .handler = captive_redirect_handler };
    httpd_uri_t win_ncsi = { .uri = "/ncsi.txt",         .method = HTTP_GET, .handler = captive_redirect_handler };
    httpd_uri_t fav      = { .uri = "/favicon.ico",      .method = HTTP_GET, .handler = captive_redirect_handler };

    httpd_uri_t options  = { .uri = "/*",        .method = HTTP_OPTIONS, .handler = options_handler };
    httpd_uri_t any      = { .uri = "/*",        .method = HTTP_GET,  .handler = captive_redirect_handler };

    httpd_register_uri_handler(s_httpd, &root);
    httpd_register_uri_handler(s_httpd, &scan);
    httpd_register_uri_handler(s_httpd, &identity);
    httpd_register_uri_handler(s_httpd, &save);

    /* OS probe paths (order matters - register before the wildcard) */
    httpd_register_uri_handler(s_httpd, &and_204);
    httpd_register_uri_handler(s_httpd, &and_g204);
    httpd_register_uri_handler(s_httpd, &ios_hot);
    httpd_register_uri_handler(s_httpd, &ios_lib);
    httpd_register_uri_handler(s_httpd, &win_con);
    httpd_register_uri_handler(s_httpd, &win_ncsi);
    httpd_register_uri_handler(s_httpd, &fav);

    httpd_register_uri_handler(s_httpd, &options);
    httpd_register_uri_handler(s_httpd, &any);
}

/* ------------------------------------------------------------------ */
/*  Tiny DNS responder  (captive-portal trigger)                       */
/* ------------------------------------------------------------------ */
/* Every DNS A query gets answered with the AP IP - that's how a phone */
/* / laptop OS knows "this is a captive network" and pops the form.    */

static void dns_task(void *arg)
{
    uint32_t ap_ip = (uint32_t)(uintptr_t) arg;

    int s = socket(AF_INET, SOCK_DGRAM, 0);
    if (s < 0) { ESP_LOGE(TAG, "dns socket"); vTaskDelete(NULL); return; }

    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_port   = htons(53),
        .sin_addr.s_addr = htonl(INADDR_ANY),
    };
    if (bind(s, (struct sockaddr *)&addr, sizeof addr) < 0) {
        ESP_LOGE(TAG, "dns bind");
        close(s); vTaskDelete(NULL); return;
    }

    uint8_t buf[512];
    while (1) {
        struct sockaddr_in from;
        socklen_t fl = sizeof from;
        int n = recvfrom(s, buf, sizeof buf, 0, (struct sockaddr *)&from, &fl);
        if (n < 12) continue;

        /* Build reply: same header, mark response + answer */
        buf[2] |= 0x80;                /* QR  = response             */
        buf[3]  = 0x80;                /* RA  = recursion-available  */
        buf[6]  = 0; buf[7] = 1;       /* ANCOUNT = 1                */
        buf[8]  = buf[9] = buf[10] = buf[11] = 0;

        /* Locate end of question section (after QNAME + QTYPE/QCLASS) */
        int p = 12;
        while (p < n && buf[p] != 0) p += buf[p] + 1;
        p += 1 + 4;     /* terminator + QTYPE(2) + QCLASS(2)         */
        if (p + 16 > (int)sizeof buf) continue;

        /* Answer:   c0 0c  (compressed name pointer to question)
         *           00 01  TYPE A
         *           00 01  CLASS IN
         *           00 00 00 1e  TTL=30
         *           00 04  RDLENGTH
         *           a.b.c.d  RDATA                                  */
        buf[p++] = 0xc0; buf[p++] = 0x0c;
        buf[p++] = 0x00; buf[p++] = 0x01;
        buf[p++] = 0x00; buf[p++] = 0x01;
        buf[p++] = 0x00; buf[p++] = 0x00; buf[p++] = 0x00; buf[p++] = 0x1e;
        buf[p++] = 0x00; buf[p++] = 0x04;
        buf[p++] = (ap_ip >>  0) & 0xFF;
        buf[p++] = (ap_ip >>  8) & 0xFF;
        buf[p++] = (ap_ip >> 16) & 0xFF;
        buf[p++] = (ap_ip >> 24) & 0xFF;

        sendto(s, buf, p, 0, (struct sockaddr *)&from, fl);
    }
}

/* ------------------------------------------------------------------ */
/*  Soft-AP bring-up                                                   */
/* ------------------------------------------------------------------ */

static void start_softap(void)
{
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    esp_netif_t *ap_netif = esp_netif_create_default_wifi_ap();
    /* Also need an STA netif so we can scan for nearby APs */
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    char ap_ssid[33];
    snprintf(ap_ssid, sizeof ap_ssid, "EnvMon-Setup-%s",
             config_store_short_id());

    wifi_config_t ap = {
        .ap = {
            .channel        = 6,
            .max_connection = 4,
            .authmode       = WIFI_AUTH_OPEN,
            .pmf_cfg        = { .required = false },
        },
    };
    strncpy((char *)ap.ap.ssid, ap_ssid, sizeof ap.ap.ssid);
    ap.ap.ssid_len = strlen(ap_ssid);

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_APSTA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap));
    ESP_ERROR_CHECK(esp_wifi_start());

    /* Read the AP's assigned IP so DNS can answer with it */
    esp_netif_ip_info_t ip = {0};
    esp_netif_get_ip_info(ap_netif, &ip);

    ESP_LOGI(TAG, "AP up: SSID=\"%s\"  IP=" IPSTR, ap_ssid, IP2STR(&ip.ip));

    /* ---------------------------------------------------------------- *
     *  CRITICAL for captive portal auto-open:                          *
     *  Tell DHCP to advertise THIS device as the DNS server.           *
     *  Without this, the phone uses cellular DNS, the OS reachability  *
     *  probes succeed against real servers, and the captive sign-in    *
     *  page is never triggered.                                        *
     * ---------------------------------------------------------------- */
    esp_netif_dhcps_stop(ap_netif);

    /* Allow option 6 (DNS) override */
    uint8_t lease_dns_opt = 1;
    esp_netif_dhcps_option(ap_netif, ESP_NETIF_OP_SET,
        ESP_NETIF_DOMAIN_NAME_SERVER, &lease_dns_opt, sizeof lease_dns_opt);

    /* Push the AP IP as the DNS server */
    esp_netif_dns_info_t dns_info = {0};
    dns_info.ip.u_addr.ip4.addr = ip.ip.addr;
    dns_info.ip.type            = IPADDR_TYPE_V4;
    esp_netif_set_dns_info(ap_netif, ESP_NETIF_DNS_MAIN, &dns_info);

    esp_netif_dhcps_start(ap_netif);

    ESP_LOGI(TAG, "DHCP DNS advertised as " IPSTR, IP2STR(&ip.ip));

    /* Launch DNS captive portal */
    xTaskCreate(dns_task, "dns", 4096,
                (void *)(uintptr_t) ip.ip.addr, 5, NULL);

    /* Background Wi-Fi scan cache (so /scan returns instantly) */
    if (!s_scan_lock) {
        s_scan_lock = xSemaphoreCreateMutex();
    }
    xTaskCreate(scan_task, "wifi_scan", 4096, NULL, 4, NULL);
}

/* ------------------------------------------------------------------ */
/*  PUBLIC ENTRY POINT                                                 */
/* ------------------------------------------------------------------ */

void provisioning_run(void)
{
    ESP_LOGI(TAG, "Entering provisioning mode (captive portal)");

    start_softap();
    start_webserver();

    /* Idle forever - the save handler reboots when done */
    while (1) vTaskDelay(pdMS_TO_TICKS(60000));
}
