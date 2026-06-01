import 'dart:async';
import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';

import '../api/cloud_api.dart';
import '../theme.dart';

class DeviceDetailPage extends StatefulWidget {
  final String deviceId;
  const DeviceDetailPage({super.key, required this.deviceId});

  @override
  State<DeviceDetailPage> createState() => _DeviceDetailPageState();
}

class _DeviceDetailPageState extends State<DeviceDetailPage> {
  Map<String, dynamic>? _data;
  String? _error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _refresh();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _refresh());
  }

  @override
  void dispose() { _timer?.cancel(); super.dispose(); }

  Future<void> _refresh() async {
    try {
      final r = await CloudApi.getDevice(widget.deviceId);
      if (!mounted) return;
      setState(() { _data = r; _error = null; });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final device   = _data?['device']   as Map?;
    final latest   = _data?['latest']   as Map?;
    final readings = (_data?['readings'] as List?) ?? const [];
    final place    = (device?['location'] as Map?)?['place'];

    final t  = latest?['temperature'];
    final h  = latest?['humidity'];
    final aq = latest?['air_quality'];
    final fire = (latest?['fire'] ?? 0) == 1;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.deviceId,
          style: const TextStyle(fontFamily: 'monospace', fontSize: 16)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (place != null && place.toString().isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Text(place.toString(),
                style: const TextStyle(
                  color: kPrimary, fontSize: 14,
                  fontWeight: FontWeight.w700)),
            ),

          Row(children: [
            _BigMetric(label: 'Temperature', value: _fmt(t, 1), suffix: '°C', accent: const Color(0xFFFB923C)),
            const SizedBox(width: 10),
            _BigMetric(label: 'Humidity', value: _fmt(h, 0), suffix: '%', accent: kAccent),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            _BigMetric(label: 'Air Quality', value: aq?.toString() ?? '—', suffix: '', accent: kOk),
            const SizedBox(width: 10),
            _BigMetric(label: 'Fire',
              value: fire ? 'YES' : 'No',
              suffix: '',
              accent: fire ? kBad : kOk,
              alarm: fire),
          ]),

          if (_error != null) ...[
            const SizedBox(height: 14),
            Text('• $_error',
              style: const TextStyle(color: kBad, fontSize: 12)),
          ],

          const SizedBox(height: 22),
          _ChartCard(title: 'Temperature (°C)',
            colour: const Color(0xFFFB923C),
            spots: _spots(readings, 'temperature')),
          const SizedBox(height: 12),
          _ChartCard(title: 'Humidity (%)',
            colour: kAccent, yMin: 0, yMax: 100,
            spots: _spots(readings, 'humidity')),
          const SizedBox(height: 12),
          _ChartCard(title: 'Air Quality',
            colour: kOk, yMin: 0,
            spots: _spots(readings, 'air_quality')),
          const SizedBox(height: 12),
          _ChartCard(title: 'Fire (0 / 1)',
            colour: kBad, yMin: -0.1, yMax: 1.1,
            spots: _spots(readings, 'fire')),
        ],
      ),
    );
  }

  String _fmt(dynamic v, int d) {
    if (v == null) return '—';
    return (v as num).toDouble().toStringAsFixed(d);
  }

  List<FlSpot> _spots(List items, String key) {
    final out = <FlSpot>[];
    final ordered = items.reversed.toList();   // oldest first
    for (var i = 0; i < ordered.length; i++) {
      final v = ordered[i][key];
      if (v == null) continue;
      out.add(FlSpot(i.toDouble(), (v as num).toDouble()));
    }
    return out;
  }
}

class _BigMetric extends StatelessWidget {
  final String label, value, suffix;
  final Color accent;
  final bool alarm;
  const _BigMetric({
    required this.label, required this.value,
    required this.suffix, required this.accent, this.alarm = false,
  });
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border(top: BorderSide(color: accent, width: 3)),
            color: alarm ? const Color(0xFFFDE9E9) : Colors.white,
          ),
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label.toUpperCase(),
                style: const TextStyle(
                  color: kInkSoft, fontSize: 10,
                  letterSpacing: 0.6, fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              RichText(text: TextSpan(children: [
                TextSpan(text: value, style: TextStyle(
                  color: alarm ? kBad : kInk,
                  fontSize: 26, fontWeight: FontWeight.w800)),
                if (suffix.isNotEmpty)
                  TextSpan(text: ' $suffix', style: const TextStyle(
                    color: kInkSoft, fontSize: 14,
                    fontWeight: FontWeight.w500)),
              ])),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChartCard extends StatelessWidget {
  final String title;
  final List<FlSpot> spots;
  final Color colour;
  final double? yMin, yMax;
  const _ChartCard({
    required this.title, required this.spots, required this.colour,
    this.yMin, this.yMax,
  });
  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(
              fontSize: 13, fontWeight: FontWeight.w700, color: kInk)),
            const SizedBox(height: 8),
            SizedBox(
              height: 160,
              child: spots.isEmpty
                ? const Center(child: Text('No data yet',
                    style: TextStyle(color: kInkSoft, fontSize: 12)))
                : LineChart(LineChartData(
                    minY: yMin, maxY: yMax,
                    gridData: const FlGridData(show: true, drawVerticalLine: false),
                    borderData: FlBorderData(show: false),
                    titlesData: const FlTitlesData(
                      topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    ),
                    lineBarsData: [
                      LineChartBarData(
                        spots: spots,
                        isCurved: true,
                        color: colour,
                        barWidth: 2,
                        dotData: const FlDotData(show: false),
                        belowBarData: BarAreaData(
                          show: true,
                          color: colour.withOpacity(0.15)),
                      ),
                    ],
                  )),
            ),
          ],
        ),
      ),
    );
  }
}
