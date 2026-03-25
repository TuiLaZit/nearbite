class TagModel {
  const TagModel({
    required this.id,
    required this.name,
    this.description,
    this.color,
    this.icon,
  });

  final int id;
  final String name;
  final String? description;
  final String? color;
  final String? icon;

  factory TagModel.fromJson(Map<String, dynamic> json) {
    return TagModel(
      id: (json['id'] as num?)?.toInt() ?? 0,
      name: (json['name'] ?? '').toString(),
      description: json['description']?.toString(),
      color: json['color']?.toString(),
      icon: json['icon']?.toString(),
    );
  }
}
