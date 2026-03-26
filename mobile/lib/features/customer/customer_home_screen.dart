import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:geolocator/geolocator.dart';
import 'package:just_audio/just_audio.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/auth/session_store.dart';
import '../../core/auth/device_id_service.dart';
import '../../core/models/language_option.dart';
import '../../core/models/location_result.dart';
import '../../core/models/restaurant_model.dart';
import '../../core/network/api_client.dart';
import '../../core/settings/language_store.dart';
import '../../services/audio_service.dart';
import '../../services/backend_api.dart';
import '../../services/heartbeat_service.dart';
import '../../services/location_service.dart';
import '../../services/narration_cache_service.dart';
import '../auth/login_screen.dart';
import '../auth/role_selection_screen.dart';
import 'tour_planner_screen.dart';

class CustomerHomeScreen extends StatefulWidget {
  const CustomerHomeScreen({
    super.key,
    required this.apiClient,
    this.title = 'NearBite Customer',
    this.guestMode = false,
    this.showTourButton = true,
    this.showLanguageSelector = true,
    this.initialLanguage,
  });

  final ApiClient apiClient;
  final String title;
  final bool guestMode;
  final bool showTourButton;
  final bool showLanguageSelector;
  final String? initialLanguage;

  @override
  State<CustomerHomeScreen> createState() => _CustomerHomeScreenState();
}

class _CustomerHomeScreenState extends State<CustomerHomeScreen> {
  late final BackendApi _api;
  final LocationService _locationService = LocationService();
  final AudioService _audioService = AudioService();
  final NarrationCacheService _narrationCacheService = const NarrationCacheService();
  final MapController _mapController = MapController();
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final GlobalKey _poiPanelKey = GlobalKey();

  Timer? _trackingTimer;
  HeartbeatService? _heartbeatService;
  bool _isTracking = false;
  bool _autoTrackEnabled = true;
  bool _batterySaverEnabled = false;
  bool _loading = true;
  bool _isCustomerAuthed = false;

  String _language = 'vi';
  List<LanguageOption> _languages = const [];
  List<RestaurantModel> _restaurants = const [];

  Position? _position;
  LocationResult? _lastLocationResult;
  String? _error;

  DateTime? _audioStartAt;
  int? _activeAudioRestaurantId;
  String? _lastPlayedAudioUrl;
  StreamSubscription<void>? _sessionExpiredSub;
  StreamSubscription<PlayerState>? _playerStateSub;
  bool _isInPoi = false;
  bool _isLanguageReloading = false;
  bool _isAudioActionInProgress = false;
  bool _isPoiAudioPlaying = false;
  bool _isAudioPreparing = false;
  RestaurantModel? _selectedRestaurant;
  String? _selectedNarration;
  String? _selectedAudioUrl;
  String? _selectedCachedAudioPath;
  String? _poiCachedAudioPath;
  double? _selectedDistanceKm;
  bool _selectedLoading = false;
  bool _selectedLoadError = false;
  DateTime? _poiEnteredAt;
  double _poiPanelMeasuredHeight = 0;
  DateTime? _manualPlaybackUntil;
  int _selectedLoadRequestId = 0;
  final Map<int, DateTime> _playedRestaurants = <int, DateTime>{};

  static const Duration _poiDebounceDuration = Duration(seconds: 2);
  static const Duration _autoPlayCooldownDuration = Duration(minutes: 5);

  @override
  void initState() {
    super.initState();
    _api = BackendApi(widget.apiClient);
    _heartbeatService = HeartbeatService(_api);
    _playerStateSub = _audioService.player.playerStateStream.listen((state) {
      if (!mounted) return;

      final nowPlaying = state.playing && state.processingState != ProcessingState.completed;

      if (state.processingState == ProcessingState.completed) {
        // Flip button state immediately when audio reaches the end.
        if (_isPoiAudioPlaying || _isAudioActionInProgress) {
          setState(() {
            _isPoiAudioPlaying = false;
            _isAudioActionInProgress = false;
          });
        }
        unawaited(_stopAudioAndTrack());
        return;
      }

      if (_isPoiAudioPlaying != nowPlaying) {
        setState(() {
          _isPoiAudioPlaying = nowPlaying;
        });
      }
    });
    _sessionExpiredSub = SessionExpiredBus.instance.stream.listen((_) {
      if (!mounted) return;
      unawaited(_pauseRealtimeFeatures());
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => RoleSelectionScreen(apiClient: widget.apiClient)),
        (route) => false,
      );
    });
    unawaited(_restoreLanguageAndBootstrap());
  }

  Future<void> _restoreLanguageAndBootstrap() async {
    final saved = await LanguageStore.read();
    _language = widget.initialLanguage ?? saved ?? 'vi';
    if (mounted) {
      setState(() {});
    }
    await _bootstrap();
  }

  Future<void> _bootstrap() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final languages = await _api.getLanguages();
      final restaurants = await _api.getRestaurants(lang: _apiLanguageCode(_language));
      final authed = widget.guestMode ? false : await _api.customerCheck();
      final position = await _locationService.getCurrentPosition();

      final languageForSelector = _selectLanguageValue(_language, languages);

      setState(() {
        _languages = languages;
        _language = languageForSelector;
        _restaurants = restaurants;
        _isCustomerAuthed = authed;
        _position = position;
      });

      // Do not block initial map render on network call.
      // Keep cache-first behavior for faster POI refresh.
      unawaited(_runLocationCycle(position: position));
      if (_autoTrackEnabled) {
        _startTracking();
      }
    } on DioException catch (e) {
      setState(() => _error = _dioMessage(e));
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  String _dioMessage(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['error'] != null) {
      return data['error'].toString();
    }
    return e.message ?? 'Request failed';
  }

  Future<void> _runLocationCycle({
    Position? position,
    bool allowNetworkTranslation = false,
    bool suppressAutoPlay = false,
  }) async {
    final currentPos = position ?? await _locationService.getCurrentPosition();
    setState(() {
      _position = currentPos;
    });

    _mapController.move(
      LatLng(currentPos.latitude, currentPos.longitude),
      _mapController.camera.zoom.isFinite ? _mapController.camera.zoom : 16,
    );

    // Keep GPS UI updated, but avoid POI recalculation while audio is playing.
    if (_audioStartAt != null || _isAudioPreparing) {
      return;
    }

    try {
      final location = await _api.postLocation(
        lat: currentPos.latitude,
        lng: currentPos.longitude,
        language: _apiLanguageCode(_language),
        allowNetworkTranslation: allowNetworkTranslation,
      );

      if (_isTracking && !widget.guestMode) {
        try {
          await _api.trackLocation(
            lat: currentPos.latitude,
            lng: currentPos.longitude,
            durationSeconds: 15,
            restaurantId: location.nearestPlace.id,
          );
        } catch (_) {}
      }

      if (!widget.guestMode) {
        try {
          await _api.heartbeat(
            deviceId: await _deviceId(),
            lat: currentPos.latitude,
            lng: currentPos.longitude,
          );
        } catch (_) {}
      }

      setState(() {
        _lastLocationResult = location;
        _isInPoi = location.distanceKm <= location.poiRadiusKm;
        _poiCachedAudioPath = null;
      });

      unawaited(_warmNarrationCacheForLocation(location));

      final inPoiRange = location.distanceKm <= location.poiRadiusKm;
      final now = DateTime.now();

      if (inPoiRange) {
        _poiEnteredAt ??= now;
      } else {
        _poiEnteredAt = null;
      }

      final debouncePassed =
          _poiEnteredAt != null && now.difference(_poiEnteredAt!) >= _poiDebounceDuration;
      final manualPlaybackLocked =
          _manualPlaybackUntil != null && now.isBefore(_manualPlaybackUntil!);

      final inCooldown = _isAutoPlayInCooldown(location.nearestPlace.id);

      if (inPoiRange &&
          debouncePassed &&
          !manualPlaybackLocked &&
          !_batterySaverEnabled &&
          !inCooldown &&
          !suppressAutoPlay &&
          location.audioUrl != null &&
          location.audioUrl!.isNotEmpty &&
          _lastPlayedAudioUrl != location.audioUrl) {
        final resolved = _resolveAudioUrl(location.audioUrl);
        if (resolved != null) {
          final updated = LocationResult(
            narration: location.narration,
            distanceKm: location.distanceKm,
            poiRadiusKm: location.poiRadiusKm,
            nearestPlace: location.nearestPlace,
            audioUrl: resolved,
            outOfRangeMessage: location.outOfRangeMessage,
          );
          try {
            final cachedRecord = await _narrationCacheService.read(
              restaurantId: location.nearestPlace.id,
              language: _apiLanguageCode(_language),
            );
            await _startAudio(updated, localAudioPath: cachedRecord?.audioFilePath);
            _lastPlayedAudioUrl = resolved;
            _playedRestaurants[location.nearestPlace.id] = DateTime.now();
          } catch (e) {
            if (_isIgnorableAudioError(e)) {
              return;
            }
            if (!mounted) return;
            setState(() {
              _error = 'Khong the phat audio luc nay: $e';
            });
          }
        }
      } else if (!inPoiRange && _audioStartAt != null) {
        await _stopAudioAndTrack();
        _lastPlayedAudioUrl = null;
      }
    } catch (e) {
      setState(() {
        _error = 'GPS updated, but server sync failed: $e';
      });
    }
  }

  Future<String> _deviceId() async {
    return DeviceIdService.getOrCreate();
  }

  Future<void> _startAudio(LocationResult location, {String? localAudioPath}) async {
    final hasLocal = localAudioPath != null && localAudioPath.trim().isNotEmpty;
    final hasRemote = location.audioUrl != null && location.audioUrl!.isNotEmpty;
    if (!hasLocal && !hasRemote) {
      return;
    }
    if (mounted) {
      setState(() {
        _isAudioPreparing = true;
      });
    }
    try {
      if (hasLocal) {
        await _audioService.playFromFilePath(localAudioPath!);
      } else {
        await _audioService.playFromUrl(location.audioUrl!);
      }
      _audioStartAt = DateTime.now();
      _activeAudioRestaurantId = location.nearestPlace.id;
      if (mounted) {
        setState(() {
          _isPoiAudioPlaying = true;
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _isAudioPreparing = false;
        });
      }
    }
  }

  Future<void> _stopAudioAndTrack() async {
    final startAt = _audioStartAt;
    final restaurantId = _activeAudioRestaurantId;
    _audioStartAt = null;
    _activeAudioRestaurantId = null;
    await _audioService.stop();

    if (mounted) {
      setState(() {
        _isPoiAudioPlaying = false;
        _isAudioPreparing = false;
      });
    }

    if (startAt != null && restaurantId != null) {
      final duration = DateTime.now().difference(startAt).inSeconds;
      if (duration > 0) {
        unawaited(
          _api.trackAudio(
            restaurantId: restaurantId,
            durationSeconds: duration,
          ),
        );
      }
    }
  }

  bool _isAutoPlayInCooldown(int restaurantId) {
    final last = _playedRestaurants[restaurantId];
    if (last == null) {
      return false;
    }
    return DateTime.now().difference(last) < _autoPlayCooldownDuration;
  }

  void _startTracking() {
    _trackingTimer?.cancel();
    _isTracking = true;

    final interval = _batterySaverEnabled
        ? const Duration(seconds: 10)
        : const Duration(seconds: 3);

    _trackingTimer = Timer.periodic(interval, (_) async {
      try {
        await _runLocationCycle();
      } catch (_) {}
    });

    if (!widget.guestMode) {
      _heartbeatService?.start(
        lat: () => _position?.latitude ?? 0,
        lng: () => _position?.longitude ?? 0,
      );
    }

    setState(() {});
  }

  void _stopTracking() {
    _trackingTimer?.cancel();
    _heartbeatService?.stop();
    _isTracking = false;
    setState(() {});
  }

  void _setAutoTracking(bool enabled) {
    setState(() {
      _autoTrackEnabled = enabled;
    });
    if (enabled) {
      _startTracking();
      unawaited(_runLocationCycle());
    } else {
      _stopTracking();
    }
  }

  void _setBatterySaver(bool enabled) {
    if (_batterySaverEnabled == enabled) {
      return;
    }

    setState(() {
      _batterySaverEnabled = enabled;
    });

    if (_autoTrackEnabled) {
      _startTracking();
    }
  }

  String? _resolveAudioUrl(String? audioPath) {
    if (audioPath == null) return null;
    final raw = audioPath.trim();
    if (raw.isEmpty) return null;
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('//')) return 'https:$raw';
    if (raw.startsWith('/')) return '${widget.apiClient.dio.options.baseUrl}$raw';
    return null;
  }

  void _onRestaurantTap(RestaurantModel restaurant) {
    if (_audioStartAt != null) {
      unawaited(_stopAudioAndTrack());
    }

    setState(() {
      _selectedRestaurant = restaurant;
      _selectedLoading = true;
      _selectedLoadError = false;
      _selectedNarration = null;
      _selectedAudioUrl = null;
      _selectedCachedAudioPath = null;
      _selectedDistanceKm = null;
    });

    _selectedLoadRequestId += 1;
    final requestId = _selectedLoadRequestId;

    _mapController.move(LatLng(restaurant.lat, restaurant.lng), _mapController.camera.zoom);

    unawaited(_loadSelectedRestaurantNarration(restaurant, requestId));
  }

  Future<void> _loadSelectedRestaurantNarration(RestaurantModel restaurant, int requestId) async {
    try {
      final location = await _api.postLocation(
        lat: restaurant.lat,
        lng: restaurant.lng,
        language: _apiLanguageCode(_language),
        allowNetworkTranslation: true,
      );

      if (!mounted || requestId != _selectedLoadRequestId) return;
      final selectedPlace = location.nearestPlace;
      final merged = RestaurantModel(
        id: restaurant.id,
        name: selectedPlace.name.isNotEmpty ? selectedPlace.name : restaurant.name,
        lat: restaurant.lat,
        lng: restaurant.lng,
        description: selectedPlace.description ?? restaurant.description,
        avgEatTime: selectedPlace.avgEatTime,
        poiRadiusKm: selectedPlace.poiRadiusKm,
        visitCount: selectedPlace.visitCount,
        avgVisitDuration: selectedPlace.avgVisitDuration,
        avgAudioDuration: selectedPlace.avgAudioDuration,
        menu: selectedPlace.menu,
        images: selectedPlace.images,
        tags: selectedPlace.tags,
      );
      setState(() {
        _selectedRestaurant = merged;
        _selectedNarration = location.narration;
        _selectedAudioUrl = _resolveAudioUrl(location.audioUrl);
        _selectedCachedAudioPath = null;
        if (_position != null) {
          final d = const Distance().as(
            LengthUnit.Kilometer,
            LatLng(_position!.latitude, _position!.longitude),
            LatLng(restaurant.lat, restaurant.lng),
          );
          _selectedDistanceKm = d;
        }
        _selectedLoading = false;
        _selectedLoadError = false;
      });

      unawaited(_warmSelectedNarrationCache(location, requestId));
    } catch (_) {
      if (!mounted || requestId != _selectedLoadRequestId) return;

      final cached = await _narrationCacheService.read(
        restaurantId: restaurant.id,
        language: _apiLanguageCode(_language),
      );

      if (!mounted || requestId != _selectedLoadRequestId) return;

      if (cached != null) {
        setState(() {
          _selectedRestaurant = restaurant;
          _selectedNarration = cached.narration;
          _selectedAudioUrl = cached.audioUrl;
          _selectedCachedAudioPath = cached.audioFilePath;
          if (_position != null) {
            final d = const Distance().as(
              LengthUnit.Kilometer,
              LatLng(_position!.latitude, _position!.longitude),
              LatLng(restaurant.lat, restaurant.lng),
            );
            _selectedDistanceKm = d;
          }
          _selectedLoading = false;
          _selectedLoadError = false;
        });
      } else {
        setState(() {
          _selectedRestaurant = restaurant;
          _selectedNarration = null;
          _selectedAudioUrl = null;
          _selectedCachedAudioPath = null;
          _selectedDistanceKm = null;
          _selectedLoading = false;
          _selectedLoadError = true;
        });
      }
    }
  }

  Future<void> _openDirections(RestaurantModel restaurant) async {
    final origin = _position != null ? '&origin=${_position!.latitude},${_position!.longitude}' : '';
    final uri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1$origin&destination=${restaurant.lat},${restaurant.lng}',
    );
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Widget _buildMarkerPopup(RestaurantModel restaurant) {
    return Container(
      width: 320,
      constraints: const BoxConstraints(maxHeight: 420),
      margin: const EdgeInsets.only(bottom: 6),
      child: Material(
        elevation: 6,
        borderRadius: BorderRadius.circular(12),
        color: Colors.white,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      restaurant.name,
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    visualDensity: VisualDensity.compact,
                    onPressed: () {
                      setState(() {
                        _selectedRestaurant = null;
                      });
                    },
                  ),
                ],
              ),
              if (restaurant.images.isNotEmpty) ...[
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.network(
                    restaurant.images.first.imageUrl,
                    height: 130,
                    width: double.infinity,
                    fit: BoxFit.cover,
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 48,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: restaurant.images.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 6),
                    itemBuilder: (context, index) {
                      final image = restaurant.images[index];
                      return ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.network(
                          image.imageUrl,
                          width: 62,
                          height: 48,
                          fit: BoxFit.cover,
                        ),
                      );
                    },
                  ),
                ),
              ],
              const SizedBox(height: 6),
              if (restaurant.tags.isNotEmpty)
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: restaurant.tags
                      .map(
                        (tag) => Chip(
                          label: Text('${tag.icon ?? ''} ${tag.name}'),
                          visualDensity: VisualDensity.compact,
                        ),
                      )
                      .toList(),
                ),
              const SizedBox(height: 8),
              Text(restaurant.description ?? ''),
              if (_selectedDistanceKm != null) ...[
                const SizedBox(height: 6),
                Text('Cach ban: ${_selectedDistanceKm!.toStringAsFixed(3)} km'),
              ],
              const SizedBox(height: 8),
              if (_selectedLoading)
                const Text('Dang tai thuyet minh...')
              else if (_selectedLoadError)
                const Text('Khong tai duoc thuyet minh cho quan nay.')
              else
                Text(_selectedNarration ?? 'Chon quan de xem thuyet minh.'),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: _playSelectedNarration,
                      icon: const Icon(Icons.volume_up),
                      label: const Text('Nghe thuyet minh'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _openDirections(restaurant),
                      icon: const Icon(Icons.directions),
                      label: const Text('Chi duong'),
                    ),
                  ),
                ],
              ),
              if (restaurant.menu.isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text('Menu', style: TextStyle(fontWeight: FontWeight.w700)),
                ...restaurant.menu.take(6).map((item) => Text('- ${item.name}: ${item.price} VND')),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRestaurantMarker(RestaurantModel restaurant) {
    final selected = _selectedRestaurant != null && _selectedRestaurant!.id == restaurant.id;
    final popupData = selected ? _selectedRestaurant! : restaurant;

    if (selected) {
      // Hide the selected pin while popup is open to avoid marker jumping.
      return _buildMarkerPopup(popupData);
    }

    return GestureDetector(
      onTap: () => _onRestaurantTap(restaurant),
      child: const Icon(Icons.location_pin, color: Colors.red, size: 40),
    );
  }

  Widget _buildPoiBottomPanel() {
    if (_isLanguageReloading) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        color: Colors.black87,
        child: const Row(
          children: [
            SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
            ),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'Dang cap nhat ngon ngu POI...',
                style: TextStyle(color: Colors.white),
              ),
            ),
          ],
        ),
      );
    }

    final location = _lastLocationResult;
    if (location == null) {
      return const SizedBox.shrink();
    }

    final isPlaying = _isPoiAudioPlaying;
    final actionBusy = _isAudioActionInProgress || _isAudioPreparing;
    final canInteractAudio = isPlaying || !actionBusy;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      color: Colors.black87,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  location.nearestPlace.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              if (_batterySaverEnabled)
                const Icon(
                  Icons.battery_charging_full,
                  color: Colors.lightGreenAccent,
                  size: 18,
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            _isInPoi ? 'Trang thai POI: Da vao POI (tu dong phat sau 2s)' : 'Trang thai POI: Chua vao POI',
            style: TextStyle(
              color: _isInPoi ? Colors.lightGreenAccent : Colors.orangeAccent,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Distance: ${location.distanceKm.toStringAsFixed(3)} km',
            style: const TextStyle(color: Colors.white70),
          ),
          const SizedBox(height: 6),
          Text(
            location.narration,
            style: const TextStyle(color: Colors.white),
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 10),
          LayoutBuilder(
            builder: (context, constraints) {
              final compact = constraints.maxWidth < 340;
              return Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _showPoiMenuSheet(location.nearestPlace),
                      icon: const Icon(Icons.restaurant_menu, size: 18),
                      label: const Text('Xem menu'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Colors.white70),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: canInteractAudio ? _togglePoiAudio : null,
                      icon: Icon(isPlaying ? Icons.stop : Icons.volume_up, size: 18),
                      label: Text(
                        isPlaying
                            ? 'Dung nghe'
                            : (actionBusy ? 'Dang tai...' : (compact ? 'Nghe' : 'Nghe')),
                      ),
                      style: FilledButton.styleFrom(
                        disabledBackgroundColor: const Color(0xFF00897B).withOpacity(0.45),
                        disabledForegroundColor: Colors.white70,
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  Future<void> _togglePoiAudio() async {
    if ((_isAudioActionInProgress || _isAudioPreparing) && !_isPoiAudioPlaying) {
      return;
    }

    final location = _lastLocationResult;
    if (location == null) return;

    setState(() {
      _isAudioActionInProgress = true;
    });

    try {
      final isPlaying = _isPoiAudioPlaying;

      if (isPlaying) {
        await _stopAudioAndTrack();
        return;
      }

      final resolved = _resolveAudioUrl(location.audioUrl);
      if (resolved == null) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Quan nay hien chua co audio thuyet minh.')),
        );
        return;
      }

      final updated = LocationResult(
        narration: location.narration,
        distanceKm: location.distanceKm,
        poiRadiusKm: location.poiRadiusKm,
        nearestPlace: location.nearestPlace,
        audioUrl: resolved,
        outOfRangeMessage: location.outOfRangeMessage,
      );

      final cachedRecord = await _narrationCacheService.read(
        restaurantId: location.nearestPlace.id,
        language: _apiLanguageCode(_language),
      );
      final localPath = cachedRecord?.audioFilePath ?? _poiCachedAudioPath;
      if (resolved == null && (localPath == null || localPath.isEmpty)) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Quan nay hien chua co audio thuyet minh.')),
        );
        return;
      }

      await _startAudio(updated, localAudioPath: localPath);
      _lastPlayedAudioUrl = resolved ?? 'local-poi-${location.nearestPlace.id}-${_apiLanguageCode(_language)}';
      _playedRestaurants[location.nearestPlace.id] = DateTime.now();
      _manualPlaybackUntil = DateTime.now().add(const Duration(seconds: 20));
    } finally {
      if (mounted) {
        setState(() {
          _isAudioActionInProgress = false;
        });
      }
    }
  }

  Future<void> _showPoiMenuSheet(RestaurantModel restaurant) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        final menu = restaurant.menu;
        if (menu.isEmpty) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Quan nay hien chua co menu de hien thi.'),
          );
        }

        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: menu.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (context, index) {
            final item = menu[index];
            return ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: Text(item.name),
              trailing: Text('${item.price} VND'),
            );
          },
        );
      },
    );
  }

  Future<void> _playSelectedNarration() async {
    final selected = _selectedRestaurant;
    if (selected == null) return;
    final resolved = _selectedAudioUrl;
    final localPath = _selectedCachedAudioPath;
    if (resolved == null && (localPath == null || localPath.isEmpty)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Quan nay hien chua co audio thuyet minh.')),
      );
      return;
    }

    final updated = LocationResult(
      narration: _selectedNarration ?? '',
      distanceKm: _selectedDistanceKm ?? 0,
      poiRadiusKm: _lastLocationResult?.poiRadiusKm ?? 0.03,
      nearestPlace: selected,
      audioUrl: resolved,
      outOfRangeMessage: null,
    );

    if (_audioStartAt != null) {
      await _stopAudioAndTrack();
    }
    try {
      await _startAudio(updated, localAudioPath: localPath);
    } catch (e) {
      if (_isIgnorableAudioError(e)) {
        return;
      }
      if (mounted) {
        setState(() {
          _error = 'Khong the phat audio luc nay: $e';
        });
      }
      return;
    }

    _manualPlaybackUntil = DateTime.now().add(const Duration(seconds: 20));
    _playedRestaurants[selected.id] = DateTime.now();
  }

  Future<void> _reloadRestaurantsForLanguage(String lang) async {
    if (_audioStartAt != null) {
      await _stopAudioAndTrack();
    }

    final normalizedForApi = _apiLanguageCode(lang);

    _playedRestaurants.clear();
    _lastPlayedAudioUrl = null;
    _poiCachedAudioPath = null;
    _selectedCachedAudioPath = null;

    setState(() {
      _language = lang;
      _error = null;
      _isLanguageReloading = true;
      _lastLocationResult = null;
      _isInPoi = false;
      _poiEnteredAt = null;
    });
    unawaited(LanguageStore.save(lang));

    try {
      final restaurants = await _api.getRestaurants(lang: normalizedForApi);
      setState(() => _restaurants = restaurants);
      if (_position != null) {
        await _runLocationCycle(
          position: _position,
          suppressAutoPlay: true,
        );
      }
      if (_selectedRestaurant != null) {
        _selectedLoadRequestId += 1;
        final requestId = _selectedLoadRequestId;
        await _loadSelectedRestaurantNarration(_selectedRestaurant!, requestId);
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) {
        setState(() {
          _isLanguageReloading = false;
        });
      }
    }
  }

  Future<void> _logout() async {
    await _stopAudioAndTrack();
    await _api.customerLogout();
    await SessionStore.instance.clear();

    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(
        builder: (_) => CustomerHomeScreen(
          apiClient: widget.apiClient,
          title: 'NearBite',
          guestMode: true,
          showTourButton: false,
          showLanguageSelector: true,
          initialLanguage: _language,
        ),
      ),
      (route) => false,
    );
  }

  Future<void> _pauseRealtimeFeatures() async {
    if (_isTracking) {
      _stopTracking();
    }

    if (_audioStartAt != null || _isPoiAudioPlaying || _isAudioPreparing) {
      await _stopAudioAndTrack();
    }
  }

  void _resumeRealtimeFeaturesIfNeeded() {
    if (!mounted || !_autoTrackEnabled) {
      return;
    }

    if (!_isTracking) {
      _startTracking();
      unawaited(_runLocationCycle(suppressAutoPlay: true));
    }
  }

  Future<void> _openPageWithRealtimePause(Widget page) async {
    await _pauseRealtimeFeatures();
    if (!mounted) return;

    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => page),
    );

    _resumeRealtimeFeaturesIfNeeded();
  }

  @override
  void dispose() {
    _trackingTimer?.cancel();
    _heartbeatService?.stop();
    _sessionExpiredSub?.cancel();
    _playerStateSub?.cancel();
    _audioService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final position = _position;
    final center = LatLng(
      position?.latitude ?? 10.7769,
      position?.longitude ?? 106.7009,
    );
    const fabGap = 20.0;
    final poiPanelOffset = 12.0 + _poiPanelMeasuredHeight + fabGap;
    final errorOffset = _error != null ? 64.0 : 0.0;

    _schedulePoiPanelHeightMeasure();

    return Scaffold(
      key: _scaffoldKey,
      drawer: Drawer(
        child: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                      child: Text(
                        widget.title,
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
                      ),
                    ),
                    if (widget.showLanguageSelector)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                        child: DropdownButtonFormField<String>(
                          value: _selectLanguageValue(_language, _languages),
                          decoration: const InputDecoration(
                            labelText: 'Ngôn ngữ',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                          items: _languages
                              .map(
                                (l) => DropdownMenuItem<String>(
                                  value: l.code,
                                  child: Row(
                                    children: [
                                      _CountryBall(flag: _flagForLanguage(l.code)),
                                      const SizedBox(width: 8),
                                      Text(_languageLabel(l.code, l.label)),
                                    ],
                                  ),
                                ),
                              )
                              .toList(),
                          onChanged: (value) {
                            if (value == null) return;
                            Navigator.of(context).maybePop();
                            unawaited(_reloadRestaurantsForLanguage(value));
                          },
                        ),
                      ),
                    ListTile(
                      leading: const Icon(Icons.gps_fixed),
                      title: const Text('Refresh GPS'),
                      onTap: () {
                        Navigator.of(context).maybePop();
                        unawaited(_runLocationCycle());
                      },
                    ),
                    if (!widget.guestMode && widget.showTourButton)
                      ListTile(
                        leading: const Icon(Icons.alt_route),
                        title: const Text('Tour planner'),
                        onTap: () {
                          Navigator.of(context).maybePop();
                          unawaited(
                            _openPageWithRealtimePause(
                              TourPlannerScreen(
                                apiClient: widget.apiClient,
                                initialLanguage: _language,
                              ),
                            ),
                          );
                        },
                      ),
                    ListTile(
                      leading: Icon(widget.guestMode
                          ? Icons.login
                          : (_isCustomerAuthed ? Icons.logout : Icons.login)),
                      title: Text(widget.guestMode
                          ? 'Login'
                          : (_isCustomerAuthed ? 'Logout customer' : 'Login customer')),
                      onTap: widget.guestMode
                          ? () {
                              Navigator.of(context).maybePop();
                              unawaited(
                                _openPageWithRealtimePause(
                                  RoleSelectionScreen(apiClient: widget.apiClient),
                                ),
                              );
                            }
                          : (_isCustomerAuthed
                              ? () {
                                  Navigator.of(context).maybePop();
                                  unawaited(_logout());
                                }
                              : () {
                                  Navigator.of(context).maybePop();
                                  unawaited(
                                    _openPageWithRealtimePause(
                                      LoginScreen(
                                        apiClient: widget.apiClient,
                                        initialRole: LoginRole.customer,
                                      ),
                                    ),
                                  );
                                }),
                    ),
                  ],
                ),
              ),
              Align(
                alignment: Alignment.bottomLeft,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 14),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(24),
                    onTap: () => _setBatterySaver(!_batterySaverEnabled),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 220),
                      width: 40,
                      height: 40,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: _batterySaverEnabled ? const Color(0xFF7CE7D5) : Colors.white,
                        boxShadow: _batterySaverEnabled
                            ? const [
                                BoxShadow(
                                  color: Color(0xAA7CE7D5),
                                  blurRadius: 12,
                                  spreadRadius: 1,
                                ),
                              ]
                            : const [],
                        border: Border.all(color: Colors.black12),
                      ),
                      child: Icon(
                        Icons.battery_charging_full,
                        size: 22,
                        color: _batterySaverEnabled ? Colors.black87 : Colors.black54,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      body: Stack(
        children: [
          Column(
            children: [
              Expanded(
                child: FlutterMap(
                  mapController: _mapController,
                  options: MapOptions(
                    initialCenter: center,
                    initialZoom: 15,
                    onTap: (_, __) {
                      if (_selectedRestaurant != null) {
                        setState(() {
                          _selectedRestaurant = null;
                        });
                      }
                    },
                  ),
                  children: [
                    TileLayer(
                      // Light basemap without labels for cleaner mobile POI focus.
                      urlTemplate: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
                      subdomains: const ['a', 'b', 'c', 'd'],
                      userAgentPackageName: 'nearbite.mobile',
                    ),
                    if (_selectedRestaurant != null && _lastLocationResult != null)
                      CircleLayer(
                        circles: [
                          CircleMarker(
                            point: LatLng(_selectedRestaurant!.lat, _selectedRestaurant!.lng),
                            radius: (_lastLocationResult!.poiRadiusKm * 1000),
                            useRadiusInMeter: true,
                            color: Colors.red.withOpacity(0.15),
                            borderColor: Colors.red.withOpacity(0.8),
                            borderStrokeWidth: 2,
                          ),
                        ],
                      ),
                    MarkerLayer(
                      markers: [
                        Marker(
                          point: center,
                          width: 36,
                          height: 36,
                          child: const Icon(Icons.my_location, color: Colors.blue, size: 30),
                        ),
                        ..._restaurants.map(
                          (r) => Marker(
                            point: LatLng(r.lat, r.lng),
                            width: _selectedRestaurant?.id == r.id ? 340 : 42,
                            height: _selectedRestaurant?.id == r.id ? 430 : 42,
                            alignment: Alignment.bottomCenter,
                            child: _buildRestaurantMarker(r),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              SizedBox(
                key: _poiPanelKey,
                width: double.infinity,
                child: _buildPoiBottomPanel(),
              ),
              if (_error != null)
                Container(
                  width: double.infinity,
                  color: Theme.of(context).colorScheme.errorContainer,
                  padding: const EdgeInsets.all(12),
                  child: Text(_error!),
                ),
            ],
          ),
          Positioned(
            top: MediaQuery.of(context).padding.top + 12,
            left: 12,
            child: Material(
              color: Colors.white,
              shape: const CircleBorder(),
              elevation: 4,
              child: IconButton(
                tooltip: 'Mo menu',
                onPressed: () => _scaffoldKey.currentState?.openDrawer(),
                icon: const Icon(Icons.menu),
              ),
            ),
          ),
          AnimatedPositioned(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            right: 12,
            bottom: poiPanelOffset + errorOffset,
            child: FloatingActionButton.extended(
              onPressed: () => _setAutoTracking(!_autoTrackEnabled),
              icon: Icon(_autoTrackEnabled ? Icons.gps_fixed : Icons.gps_off),
              label: Text(_autoTrackEnabled ? 'Auto Track ON' : 'Auto Track OFF'),
            ),
          ),
        ],
      ),
    );
  }

  String _languageLabel(String code, String fallback) {
    final normalized = _apiLanguageCode(code);
    switch (normalized) {
      case 'vi':
        return 'Tiếng Việt';
      case 'en':
        return 'English';
      case 'fr':
        return 'Français';
      case 'ja':
        return '日本語';
      case 'ko':
        return '한국어';
      case 'zh':
      case 'zh-cn':
        return '中文';
      default:
        return fallback;
    }
  }

  void _schedulePoiPanelHeightMeasure() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final context = _poiPanelKey.currentContext;
      if (context == null) return;

      final renderObject = context.findRenderObject();
      if (renderObject is! RenderBox) return;

      final measuredHeight = renderObject.size.height;
      if ((measuredHeight - _poiPanelMeasuredHeight).abs() < 1) {
        return;
      }

      setState(() {
        _poiPanelMeasuredHeight = measuredHeight;
      });
    });
  }

  String _flagForLanguage(String code) {
    final normalized = _apiLanguageCode(code);
    switch (normalized) {
      case 'vi':
        return '🇻🇳';
      case 'en':
      case 'en-us':
      case 'en-gb':
        return '🇺🇸';
      case 'fr':
      case 'fr-fr':
        return '🇫🇷';
      case 'de':
      case 'de-de':
        return '🇩🇪';
      case 'es':
      case 'es-es':
        return '🇪🇸';
      case 'it':
      case 'it-it':
        return '🇮🇹';
      case 'ru':
      case 'ru-ru':
        return '🇷🇺';
      case 'ja':
      case 'ja-jp':
        return '🇯🇵';
      case 'ko':
      case 'ko-kr':
        return '🇰🇷';
      case 'zh':
      case 'zh-cn':
        return '🇨🇳';
      case 'th':
      case 'th-th':
        return '🇹🇭';
      case 'id':
      case 'id-id':
        return '🇮🇩';
      case 'ms':
      case 'ms-my':
        return '🇲🇾';
      default:
        return '🌐';
    }
  }

  String _apiLanguageCode(String rawCode) {
    final normalized = rawCode.trim().toLowerCase();
    if (normalized.isEmpty) return 'vi';

    if (normalized == 'vn' || normalized.startsWith('vi')) {
      return 'vi';
    }
    if (normalized.startsWith('zh')) {
      return 'zh';
    }

    final dashIndex = normalized.indexOf('-');
    if (dashIndex > 0) {
      return normalized.substring(0, dashIndex);
    }
    return normalized;
  }

  bool _isIgnorableAudioError(Object error) {
    final msg = error.toString().toLowerCase();
    return msg.contains('connection aborted') ||
        msg.contains('loading interrupted') ||
        msg.contains('playerinterruptedexception') ||
        msg.contains('platformexception(abort');
  }

  Future<void> _warmNarrationCacheForLocation(LocationResult location) async {
    final resolvedAudioUrl = _resolveAudioUrl(location.audioUrl);
    final record = await _narrationCacheService.upsert(
      restaurantId: location.nearestPlace.id,
      language: _apiLanguageCode(_language),
      narration: location.narration,
      audioUrl: resolvedAudioUrl,
      dio: widget.apiClient.dio,
    );

    if (!mounted || _lastLocationResult?.nearestPlace.id != location.nearestPlace.id) {
      return;
    }

    setState(() {
      _poiCachedAudioPath = record.audioFilePath;
    });
  }

  Future<void> _warmSelectedNarrationCache(LocationResult location, int requestId) async {
    final resolvedAudioUrl = _resolveAudioUrl(location.audioUrl);
    final record = await _narrationCacheService.upsert(
      restaurantId: location.nearestPlace.id,
      language: _apiLanguageCode(_language),
      narration: location.narration,
      audioUrl: resolvedAudioUrl,
      dio: widget.apiClient.dio,
    );

    if (!mounted || requestId != _selectedLoadRequestId) {
      return;
    }

    setState(() {
      _selectedCachedAudioPath = record.audioFilePath;
    });
  }

  String _selectLanguageValue(String current, List<LanguageOption> options) {
    if (options.isEmpty) {
      return current;
    }
    if (options.any((e) => e.code == current)) {
      return current;
    }

    final currentNormalized = _apiLanguageCode(current);
    for (final option in options) {
      if (_apiLanguageCode(option.code) == currentNormalized) {
        return option.code;
      }
    }
    return options.first.code;
  }
}

class _CountryBall extends StatelessWidget {
  const _CountryBall({required this.flag});

  final String flag;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 26,
      height: 26,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white,
        border: Border.all(color: Colors.black12),
      ),
      child: Text(flag, style: const TextStyle(fontSize: 15)),
    );
  }
}
