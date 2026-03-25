import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import 'login_screen.dart';

class RoleSelectionScreen extends StatelessWidget {
  const RoleSelectionScreen({super.key, required this.apiClient});

  final ApiClient apiClient;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Chon vai tro dang nhap')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => LoginScreen(
                        apiClient: apiClient,
                        initialRole: LoginRole.customer,
                      ),
                    ),
                  );
                },
                icon: const Icon(Icons.person),
                label: const Text('Khach hang'),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => LoginScreen(
                        apiClient: apiClient,
                        initialRole: LoginRole.owner,
                      ),
                    ),
                  );
                },
                icon: const Icon(Icons.store),
                label: const Text('Chu quan'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
