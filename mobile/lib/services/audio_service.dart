import 'package:just_audio/just_audio.dart';

class AudioService {
  final AudioPlayer _player = AudioPlayer();
  String? _cachedUrl;
  AudioSource? _cachedSource;

  AudioPlayer get player => _player;

  Future<void> playFromUrl(String url) async {
    try {
      if (_cachedUrl != url) {
        _cachedUrl = url;
        _cachedSource = LockCachingAudioSource(Uri.parse(url));
      }

      await _player.stop();
      await _player.setAudioSource(_cachedSource!);
      await _player.seek(Duration.zero);
      await _player.play();
    } on PlayerInterruptedException {
      // Safe to ignore when a new source interrupts previous loading.
    } catch (e) {
      final message = e.toString();
      if (message.contains('Loading interrupted') || message.contains('PlatformException(abort')) {
        return;
      }

      // Fallback to direct stream source when local caching fails.
      await _player.stop();
      await _player.setUrl(url);
      await _player.seek(Duration.zero);
      await _player.play();
    }
  }

  Future<void> playFromFilePath(String filePath) async {
    await _player.stop();
    await _player.setFilePath(filePath);
    await _player.seek(Duration.zero);
    await _player.play();
  }

  Future<void> stop() async {
    await _player.stop();
  }

  Future<void> dispose() async {
    await _player.dispose();
  }
}
