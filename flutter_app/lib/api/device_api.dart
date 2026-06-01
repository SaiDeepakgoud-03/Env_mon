import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;

/// Talks to the ESP32 in captive-portal mode at http://192.168.4.1/.
/// Mirrors the endpoints in main/provisioning.c on the device.
class DeviceApi {
  static const baseUrl = 'http://192.168.4.1';

  /// Returns null if the device isn't reachable (phone not on the AP yet).
  static Future<Map<String, dynamic>?> identity() async {
    try {
      final r = await http
          .get(Uri.parse('$baseUrl/identity'))
          .timeout(const Duration(seconds: 3));
      if (r.statusCode == 200) {
        return jsonDecode(r.body) as Map<String, dynamic>;
      }
    } on SocketException {
      // Not on the AP yet
    } catch (_) {
      // Timeout etc.
    }
    return null;
  }

  /// Returns a list of nearby Wi-Fi networks the ESP32 can see.
  /// Each entry is { ssid, rssi, auth }.
  static Future<List<Map<String, dynamic>>> scan({bool refresh = false}) async {
    final url = '$baseUrl/scan${refresh ? "?refresh=1" : ""}';
    final r = await http
        .get(Uri.parse(url))
        .timeout(const Duration(seconds: 8));
    if (r.statusCode != 200) {
      throw Exception('Scan failed: HTTP ${r.statusCode}');
    }
    final list = jsonDecode(r.body) as List;
    return list.cast<Map<String, dynamic>>();
  }

  /// Saves the form. Device reboots ~2 s after the response.
  static Future<bool> save({
    required String deviceId,
    required String wifiSsid,
    required String wifiPass,
    required String place,
    required String landmark,
    required String district,
    required String state,
    required String country,
    double? latitude,
    double? longitude,
  }) async {
    final body = {
      'device_id': deviceId,
      'wifi_ssid': wifiSsid,
      'wifi_pass': wifiPass,
      'place':     place,
      'landmark':  landmark,
      'district':  district,
      'state':     state,
      'country':   country,
      if (latitude  != null) 'latitude':  latitude.toStringAsFixed(6),
      if (longitude != null) 'longitude': longitude.toStringAsFixed(6),
    };
    final r = await http
        .post(
          Uri.parse('$baseUrl/save'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 10));
    if (r.statusCode != 200) {
      throw Exception('Save failed: HTTP ${r.statusCode} ${r.body}');
    }
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    return j['ok'] == true;
  }
}
