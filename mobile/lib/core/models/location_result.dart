import 'restaurant_model.dart';

class LocationResult {
  const LocationResult({
    required this.narration,
    required this.distanceKm,
    required this.poiRadiusKm,
    required this.nearestPlace,
    this.audioUrl,
    this.outOfRangeMessage,
  });

  final String narration;
  final double distanceKm;
  final double poiRadiusKm;
  final RestaurantModel nearestPlace;
  final String? audioUrl;
  final String? outOfRangeMessage;

  factory LocationResult.fromJson(Map<String, dynamic> json) {
    return LocationResult(
      narration: (json['narration'] ?? '').toString(),
      distanceKm: (json['distance_km'] as num?)?.toDouble() ?? 0,
      poiRadiusKm: (json['poi_radius_km'] as num?)?.toDouble() ?? 0.03,
      nearestPlace: RestaurantModel.fromJson(
        (json['nearest_place'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{},
      ),
      audioUrl: json['audio_url']?.toString(),
      outOfRangeMessage: json['out_of_range_message']?.toString(),
    );
  }
}
