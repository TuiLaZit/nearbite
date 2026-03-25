import 'package:flutter/material.dart';

import 'core/network/api_client.dart';
import 'core/sync/connectivity_sync_service.dart';
import 'features/home/landing_screen.dart';

class NearBiteApp extends StatelessWidget {
  const NearBiteApp({super.key, required this.apiClient});

  final ApiClient apiClient;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'NearBite Mobile',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0D9488)),
        useMaterial3: true,
      ),
      home: BootstrapScreen(apiClient: apiClient),
    );
  }
}

class BootstrapScreen extends StatefulWidget {
  const BootstrapScreen({super.key, required this.apiClient});

  final ApiClient apiClient;

  @override
  State<BootstrapScreen> createState() => _BootstrapScreenState();
}

class _BootstrapScreenState extends State<BootstrapScreen> {
  ConnectivitySyncService? _syncService;

  @override
  void initState() {
    super.initState();
    _syncService = ConnectivitySyncService(widget.apiClient.retryQueue)..start();
  }

  @override
  void dispose() {
    _syncService?.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LandingScreen(apiClient: widget.apiClient);
  }
}
