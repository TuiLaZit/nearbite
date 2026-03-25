import 'menu_item_model.dart';
import 'restaurant_image_model.dart';
import 'tag_model.dart';

class RestaurantModel {
  const RestaurantModel({
    required this.id,
    required this.name,
    required this.lat,
    required this.lng,
    this.description,
    this.avgEatTime = 0,
    this.poiRadiusKm = 0.03,
    this.visitCount = 0,
    this.avgVisitDuration = 0,
    this.avgAudioDuration = 0,
    this.menu = const [],
    this.images = const [],
    this.tags = const [],
  });

  final int id;
  final String name;
  final double lat;
  final double lng;
  final String? description;
  final int avgEatTime;
  final double poiRadiusKm;
  final int visitCount;
  final int avgVisitDuration;
  final int avgAudioDuration;
  final List<MenuItemModel> menu;
  final List<RestaurantImageModel> images;
  final List<TagModel> tags;

  factory RestaurantModel.fromJson(Map<String, dynamic> json) {
    final menuJson = (json['menu'] as List?) ?? (json['menu_items'] as List?) ?? const [];
    final imagesJson = (json['images'] as List?) ?? const [];
    final tagsJson = (json['tags'] as List?) ?? const [];

    return RestaurantModel(
      id: (json['id'] as num?)?.toInt() ?? 0,
      name: (json['name'] ?? '').toString(),
      lat: (json['lat'] as num?)?.toDouble() ?? 0,
      lng: (json['lng'] as num?)?.toDouble() ?? 0,
      description: json['description']?.toString(),
      avgEatTime: (json['avg_eat_time'] as num?)?.toInt() ?? 0,
      poiRadiusKm: (json['poi_radius_km'] as num?)?.toDouble() ?? 0.03,
      visitCount: (json['visit_count'] as num?)?.toInt() ?? 0,
      avgVisitDuration: (json['avg_visit_duration'] as num?)?.toInt() ?? 0,
      avgAudioDuration: (json['avg_audio_duration'] as num?)?.toInt() ?? 0,
      menu: menuJson
          .whereType<Map<String, dynamic>>()
          .map(MenuItemModel.fromJson)
          .toList(),
      images: imagesJson
          .whereType<Map<String, dynamic>>()
          .map(RestaurantImageModel.fromJson)
          .toList(),
      tags: tagsJson
          .whereType<Map<String, dynamic>>()
          .map(TagModel.fromJson)
          .toList(),
    );
  }
}
