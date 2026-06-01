import 'dart:async';
import 'package:app_settings/app_settings.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../api/device_api.dart';
import '../theme.dart';

class SetupPage extends StatefulWidget {
  const SetupPage({super.key});
  @override
  State<SetupPage> createState() => _SetupPageState();
}

class _SetupPageState extends State<SetupPage> {
  // Step 1: detect AP connection
  bool _onAp = false;
  Map<String, dynamic>? _identity;
  Timer? _probeTimer;

  // Step 2: Wi-Fi scan
  List<Map<String, dynamic>> _scan = [];
  bool _scanning = false;

  // Form fields
  final _form     = GlobalKey<FormState>();
  final _devCtrl  = TextEditingController();
  final _ssidCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _placeCtrl    = TextEditingController();
  final _landmarkCtrl = TextEditingController();
  final _districtCtrl = TextEditingController();
  final _stateCtrl    = TextEditingController();
  final _countryCtrl  = TextEditingController(text: 'India');
  double? _lat, _lng;

  bool _saving = false;
  String? _msg;
  bool _msgOk = false;

  @override
  void initState() {
    super.initState();
    _probeTimer = Timer.periodic(const Duration(seconds: 3), (_) => _probe());
    _probe();
  }

  @override
  void dispose() {
    _probeTimer?.cancel();
    _devCtrl.dispose(); _ssidCtrl.dispose(); _passCtrl.dispose();
    _placeCtrl.dispose(); _landmarkCtrl.dispose(); _districtCtrl.dispose();
    _stateCtrl.dispose(); _countryCtrl.dispose();
    super.dispose();
  }

  Future<void> _probe() async {
    final ident = await DeviceApi.identity();
    if (!mounted) return;
    if (ident != null) {
      setState(() {
        _onAp = true;
        _identity = ident;
        if (_devCtrl.text.isEmpty && ident['device_id'] != null) {
          _devCtrl.text = ident['device_id'];
        }
      });
      if (_scan.isEmpty) _doScan();
    } else if (_onAp) {
      setState(() => _onAp = false);
    }
  }

  Future<void> _doScan() async {
    setState(() { _scanning = true; _msg = null; });
    try {
      final list = await DeviceApi.scan();
      if (!mounted) return;
      setState(() => _scan = list);
    } catch (e) {
      if (!mounted) return;
      setState(() { _msg = 'Scan failed: $e'; _msgOk = false; });
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  Future<void> _useLocation() async {
    try {
      final perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        setState(() { _msg = 'Location permission denied'; _msgOk = false; });
        return;
      }
      final p = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high);
      if (!mounted) return;
      setState(() {
        _lat = p.latitude; _lng = p.longitude;
        _msg = 'Location captured'; _msgOk = true;
      });
    } catch (e) {
      setState(() { _msg = 'Location failed: $e'; _msgOk = false; });
    }
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    if (_ssidCtrl.text.isEmpty) {
      setState(() { _msg = 'Pick a Wi-Fi network first'; _msgOk = false; });
      return;
    }
    setState(() { _saving = true; _msg = null; });
    try {
      final ok = await DeviceApi.save(
        deviceId: _devCtrl.text.trim(),
        wifiSsid: _ssidCtrl.text.trim(),
        wifiPass: _passCtrl.text,
        place:    _placeCtrl.text.trim(),
        landmark: _landmarkCtrl.text.trim(),
        district: _districtCtrl.text.trim(),
        state:    _stateCtrl.text.trim(),
        country:  _countryCtrl.text.trim(),
        latitude: _lat, longitude: _lng,
      );
      if (!mounted) return;
      setState(() {
        _msg = ok
          ? 'Saved. The device will reboot in ~3 seconds.'
          : 'Device rejected the form.';
        _msgOk = ok;
      });
    } catch (e) {
      setState(() { _msg = 'Save failed: $e'; _msgOk = false; });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        const _Header(),
        const SizedBox(height: 18),

        _StepCard(
          step: 1,
          title: 'Connect phone to the device hotspot',
          subtitle: 'Network name starts with EnvMon-Setup-…',
          done: _onAp,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_onAp
                ? '✓ Connected. Device id: ${_identity?['device_id'] ?? ''}'
                : 'Open Wi-Fi settings and join EnvMon-Setup-XXXX, then come back.',
                style: const TextStyle(color: kInkSoft, fontSize: 13)),
              const SizedBox(height: 10),
              if (!_onAp)
                OutlinedButton.icon(
                  onPressed: () =>
                    AppSettings.openAppSettings(type: AppSettingsType.wifi),
                  icon: const Icon(Icons.settings),
                  label: const Text('Open Wi-Fi settings'),
                ),
            ],
          ),
        ),
        const SizedBox(height: 14),

        _StepCard(
          step: 2,
          title: 'Pick your home Wi-Fi',
          subtitle: 'These are the networks the device can see',
          done: _ssidCtrl.text.isNotEmpty,
          enabled: _onAp,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (_scanning)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: LinearProgressIndicator(),
              ),
            ..._scan.map((ap) => RadioListTile<String>(
              dense: true,
              contentPadding: EdgeInsets.zero,
              value: ap['ssid'] ?? '',
              groupValue: _ssidCtrl.text,
              onChanged: (v) => setState(() => _ssidCtrl.text = v ?? ''),
              title: Text(ap['ssid'] ?? '?',
                style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(
                '${ap['rssi']} dBm  ·  ${(ap['auth'] ?? 1) == 0 ? 'open' : 'secured'}',
                style: const TextStyle(fontSize: 12)),
            )),
            const SizedBox(height: 6),
            Row(children: [
              Expanded(child: TextFormField(
                controller: _ssidCtrl,
                decoration: const InputDecoration(
                  labelText: 'or type SSID manually',
                  isDense: true,
                ),
              )),
              const SizedBox(width: 8),
              TextButton.icon(
                onPressed: _scanning ? null : _doScan,
                icon: const Icon(Icons.refresh),
                label: const Text('Rescan'),
              ),
            ]),
            const SizedBox(height: 8),
            TextFormField(
              controller: _passCtrl,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Wi-Fi password',
                isDense: true,
              ),
            ),
          ]),
        ),
        const SizedBox(height: 14),

        _StepCard(
          step: 3,
          title: 'Where is this device installed?',
          subtitle: 'Used by the dashboard map and reports',
          done: _placeCtrl.text.isNotEmpty &&
                _districtCtrl.text.isNotEmpty &&
                _stateCtrl.text.isNotEmpty,
          enabled: _onAp,
          child: Form(key: _form, child: Column(children: [
            TextFormField(
              controller: _devCtrl,
              decoration: const InputDecoration(
                labelText: 'Device ID', isDense: true,
              ),
              validator: (v) => (v == null || v.trim().isEmpty)
                ? 'Required' : null,
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _placeCtrl,
              decoration: const InputDecoration(
                labelText: 'Place', hintText: 'Kukatpally', isDense: true,
              ),
              validator: (v) => (v == null || v.trim().isEmpty)
                ? 'Required' : null,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _landmarkCtrl,
              decoration: const InputDecoration(
                labelText: 'Landmark (optional)',
                hintText: 'Near main road', isDense: true,
              ),
            ),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: TextFormField(
                controller: _districtCtrl,
                decoration: const InputDecoration(
                  labelText: 'District', isDense: true),
                validator: (v) => (v == null || v.trim().isEmpty)
                  ? 'Required' : null,
                onChanged: (_) => setState(() {}),
              )),
              const SizedBox(width: 8),
              Expanded(child: TextFormField(
                controller: _stateCtrl,
                decoration: const InputDecoration(
                  labelText: 'State', isDense: true),
                validator: (v) => (v == null || v.trim().isEmpty)
                  ? 'Required' : null,
                onChanged: (_) => setState(() {}),
              )),
            ]),
            const SizedBox(height: 10),
            TextFormField(
              controller: _countryCtrl,
              decoration: const InputDecoration(
                labelText: 'Country', isDense: true,
              ),
            ),
            const SizedBox(height: 14),
            Row(children: [
              Expanded(child: OutlinedButton.icon(
                onPressed: _useLocation,
                icon: const Icon(Icons.my_location),
                label: const Text('Use my GPS'),
              )),
              const SizedBox(width: 12),
              Text(
                _lat == null ? 'No GPS' :
                  '${_lat!.toStringAsFixed(4)}, ${_lng!.toStringAsFixed(4)}',
                style: const TextStyle(color: kInkSoft, fontSize: 12)),
            ]),
          ])),
        ),
        const SizedBox(height: 18),

        ElevatedButton.icon(
          onPressed: (_onAp && !_saving) ? _save : null,
          icon: _saving
            ? const SizedBox(width: 18, height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2, color: Colors.white))
            : const Icon(Icons.send),
          label: Text(_saving ? 'Saving…' : 'Save and reboot device'),
          style: ElevatedButton.styleFrom(
            minimumSize: const Size.fromHeight(54),
          ),
        ),

        if (_msg != null) Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: (_msgOk ? kOk : kBad).withOpacity(0.1),
              border: Border.all(
                color: (_msgOk ? kOk : kBad).withOpacity(0.4)),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(_msg!, style: TextStyle(
              color: _msgOk ? kOk : kBad,
              fontSize: 13, fontWeight: FontWeight.w600)),
          ),
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header();
  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Container(
        width: 38, height: 38,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [kPrimary, kAccent],
            begin: Alignment.topLeft, end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(10),
        ),
        child: const Icon(Icons.wifi_tethering, color: Colors.white),
      ),
      const SizedBox(width: 12),
      const Expanded(child: Column(
        crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Device Setup',
          style: TextStyle(fontWeight: FontWeight.w800,
            fontSize: 20, color: kInk)),
        Text('Configure a new EnvMon device in three steps',
          style: TextStyle(color: kInkSoft, fontSize: 12)),
      ])),
    ]);
  }
}

class _StepCard extends StatelessWidget {
  final int step;
  final String title, subtitle;
  final Widget child;
  final bool done, enabled;
  const _StepCard({
    required this.step, required this.title, required this.subtitle,
    required this.child, this.done = false, this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final colour = !enabled
      ? const Color(0xFFE5E7EB)
      : done ? kOk : kPrimary;

    return Opacity(
      opacity: enabled ? 1 : 0.55,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Container(
                  width: 28, height: 28,
                  decoration: BoxDecoration(
                    color: colour.withOpacity(0.15),
                    border: Border.all(color: colour),
                    borderRadius: BorderRadius.circular(8)),
                  child: Center(child: done
                    ? Icon(Icons.check, color: colour, size: 16)
                    : Text('$step', style: TextStyle(
                        color: colour, fontWeight: FontWeight.w800))),
                ),
                const SizedBox(width: 10),
                Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 14, color: kInk)),
                    Text(subtitle, style: const TextStyle(
                      color: kInkSoft, fontSize: 12)),
                  ],
                )),
              ]),
              const SizedBox(height: 12),
              child,
            ],
          ),
        ),
      ),
    );
  }
}
