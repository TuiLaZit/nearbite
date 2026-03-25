class RestaurantImageModel {
  const RestaurantImageModel({
    required this.id,
    required this.imageUrl,
    this.caption,
    this.isPrimary = false,
  });

  final int id;
  final String imageUrl;
  final String? caption;
  final bool isPrimary;

  factory RestaurantImageModel.fromJson(Map<String, dynamic> json) {
    return RestaurantImageModel(
      id: (json['id'] as num?)?.toInt() ?? 0,
      imageUrl: (json['image_url'] ?? '').toString(),
      caption: json['caption']?.toString(),
      isPrimary: json['is_primary'] == true,
    );
  }
}
