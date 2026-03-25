import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter/material.dart';
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
  final MapController _mapController = MapController();

  Timer? _trackingTimer;
  HeartbeatService? _heartbeatService;
  bool _isTracking = false;
  bool _autoTrackEnabled = true;
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
  RestaurantModel? _selectedRestaurant;
  String? _selectedNarration;
  String? _selectedAudioUrl;
  double? _selectedDistanceKm;
  bool _selectedLoading = false;
  bool _selectedLoadError = false;
  DateTime? _poiEnteredAt;
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
      final restaurants = await _api.getRestaurants(lang: _language);
      final authed = widget.guestMode ? false : await _api.customerCheck();
      final position = await _locationService.getCurrentPosition();

      setState(() {
        _languages = languages;
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
    if (_audioStartAt != null) {
      return;
    }

    try {
      final location = await _api.postLocation(
        lat: currentPos.latitude,
        lng: currentPos.longitude,
        language: _language,
        allowNetworkTranslation: allowNetworkTranslation,
      );

      if (_isTracking && !widget.guestMode) {
        await _api.trackLocation(
          lat: currentPos.latitude,
          lng: currentPos.longitude,
          durationSeconds: 15,
          restaurantId: location.nearestPlace.id,
        );
      }

      if (!widget.guestMode) {
        await _api.heartbeat(
          deviceId: await _deviceId(),
          lat: currentPos.latitude,
          lng: currentPos.longitude,
        );
      }

      setState(() {
        _lastLocationResult = location;
        _isInPoi = location.distanceKm <= location.poiRadiusKm;
      });

      final inPoiRange = location.distanceKm <= location.poiRadiusKm;
      final now = DateTime.now();

      if (inPoiRange) {
        _poiEnteredAt ??= now;
      } else {
        _poiEnteredAt = null;
      }

      final debouncePassed =
          _poiEnteredAt != null && now.difference(_poiEnteredAt!) >= _poiDebounceDuration;

        final inCooldown = _isAutoPlayInCooldown(location.nearestPlace.id);

      if (inPoiRange &&
          debouncePassed &&
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
          await _startAudio(updated);
          _lastPlayedAudioUrl = resolved;
          _playedRestaurants[location.nearestPlace.id] = DateTime.now();
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

  Future<void> _startAudio(LocationResult location) async {
    if (location.audioUrl == null || location.audioUrl!.isEmpty) {
      return;
    }
    await _audioService.playFromUrl(location.audioUrl!);
    _audioStartAt = DateTime.now();
    _activeAudioRestaurantId = location.nearestPlace.id;
    if (mounted) {
      setState(() {
        _isPoiAudioPlaying = true;
      });
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

    _trackingTimer = Timer.periodic(const Duration(seconds: 3), (_) async {
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
    });

    _mapController.move(LatLng(restaurant.lat, restaurant.lng), _mapController.camera.zoom);

    unawaited(_loadSelectedRestaurantNarration(restaurant));
  }

  Future<void> _loadSelectedRestaurantNarration(RestaurantModel restaurant) async {
    try {
      final location = await _api.postLocation(
        lat: restaurant.lat,
        lng: restaurant.lng,
        language: _language,
        allowNetworkTranslation: true,
      );

      if (!mounted) return;
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
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _selectedRestaurant = restaurant;
        _selectedLoading = false;
        _selectedLoadError = true;
      });
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

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      color: Colors.black87,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            location.nearestPlace.name,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
            ),
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
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              OutlinedButton.icon(
                onPressed: () => _showPoiMenuSheet(location.nearestPlace),
                icon: const Icon(Icons.restaurant_menu, size: 18),
                label: const Text('Xem menu'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: const BorderSide(color: Colors.white70),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton.icon(
                onPressed: _isAudioActionInProgress ? null : _togglePoiAudio,
                icon: Icon(isPlaying ? Icons.stop : Icons.volume_up, size: 18),
                label: Text(isPlaying ? 'Dung nghe' : 'Nghe'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _togglePoiAudio() async {
    if (_isAudioActionInProgress) {
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

      await _startAudio(updated);
      _lastPlayedAudioUrl = resolved;
      _playedRestaurants[location.nearestPlace.id] = DateTime.now();
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
    if (resolved == null) {
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
    await _startAudio(updated);
    _playedRestaurants[selected.id] = DateTime.now();
  }

  Future<void> _reloadRestaurantsForLanguage(String lang) async {
    if (_audioStartAt != null) {
      await _stopAudioAndTrack();
    }

    _playedRestaurants.clear();
    _lastPlayedAudioUrl = null;

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
      final restaurants = await _api.getRestaurants(lang: lang);
      setState(() => _restaurants = restaurants);
      if (_position != null) {
        await _runLocationCycle(
          position: _position,
          suppressAutoPlay: true,
        );
      }
      if (_selectedRestaurant != null) {
        await _loadSelectedRestaurantNarration(_selectedRestaurant!);
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

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          if (widget.showLanguageSelector)
            DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _language,
                items: _languages
                    .map(
                      (l) => DropdownMenuItem<String>(
                        value: l.code,
                        child: Text(l.label),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value == null) return;
                  unawaited(_reloadRestaurantsForLanguage(value));
                },
              ),
            ),
          IconButton(
            tooltip: 'Refresh GPS',
            onPressed: () {
              unawaited(_runLocationCycle());
            },
            icon: const Icon(Icons.gps_fixed),
          ),
          if (!widget.guestMode && widget.showTourButton)
            IconButton(
              tooltip: 'Tour planner',
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => TourPlannerScreen(
                      apiClient: widget.apiClient,
                      initialLanguage: _language,
                    ),
                  ),
                );
              },
              icon: const Icon(Icons.alt_route),
            ),
          IconButton(
            tooltip: widget.guestMode
                ? 'Login'
                : (_isCustomerAuthed ? 'Logout customer' : 'Login customer'),
            onPressed: widget.guestMode
                ? () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => RoleSelectionScreen(apiClient: widget.apiClient),
                      ),
                    );
                  }
                : (_isCustomerAuthed
                    ? _logout
                    : () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => LoginScreen(
                              apiClient: widget.apiClient,
                              initialRole: LoginRole.customer,
                            ),
                          ),
                        );
                      }),
            icon: Icon(widget.guestMode
                ? Icons.login
                : (_isCustomerAuthed ? Icons.logout : Icons.login)),
          ),
        ],
      ),
      body: Column(
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
          _buildPoiBottomPanel(),
          if (_error != null)
            Container(
              width: double.infinity,
              color: Theme.of(context).colorScheme.errorContainer,
              padding: const EdgeInsets.all(12),
              child: Text(_error!),
            ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _setAutoTracking(!_autoTrackEnabled),
        icon: Icon(_autoTrackEnabled ? Icons.gps_fixed : Icons.gps_off),
        label: Text(_autoTrackEnabled ? 'Auto Track ON' : 'Auto Track OFF'),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.endTop,
    );
  }
}
