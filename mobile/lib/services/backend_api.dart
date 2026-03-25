import 'package:dio/dio.dart';

import '../core/cache/app_cache.dart';
import '../core/models/language_option.dart';
import '../core/models/location_result.dart';
import '../core/models/restaurant_model.dart';
import '../core/models/tag_model.dart';
import '../core/models/tour_model.dart';
import '../core/network/api_client.dart';

class BackendApi {
  BackendApi(this._apiClient);

  final ApiClient _apiClient;

  Dio get _dio => _apiClient.dio;

  Future<List<LanguageOption>> getLanguages() async {
    try {
      final response = await _dio.get('/languages');
      final data = (response.data as Map<String, dynamic>);
      final list = (data['languages'] as List?) ?? const [];
      await AppCache.saveJson('cache_languages', list);
      return list
          .whereType<Map<String, dynamic>>()
          .map(LanguageOption.fromJson)
          .toList();
    } on DioException {
      final cached = await AppCache.readJsonList('cache_languages') ?? const [];
      return cached
          .whereType<Map<String, dynamic>>()
          .map(LanguageOption.fromJson)
          .toList();
    }
  }

  Future<List<RestaurantModel>> getRestaurants({required String lang}) async {
    try {
      final response = await _dio.get('/restaurants', queryParameters: {'lang': lang});
      final data = response.data as Map<String, dynamic>;
      final list = (data['restaurants'] as List?) ?? const [];
      await AppCache.saveJson('cache_restaurants_$lang', list);
      return list
          .whereType<Map<String, dynamic>>()
          .map(RestaurantModel.fromJson)
          .toList();
    } on DioException {
      final cached = await AppCache.readJsonList('cache_restaurants_$lang') ?? const [];
      return cached
          .whereType<Map<String, dynamic>>()
          .map(RestaurantModel.fromJson)
          .toList();
    }
  }

  Future<List<TagModel>> getPublicTags({required String lang}) async {
    try {
      final response = await _dio.get('/tags', queryParameters: {'lang': lang});
      final data = response.data as Map<String, dynamic>;
      final list = (data['tags'] as List?) ?? const [];
      await AppCache.saveJson('cache_tags_$lang', list);
      return list
          .whereType<Map<String, dynamic>>()
          .map(TagModel.fromJson)
          .toList();
    } on DioException {
      final cached = await AppCache.readJsonList('cache_tags_$lang') ?? const [];
      return cached
          .whereType<Map<String, dynamic>>()
          .map(TagModel.fromJson)
          .toList();
    }
  }

  Future<void> customerRequestOtp({required String email}) async {
    await _dio.post('/customer/request-otp', data: {'email': email});
  }

  Future<Map<String, dynamic>> customerVerifyOtp({
    required String email,
    required String otp,
  }) async {
    final response = await _dio.post('/customer/verify-otp', data: {
      'email': email,
      'otp': otp,
    });
    return (response.data as Map).cast<String, dynamic>();
  }

  Future<bool> customerCheck() async {
    try {
      final response = await _dio.get('/customer/check');
      return response.statusCode == 200;
    } on DioException {
      return false;
    }
  }

  Future<void> customerLogout() async {
    await _dio.post('/customer/logout');
  }

  Future<Map<String, dynamic>> ownerLogin({
    required String username,
    required String password,
  }) async {
    final response = await _dio.post('/owner/login', data: {
      'username': username,
      'password': password,
    });
    return (response.data as Map).cast<String, dynamic>();
  }

  Future<bool> ownerCheck() async {
    try {
      final response = await _dio.get('/owner/check');
      return response.statusCode == 200;
    } on DioException {
      return false;
    }
  }

  Future<void> ownerLogout() async {
    await _dio.post('/owner/logout');
  }

  Future<LocationResult> postLocation({
    required double lat,
    required double lng,
    required String language,
    bool allowNetworkTranslation = false,
  }) async {
    final response = await _dio.post('/location', data: {
      'latitude': lat,
      'longitude': lng,
      'language': language,
      'allow_network_translation': allowNetworkTranslation,
    });
    return LocationResult.fromJson((response.data as Map).cast<String, dynamic>());
  }

  Future<List<TourModel>> planTour({
    required int timeLimit,
    required int budget,
    required List<int> tags,
    double? userLat,
    double? userLng,
  }) async {
    final response = await _dio.post('/plan-tour', data: {
      'time_limit': timeLimit,
      'budget': budget,
      'tags': tags,
      'user_lat': userLat,
      'user_lng': userLng,
    });

    final data = (response.data as Map).cast<String, dynamic>();
    final list = (data['tours'] as List?) ?? const [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(TourModel.fromJson)
        .toList();
  }

  Future<void> heartbeat({
    required String deviceId,
    double? lat,
    double? lng,
  }) async {
    final payload = {
      'device_id': deviceId,
      'latitude': lat,
      'longitude': lng,
      'user_id': null,
    };
    try {
      await _dio.post('/heartbeat', data: payload);
    } on DioException {
      await _apiClient.retryQueue.enqueue(method: 'POST', path: '/heartbeat', data: payload);
    }
  }

  Future<void> trackLocation({
    required double lat,
    required double lng,
    required int durationSeconds,
    int? restaurantId,
  }) async {
    final payload = {
      'lat': lat,
      'lng': lng,
      'duration_seconds': durationSeconds,
      'restaurant_id': restaurantId,
    };
    try {
      await _dio.post('/track-location', data: payload);
    } on DioException {
      await _apiClient.retryQueue.enqueue(method: 'POST', path: '/track-location', data: payload);
    }
  }

  Future<void> trackAudio({
    required int restaurantId,
    required int durationSeconds,
  }) async {
    final payload = {
      'restaurant_id': restaurantId,
      'duration_seconds': durationSeconds,
    };
    try {
      await _dio.post('/track-audio', data: payload);
    } on DioException {
      await _apiClient.retryQueue.enqueue(method: 'POST', path: '/track-audio', data: payload);
    }
  }

  Future<List<TagModel>> getAdminTags() async {
    final response = await _dio.get('/admin/tags');
    final list = (response.data as List?) ?? const [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(TagModel.fromJson)
        .toList();
  }

  Future<RestaurantModel> getOwnerRestaurant() async {
    final response = await _dio.get(
      '/admin/restaurants/analytics',
      queryParameters: {'page': 1, 'per_page': 1},
    );

    final data = (response.data as Map).cast<String, dynamic>();
    final list = (data['restaurants'] as List?) ?? const [];
    if (list.isEmpty) {
      throw DioException(
        requestOptions: response.requestOptions,
        message: 'No assigned restaurant for owner',
      );
    }

    final map = (list.first as Map).cast<String, dynamic>();
    return RestaurantModel.fromJson(map);
  }

  Future<void> updateRestaurant({
    required int restaurantId,
    required String name,
    required double lat,
    required double lng,
    required int avgEatTime,
    required double poiRadiusKm,
    required String description,
  }) async {
    await _dio.put('/admin/restaurants/$restaurantId', data: {
      'name': name,
      'lat': lat,
      'lng': lng,
      'avg_eat_time': avgEatTime,
      'poi_radius_km': poiRadiusKm,
      'description': description,
    });
  }

  Future<void> createMenuItem({
    required int restaurantId,
    required String name,
    required int price,
  }) async {
    await _dio.post('/admin/restaurants/$restaurantId/menu', data: {
      'name': name,
      'price': price,
    });
  }

  Future<void> updateMenuItem({
    required int menuId,
    required String name,
    required int price,
  }) async {
    await _dio.put('/admin/menu/$menuId', data: {
      'name': name,
      'price': price,
    });
  }

  Future<void> deleteMenuItem({required int menuId}) async {
    await _dio.delete('/admin/menu/$menuId');
  }

  Future<void> attachTag({required int restaurantId, required int tagId}) async {
    await _dio.post('/admin/restaurants/$restaurantId/tags/$tagId');
  }

  Future<void> detachTag({required int restaurantId, required int tagId}) async {
    await _dio.delete('/admin/restaurants/$restaurantId/tags/$tagId');
  }

  Future<void> uploadAndSaveImage({
    required int restaurantId,
    required String filePath,
    required String caption,
    required bool isPrimary,
    required int displayOrder,
  }) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath),
    });

    final uploadResponse = await _dio.post('/admin/upload-image', data: formData);
    final uploadData = (uploadResponse.data as Map).cast<String, dynamic>();
    final imageUrl = (uploadData['url'] ?? '').toString();

    if (imageUrl.isEmpty) {
      throw DioException(
        requestOptions: uploadResponse.requestOptions,
        message: 'Image upload did not return url',
      );
    }

    await _dio.post('/admin/restaurants/$restaurantId/images', data: {
      'image_url': imageUrl,
      'caption': caption,
      'is_primary': isPrimary,
      'display_order': displayOrder,
    });
  }

  Future<void> deleteImage({required int imageId}) async {
    await _dio.delete('/admin/images/$imageId');
  }
}
