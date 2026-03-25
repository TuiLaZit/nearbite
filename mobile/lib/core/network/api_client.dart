import 'dart:io';
import 'dart:async';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:path_provider/path_provider.dart';

import '../config/env.dart';
import '../sync/retry_queue_service.dart';

class SessionExpiredBus {
  SessionExpiredBus._();

  static final SessionExpiredBus instance = SessionExpiredBus._();
  final StreamController<void> _controller = StreamController<void>.broadcast();

  Stream<void> get stream => _controller.stream;

  void emit() {
    if (!_controller.isClosed) {
      _controller.add(null);
    }
  }
}

class ApiClient {
  ApiClient._(this.dio, this.retryQueue);

  final Dio dio;
  final RetryQueueService retryQueue;

  static Future<ApiClient> build() async {
    final tempDir = await getTemporaryDirectory();
    final cookieJar = PersistCookieJar(
      storage: FileStorage('${tempDir.path}/nearbite_cookie_jar'),
      ignoreExpires: false,
    );

    final baseUrl = Env.normalizeBaseUrl(Env.apiBaseUrl);
    final dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 25),
        sendTimeout: const Duration(seconds: 20),
        headers: {
          HttpHeaders.contentTypeHeader: 'application/json',
          HttpHeaders.acceptHeader: 'application/json',
        },
      ),
    );

    final retryQueue = RetryQueueService(dio);

    dio.interceptors.add(CookieManager(cookieJar));
    dio.interceptors.add(LogInterceptor(
      requestBody: true,
      responseBody: false,
      requestHeader: false,
      responseHeader: false,
    ));

    dio.interceptors.add(
      InterceptorsWrapper(
        onError: (error, handler) {
          final status = error.response?.statusCode ?? 0;
          final path = error.requestOptions.path;
          final isAuthPath = path.contains('/owner/login') ||
              path.contains('/customer/request-otp') ||
              path.contains('/customer/verify-otp') ||
              path.contains('/admin/login');
          if (status == 401 && !isAuthPath) {
            SessionExpiredBus.instance.emit();
          }
          handler.next(error);
        },
      ),
    );

    return ApiClient._(dio, retryQueue);
  }
}
