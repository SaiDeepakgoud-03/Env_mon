import 'package:flutter/material.dart';

import 'theme.dart';
import 'pages/home_page.dart';

void main() => runApp(const EnvMonApp());

class EnvMonApp extends StatelessWidget {
  const EnvMonApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EnvMon',
      theme: envMonTheme(),
      debugShowCheckedModeBanner: false,
      home: const HomePage(),
    );
  }
}
