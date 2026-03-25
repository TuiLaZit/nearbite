import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

class DeviceIdService {
  DeviceIdService._();

  static const _kDeviceId = 'device_id';
  static const _uuid = Uuid();

  static Future<String> getOrCreate() async {
    final prefs = await SharedPreferences.getInstance();
    final existing = prefs.getString(_kDeviceId);
    if (existing != null && existing.isNotEmpty) {
      return existing;
    }

    final id = _uuid.v4();
    await prefs.setString(_kDeviceId, id);
    return id;
  }
}
