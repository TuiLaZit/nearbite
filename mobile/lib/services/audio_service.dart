import 'package:just_audio/just_audio.dart';

class AudioService {
  final AudioPlayer _player = AudioPlayer();

  AudioPlayer get player => _player;

  Future<void> playFromUrl(String url) async {
    try {
      await _player.stop();
      await _player.setUrl(url);
      await _player.play();
    } on PlayerInterruptedException {
      // Safe to ignore when a new source interrupts previous loading.
    } catch (e) {
      final message = e.toString();
      if (message.contains('Loading interrupted') || message.contains('PlatformException(abort')) {
        return;
      }
      rethrow;
    }
  }

  Future<void> stop() async {
    await _player.stop();
  }

  Future<void> dispose() async {
    await _player.dispose();
  }
}
