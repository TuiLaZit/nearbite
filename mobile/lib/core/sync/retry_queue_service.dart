import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

class RetryQueueService {
  RetryQueueService(this._dio);

  final Dio _dio;
  static const String _queueKey = 'retry_queue_v1';

  Future<void> enqueue({
    required String method,
    required String path,
    Map<String, dynamic>? data,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final list = prefs.getStringList(_queueKey) ?? <String>[];

    list.add(jsonEncode({
      'method': method,
      'path': path,
      'data': data ?? <String, dynamic>{},
      'created_at': DateTime.now().toIso8601String(),
    }));

    await prefs.setStringList(_queueKey, list);
  }

  Future<int> processPending() async {
    final prefs = await SharedPreferences.getInstance();
    final list = prefs.getStringList(_queueKey) ?? <String>[];
    if (list.isEmpty) {
      return 0;
    }

    final remaining = <String>[];
    var successCount = 0;

    for (final raw in list) {
      try {
        final item = jsonDecode(raw) as Map<String, dynamic>;
        final method = (item['method'] ?? 'POST').toString().toUpperCase();
        final path = (item['path'] ?? '').toString();
        final data = (item['data'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{};

        await _dio.request(
          path,
          data: data,
          options: Options(method: method),
        );
        successCount += 1;
      } catch (_) {
        remaining.add(raw);
      }
    }

    await prefs.setStringList(_queueKey, remaining);
    return successCount;
  }
}
