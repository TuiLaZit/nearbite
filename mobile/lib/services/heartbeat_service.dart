import 'dart:async';

import '../core/auth/device_id_service.dart';
import 'backend_api.dart';

class HeartbeatService {
  HeartbeatService(this._api);

  final BackendApi _api;
  Timer? _timer;

  void start({required double Function() lat, required double Function() lng}) {
    stop();
    _timer = Timer.periodic(const Duration(seconds: 20), (_) async {
      try {
        final deviceId = await DeviceIdService.getOrCreate();
        await _api.heartbeat(deviceId: deviceId, lat: lat(), lng: lng());
      } catch (_) {
        // Keep heartbeat loop alive even if one request fails.
      }
    });
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }
}
