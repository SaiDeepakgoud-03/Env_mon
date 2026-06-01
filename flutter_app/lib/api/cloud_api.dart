import 'dart:convert';
import 'package:http/http.dart' as http;

/// Talks to the AWS API Gateway endpoint (the one the React dashboard uses).
/// Change [baseUrl] if you redeploy under a different API id.
class CloudApi {
  static const baseUrl =
      'https://tzh11a7qtc.execute-api.us-east-1.amazonaws.com/prod';

  static Future<Map<String, dynamic>> listDevices() async {
    final r = await http.get(Uri.parse('$baseUrl/devices'));
    _throwIfBad(r);
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> getDevice(String id, {int limit = 60}) async {
    final r = await http.get(
      Uri.parse('$baseUrl/devices/${Uri.encodeComponent(id)}?limit=$limit'),
    );
    _throwIfBad(r);
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  static void _throwIfBad(http.Response r) {
    if (r.statusCode < 200 || r.statusCode >= 300) {
      throw Exception('Cloud API ${r.statusCode}: ${r.body}');
    }
  }
}
