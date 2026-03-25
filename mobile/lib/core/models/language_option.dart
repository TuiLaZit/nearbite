class LanguageOption {
  const LanguageOption({required this.code, required this.label});

  final String code;
  final String label;

  factory LanguageOption.fromJson(Map<String, dynamic> json) {
    return LanguageOption(
      code: (json['code'] ?? 'vi').toString(),
      label: (json['label'] ?? json['code'] ?? 'Vietnamese').toString(),
    );
  }
}
