class MenuItemModel {
  const MenuItemModel({
    required this.id,
    required this.name,
    required this.price,
  });

  final int id;
  final String name;
  final int price;

  factory MenuItemModel.fromJson(Map<String, dynamic> json) {
    return MenuItemModel(
      id: (json['id'] as num?)?.toInt() ?? 0,
      name: (json['name'] ?? '').toString(),
      price: (json['price'] as num?)?.toInt() ?? 0,
    );
  }
}
