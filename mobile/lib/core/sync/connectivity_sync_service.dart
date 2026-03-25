import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';

import 'retry_queue_service.dart';

class ConnectivitySyncService {
  ConnectivitySyncService(this._retryQueueService);

  final RetryQueueService _retryQueueService;
  StreamSubscription<List<ConnectivityResult>>? _subscription;
  Timer? _timer;

  void start() {
    stop();

    _subscription = Connectivity().onConnectivityChanged.listen((results) {
      final hasNetwork = !results.contains(ConnectivityResult.none);
      if (hasNetwork) {
        _retryQueueService.processPending();
      }
    });

    _timer = Timer.periodic(const Duration(seconds: 30), (_) {
      _retryQueueService.processPending();
    });
  }

  void stop() {
    _subscription?.cancel();
    _subscription = null;
    _timer?.cancel();
    _timer = null;
  }
}
