import 'package:shared_preferences/shared_preferences.dart';

class LanguageStore {
  LanguageStore._();

  static const String _key = 'app_language';

  static Future<String?> read() async {
    final prefs = await SharedPreferences.getInstance();
    final value = prefs.getString(_key);
    if (value == null || value.trim().isEmpty) {
      return null;
    }
    return value;
  }

  static Future<void> save(String languageCode) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, languageCode);
  }
}
