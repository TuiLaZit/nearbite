import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../customer/customer_home_screen.dart';

class LandingScreen extends StatelessWidget {
  const LandingScreen({super.key, required this.apiClient});

  final ApiClient apiClient;

  @override
  Widget build(BuildContext context) {
    return CustomerHomeScreen(
      apiClient: apiClient,
      title: 'NearBite',
      guestMode: true,
      showTourButton: false,
      showLanguageSelector: true,
      initialLanguage: null,
    );
  }
}
