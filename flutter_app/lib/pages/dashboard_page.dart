import 'dart:async';
import 'package:flutter/material.dart';

import '../api/cloud_api.dart';
import '../theme.dart';
import 'device_detail_page.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});
  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  Map<String, dynamic>? _data;
  String? _error;
  Timer? _timer;
  DateTime _lastFetch = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  void initState() {
    super.initState();
    _refresh();
    _timer = Timer.periodic(const Duration(seconds: 2), (_) => _refresh());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    try {
      final d = await CloudApi.listDevices();
      if (!mounted) return;
      setState(() {
        _data = d;
        _error = null;
        _lastFetch = DateTime.now();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  bool _isOnline(Map d) {
    final t = (d['last_seen'] ?? 0) as num;
    if (t == 0) return false;
    return DateTime.now().millisecondsSinceEpoch - t.toInt() < 20000;
  }

  @override
  Widget build(BuildContext context) {
    final devices = (_data?['devices'] as List?) ?? const [];
    final online  = devices.where(_isOnline).length;
    final offline = devices.length - online;
    final fires   = devices.where((d) => (d['last_fire'] ?? 0) == 1).length;

    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          Row(
            children: [
              Container(
                width: 38, height: 38,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [kPrimary, kAccent],
                    begin: Alignment.topLeft, end: Alignment.bottomRight),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.sensors, color: Colors.white),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('EnvMon',
                      style: TextStyle(fontWeight: FontWeight.w800,
                        fontSize: 20, color: kInk)),
                    Text('Industrial Environment Monitor',
                      style: TextStyle(color: kInkSoft, fontSize: 12)),
                  ],
                ),
              ),
              if (_error == null)
                _Pill(text: 'Live', colour: kOk)
              else
                _Pill(text: 'Offline', colour: kBad),
            ],
          ),
          const SizedBox(height: 18),

          _KpiRow(children: [
            _Kpi(label: 'Total',   value: '${devices.length}'),
            _Kpi(label: 'Online',  value: '$online',  colour: kOk),
            _Kpi(label: 'Offline', value: '$offline', colour: kBad),
            _Kpi(label: 'Fires',   value: '$fires',   colour: kWarn),
          ]),
          const SizedBox(height: 18),

          if (_error != null)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: kBad.withOpacity(0.1),
                border: Border.all(color: kBad.withOpacity(0.3)),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text('• $_error',
                style: const TextStyle(color: kBad)),
            ),

          const SizedBox(height: 10),
          ...devices.map((d) => _DeviceTile(
                device: d as Map<String, dynamic>,
                online: _isOnline(d),
              )),

          const SizedBox(height: 24),
          Center(child: Text(
            'Updated ${_relative(_lastFetch)}',
            style: const TextStyle(color: kInkSoft, fontSize: 11),
          )),
        ],
      ),
    );
  }

  String _relative(DateTime t) {
    final s = DateTime.now().difference(t).inSeconds;
    if (s < 2)  return 'just now';
    if (s < 60) return '${s}s ago';
    return '${(s / 60).round()}m ago';
  }
}

class _DeviceTile extends StatelessWidget {
  final Map<String, dynamic> device;
  final bool online;
  const _DeviceTile({required this.device, required this.online});

  @override
  Widget build(BuildContext context) {
    final id    = device['device_id'] ?? '—';
    final place = (device['location'] as Map?)?['place'] ?? '';
    final temp  = device['last_temperature'];
    final hum   = device['last_humidity'];
    final aq    = device['last_air_quality'];
    final fire  = (device['last_fire'] ?? 0) == 1;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => DeviceDetailPage(deviceId: id),
          )),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(id, style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 15, color: kInk, fontFamily: 'monospace')),
                          if (place != null && place.toString().isNotEmpty)
                            Text(place.toString(),
                              style: const TextStyle(
                                color: kPrimary, fontSize: 12,
                                fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                    _Pill(
                      text: online ? 'Online' : 'Offline',
                      colour: online ? kOk : kBad,
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(children: [
                  _MetricMini(label: 'Temp °C', value: _fmt(temp, 1)),
                  _MetricMini(label: 'Hum %',   value: _fmt(hum, 0)),
                  _MetricMini(label: 'Air Q.',  value: aq?.toString() ?? '—'),
                  _MetricMini(label: 'Fire',
                    value: fire ? '🔥' : '—',
                    valueColour: fire ? kBad : null),
                ]),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _fmt(dynamic v, int d) {
    if (v == null) return '—';
    final n = (v as num).toDouble();
    return n.toStringAsFixed(d);
  }
}

class _Pill extends StatelessWidget {
  final String text;
  final Color colour;
  const _Pill({required this.text, required this.colour});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: colour.withOpacity(0.15),
        border: Border.all(color: colour.withOpacity(0.45)),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 6, height: 6,
          decoration: BoxDecoration(color: colour, shape: BoxShape.circle)),
        const SizedBox(width: 6),
        Text(text, style: TextStyle(
          color: colour, fontSize: 11, fontWeight: FontWeight.w700)),
      ]),
    );
  }
}

class _KpiRow extends StatelessWidget {
  final List<Widget> children;
  const _KpiRow({required this.children});
  @override
  Widget build(BuildContext context) {
    return Row(children: [
      for (var i = 0; i < children.length; i++) ...[
        Expanded(child: children[i]),
        if (i < children.length - 1) const SizedBox(width: 10),
      ]
    ]);
  }
}

class _Kpi extends StatelessWidget {
  final String label, value;
  final Color? colour;
  const _Kpi({required this.label, required this.value, this.colour});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
        child: Column(
          children: [
            Text(value, style: TextStyle(
              fontSize: 22, fontWeight: FontWeight.w800,
              color: colour ?? kInk)),
            const SizedBox(height: 4),
            Text(label.toUpperCase(),
              style: const TextStyle(
                color: kInkSoft, fontSize: 10,
                letterSpacing: 0.5, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class _MetricMini extends StatelessWidget {
  final String label, value;
  final Color? valueColour;
  const _MetricMini({required this.label, required this.value, this.valueColour});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(value, style: TextStyle(
            fontSize: 14, fontWeight: FontWeight.w700,
            color: valueColour ?? kInk)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(
            color: kInkSoft, fontSize: 10,
            letterSpacing: 0.4, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
