import 'restaurant_model.dart';

class TourModel {
  const TourModel({
    required this.strategy,
    required this.totalTime,
    required this.totalCost,
    required this.restaurants,
  });

  final String strategy;
  final int totalTime;
  final int totalCost;
  final List<RestaurantModel> restaurants;

  factory TourModel.fromJson(Map<String, dynamic> json) {
    final restaurantsJson = (json['restaurants'] as List?) ?? const [];

    return TourModel(
      strategy: (json['strategy'] ?? 'best_score').toString(),
      totalTime: (json['total_time'] as num?)?.toInt() ?? 0,
      totalCost: (json['total_cost'] as num?)?.toInt() ?? 0,
      restaurants: restaurantsJson
          .whereType<Map<String, dynamic>>()
          .map(RestaurantModel.fromJson)
          .toList(),
    );
  }
}
