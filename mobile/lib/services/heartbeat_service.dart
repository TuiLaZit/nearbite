import 'dart:async';

import '../core/auth/device_id_service.dart';
import 'backend_api.dart';

class HeartbeatService {
  HeartbeatService(this._api);

  final BackendApi _api;
  Timer? _timer;
  static const Duration _interval = Duration(seconds: 10);

  void start({required double? Function() lat, required double? Function() lng}) {
    stop();
    unawaited(_beatOnce(lat: lat, lng: lng));
    _timer = Timer.periodic(_interval, (_) {
      unawaited(_beatOnce(lat: lat, lng: lng));
    });
  }

  Future<void> beatNow({required double? lat, required double? lng}) async {
    await _beatOnce(lat: () => lat, lng: () => lng);
  }

  Future<void> _beatOnce({required double? Function() lat, required double? Function() lng}) async {
    try {
      final deviceId = await DeviceIdService.getOrCreate();
      await _api.heartbeat(deviceId: deviceId, lat: lat(), lng: lng());
    } catch (_) {
      // Keep heartbeat loop alive even if one request fails.
    }
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }
}
