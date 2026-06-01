import 'package:flutter/material.dart';

const kPrimary  = Color(0xFF14B8A6);   // teal-500
const kAccent   = Color(0xFF2563EB);   // blue-600
const kSurface  = Color(0xFFEDF7F3);   // soft mint
const kCard     = Color(0xFFFFFFFF);
const kInk      = Color(0xFF0F1B2D);
const kInkSoft  = Color(0xFF57708A);
const kOk       = Color(0xFF22C55E);
const kBad      = Color(0xFFEF4444);
const kWarn     = Color(0xFFEAB308);

ThemeData envMonTheme() {
  return ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: kPrimary,
      brightness: Brightness.light,
    ).copyWith(
      surface: kSurface,
      primary: kPrimary,
      secondary: kAccent,
    ),
    scaffoldBackgroundColor: kSurface,
    fontFamily: 'Roboto',
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      elevation: 0,
      foregroundColor: kInk,
      titleTextStyle: TextStyle(
        color: kInk, fontWeight: FontWeight.w700, fontSize: 20),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: kPrimary,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFFCFE2DC)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFFCFE2DC)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: kPrimary, width: 2),
      ),
    ),
    cardTheme: CardThemeData(
      color: kCard,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
  );
}
