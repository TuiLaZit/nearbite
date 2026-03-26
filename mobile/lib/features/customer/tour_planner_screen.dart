import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/language_option.dart';
import '../../core/models/tag_model.dart';
import '../../core/models/tour_model.dart';
import '../../core/network/api_client.dart';
import '../../core/settings/language_store.dart';
import '../../services/backend_api.dart';
import '../../services/location_service.dart';

class TourPlannerScreen extends StatefulWidget {
  const TourPlannerScreen({
    super.key,
    required this.apiClient,
    required this.initialLanguage,
  });

  final ApiClient apiClient;
  final String initialLanguage;

  @override
  State<TourPlannerScreen> createState() => _TourPlannerScreenState();
}

class _TourPlannerScreenState extends State<TourPlannerScreen> {
  late final BackendApi _api;
  final LocationService _locationService = LocationService();

  int _timeLimit = 120;
  int _budget = 500000;
  String _language = 'vi';

  bool _loading = true;
  bool _planning = false;
  String? _error;

  List<LanguageOption> _languages = const [];
  List<TagModel> _tags = const [];
  final Set<int> _selectedTagIds = <int>{};
  List<TourModel> _tours = const [];

  @override
  void initState() {
    super.initState();
    _api = BackendApi(widget.apiClient);
    unawaited(_restoreLanguageAndBootstrap());
  }

  Future<void> _restoreLanguageAndBootstrap() async {
    final saved = await LanguageStore.read();
    _language = widget.initialLanguage.isNotEmpty ? widget.initialLanguage : (saved ?? 'vi');
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
      final tags = await _api.getPublicTags(lang: _language);
      setState(() {
        _languages = languages;
        _tags = tags;
      });
    } on DioException catch (e) {
      setState(() => _error = _dioMessage(e));
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

  Future<void> _reloadTagsForLanguage(String lang) async {
    setState(() {
      _language = lang;
      _error = null;
    });
    unawaited(LanguageStore.save(lang));

    try {
      final tags = await _api.getPublicTags(lang: lang);
      setState(() => _tags = tags);
    } on DioException catch (e) {
      setState(() => _error = _dioMessage(e));
    }
  }

  Future<void> _planTour() async {
    setState(() {
      _planning = true;
      _error = null;
      _tours = const [];
    });

    try {
      Position? position;
      try {
        position = await _locationService.getCurrentPosition();
      } catch (_) {
        position = null;
      }

      final tours = await _api.planTour(
        timeLimit: _timeLimit,
        budget: _budget,
        tags: _selectedTagIds.toList(),
        userLat: position?.latitude,
        userLng: position?.longitude,
      );

      setState(() => _tours = tours);
    } on DioException catch (e) {
      setState(() => _error = _dioMessage(e));
    } finally {
      setState(() => _planning = false);
    }
  }

  Future<void> _openTourInGoogleMaps(TourModel tour) async {
    if (tour.restaurants.isEmpty) {
      return;
    }

    Position? position;
    try {
      position = await _locationService.getCurrentPosition();
    } catch (_) {
      position = null;
    }

    final destination = tour.restaurants.last;
    final waypoints = tour.restaurants
        .map((r) => '${r.lat},${r.lng}')
        .join('|');

    final origin = position != null
        ? '${position.latitude},${position.longitude}'
        : '${tour.restaurants.first.lat},${tour.restaurants.first.lng}';

    final uri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&origin=$origin&destination=${destination.lat},${destination.lng}&waypoints=$waypoints',
    );

    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tour Planner'),
        actions: [
          if (_languages.isNotEmpty)
            DropdownButton<String>(
              value: _language,
              underline: const SizedBox.shrink(),
              items: _languages
                  .map(
                    (l) => DropdownMenuItem<String>(
                      value: l.code,
                      child: Text(l.label),
                    ),
                  )
                  .toList(),
              onChanged: (value) {
                if (value != null) {
                  _reloadTagsForLanguage(value);
                }
              },
            ),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFEAF7F5), Color(0xFFF3F6F6), Color(0xFFFFFFFF)],
          ),
        ),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Planner settings', style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 12),
                    Text('Time limit: $_timeLimit minutes'),
                    Slider(
                      value: _timeLimit.toDouble(),
                      min: 30,
                      max: 480,
                      divisions: 15,
                      label: _timeLimit.toString(),
                      onChanged: (value) => setState(() => _timeLimit = value.round()),
                    ),
                    const SizedBox(height: 8),
                    Text('Budget: $_budget VND'),
                    Slider(
                      value: _budget.toDouble(),
                      min: 50000,
                      max: 2000000,
                      divisions: 39,
                      label: _budget.toString(),
                      onChanged: (value) => setState(() => _budget = value.round()),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Preferred tags', style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _tags
                          .map(
                            (tag) => FilterChip(
                              selected: _selectedTagIds.contains(tag.id),
                              label: Text('${tag.icon ?? ''} ${tag.name}'),
                              onSelected: (selected) {
                                setState(() {
                                  if (selected) {
                                    _selectedTagIds.add(tag.id);
                                  } else {
                                    _selectedTagIds.remove(tag.id);
                                  }
                                });
                              },
                            ),
                          )
                          .toList(),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: _planning ? null : _planTour,
              icon: const Icon(Icons.route),
              label: Text(_planning ? 'Planning...' : 'Plan Tour'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 16),
            ..._tours.asMap().entries.map((entry) {
            final idx = entry.key;
            final tour = entry.value;
            return Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Tour #${idx + 1} (${tour.strategy})',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    Text('Total time: ${tour.totalTime} min'),
                    Text('Estimated cost: ${tour.totalCost} VND'),
                    const SizedBox(height: 8),
                    ...tour.restaurants.map(
                      (r) => ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        title: Text(r.name),
                        subtitle: Text(r.description ?? ''),
                        trailing: Text('${r.avgEatTime} min'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: () => _openTourInGoogleMaps(tour),
                      icon: const Icon(Icons.map),
                      label: const Text('Open in Google Maps'),
                    ),
                  ],
                ),
              ),
            );
            }),
          ],
        ),
      ),
    );
  }
}
