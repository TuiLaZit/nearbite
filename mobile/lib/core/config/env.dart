import 'package:flutter_dotenv/flutter_dotenv.dart';

class Env {
  Env._();

  // Inject at build time:
  // flutter run --dart-define=API_BASE_URL=https://your-backend.example.com
  static const String _apiBaseUrlFromDefine = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:5000',
  );

  static String get apiBaseUrl {
    final fromFile = dotenv.env['API_BASE_URL'];
    if (fromFile != null && fromFile.trim().isNotEmpty) {
      return normalizeBaseUrl(fromFile);
    }
    return normalizeBaseUrl(_apiBaseUrlFromDefine);
  }

  static String normalizeBaseUrl(String value) {
    final trimmed = value.trim();
    if (trimmed.endsWith('/')) {
      return trimmed.substring(0, trimmed.length - 1);
    }
    return trimmed;
  }
}
