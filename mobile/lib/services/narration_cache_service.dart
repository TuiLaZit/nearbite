import 'dart:io';

import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';

import '../core/cache/app_cache.dart';

class NarrationCacheRecord {
  const NarrationCacheRecord({
    required this.restaurantId,
    required this.language,
    required this.narration,
    required this.signature,
    this.audioUrl,
    this.audioFilePath,
    this.updatedAt,
  });

  final int restaurantId;
  final String language;
  final String narration;
  final String signature;
  final String? audioUrl;
  final String? audioFilePath;
  final String? updatedAt;

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'restaurant_id': restaurantId,
      'language': language,
      'narration': narration,
      'signature': signature,
      'audio_url': audioUrl,
      'audio_file_path': audioFilePath,
      'updated_at': updatedAt,
    };
  }

  factory NarrationCacheRecord.fromJson(Map<String, dynamic> json) {
    return NarrationCacheRecord(
      restaurantId: (json['restaurant_id'] as num?)?.toInt() ?? 0,
      language: (json['language'] ?? '').toString(),
      narration: (json['narration'] ?? '').toString(),
      signature: (json['signature'] ?? '').toString(),
      audioUrl: json['audio_url']?.toString(),
      audioFilePath: json['audio_file_path']?.toString(),
      updatedAt: json['updated_at']?.toString(),
    );
  }
}

class NarrationCacheService {
  const NarrationCacheService();

  Future<NarrationCacheRecord?> read({
    required int restaurantId,
    required String language,
  }) async {
    final map = await AppCache.readJsonMap(_cacheKey(restaurantId, language));
    if (map == null) {
      return null;
    }

    final record = NarrationCacheRecord.fromJson(map);
    if (record.audioFilePath != null && record.audioFilePath!.isNotEmpty) {
      final exists = await File(record.audioFilePath!).exists();
      if (!exists) {
        return NarrationCacheRecord(
          restaurantId: record.restaurantId,
          language: record.language,
          narration: record.narration,
          signature: record.signature,
          audioUrl: record.audioUrl,
          audioFilePath: null,
          updatedAt: record.updatedAt,
        );
      }
    }
    return record;
  }

  Future<NarrationCacheRecord> upsert({
    required int restaurantId,
    required String language,
    required String narration,
    required String? audioUrl,
    required Dio dio,
  }) async {
    final normalizedLang = _normalizeLanguage(language);
    final normalizedAudioUrl = _normalizeAudioUrl(audioUrl);
    final signature = _signature(narration, normalizedAudioUrl);
    final key = _cacheKey(restaurantId, normalizedLang);
    final existing = await read(restaurantId: restaurantId, language: normalizedLang);

    if (existing != null && existing.signature == signature) {
      return existing;
    }

    if (existing?.audioFilePath != null && existing!.audioFilePath!.isNotEmpty) {
      final oldFile = File(existing.audioFilePath!);
      if (await oldFile.exists()) {
        await oldFile.delete();
      }
    }

    String? localAudioPath;
    if (normalizedAudioUrl != null) {
      localAudioPath = await _downloadAudio(
        dio: dio,
        restaurantId: restaurantId,
        language: normalizedLang,
        sourceUrl: normalizedAudioUrl,
      );
    }

    final record = NarrationCacheRecord(
      restaurantId: restaurantId,
      language: normalizedLang,
      narration: narration,
      signature: signature,
      audioUrl: normalizedAudioUrl,
      audioFilePath: localAudioPath,
      updatedAt: DateTime.now().toIso8601String(),
    );

    await AppCache.saveJson(key, record.toJson());
    return record;
  }

  String _cacheKey(int restaurantId, String language) {
    return 'cache_narration_${restaurantId}_${_normalizeLanguage(language)}';
  }

  String _normalizeLanguage(String language) {
    final raw = language.trim().toLowerCase();
    if (raw.isEmpty) return 'vi';
    return raw.replaceAll(RegExp(r'[^a-z0-9_-]'), '');
  }

  String? _normalizeAudioUrl(String? audioUrl) {
    if (audioUrl == null) return null;
    final trimmed = audioUrl.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  String _signature(String narration, String? audioUrl) {
    final payload = '${narration.trim()}|${audioUrl ?? ''}';
    return payload.hashCode.toString();
  }

  Future<String?> _downloadAudio({
    required Dio dio,
    required int restaurantId,
    required String language,
    required String sourceUrl,
  }) async {
    try {
      final docsDir = await getApplicationDocumentsDirectory();
      final cacheDir = Directory('${docsDir.path}/narration_cache');
      if (!await cacheDir.exists()) {
        await cacheDir.create(recursive: true);
      }

      final extension = _audioExtensionFromUrl(sourceUrl);
      final fileName = '${restaurantId}_${language}_${DateTime.now().millisecondsSinceEpoch}$extension';
      final targetPath = '${cacheDir.path}/$fileName';

      await dio.download(sourceUrl, targetPath);
      final file = File(targetPath);
      if (await file.exists()) {
        return file.path;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  String _audioExtensionFromUrl(String url) {
    final uri = Uri.tryParse(url);
    final path = uri?.path ?? '';
    final dot = path.lastIndexOf('.');
    if (dot < 0 || dot == path.length - 1) {
      return '.mp3';
    }

    final ext = path.substring(dot);
    if (ext.length > 6) {
      return '.mp3';
    }
    return ext;
  }
}
