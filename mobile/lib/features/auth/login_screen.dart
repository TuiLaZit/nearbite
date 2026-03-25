import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../../core/models/language_option.dart';
import '../../core/auth/session_store.dart';
import '../../core/network/api_client.dart';
import '../../core/settings/language_store.dart';
import '../customer/customer_home_screen.dart';
import '../owner/owner_dashboard_screen.dart';
import '../../services/backend_api.dart';

enum LoginRole { customer, owner }

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.apiClient,
    this.initialRole = LoginRole.customer,
  });

  final ApiClient apiClient;
  final LoginRole initialRole;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  late final BackendApi _api;

  final _customerEmailController = TextEditingController();
  final _customerOtpController = TextEditingController();
  final _ownerUsernameController = TextEditingController();
  final _ownerPasswordController = TextEditingController();

  bool _otpSent = false;
  bool _loading = false;
  String? _error;
  String _language = 'vi';
  List<LanguageOption> _languages = const [];

  @override
  void initState() {
    super.initState();
    _api = BackendApi(widget.apiClient);
    _tabController = TabController(
      length: 2,
      vsync: this,
      initialIndex: widget.initialRole == LoginRole.owner ? 1 : 0,
    );
    unawaited(_restoreLanguageAndLoad());
  }

  Future<void> _restoreLanguageAndLoad() async {
    final saved = await LanguageStore.read();
    if (saved != null && mounted) {
      setState(() {
        _language = saved;
      });
    }
    await _loadLanguages();
  }

  Future<void> _loadLanguages() async {
    try {
      final items = await _api.getLanguages();
      if (!mounted) return;
      setState(() {
        _languages = items;
        if (_languages.isNotEmpty && !_languages.any((e) => e.code == _language)) {
          _language = _languages.first.code;
        }
      });
    } catch (_) {
      // Keep default language when loading list fails.
    }
  }

  @override
  void dispose() {
    _customerEmailController.dispose();
    _customerOtpController.dispose();
    _ownerUsernameController.dispose();
    _ownerPasswordController.dispose();
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _requestOtp() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await _api.customerRequestOtp(email: _customerEmailController.text.trim());
      setState(() => _otpSent = true);
    } on DioException catch (e) {
      setState(() => _error = _messageFromDio(e));
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _verifyOtp() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final result = await _api.customerVerifyOtp(
        email: _customerEmailController.text.trim(),
        otp: _customerOtpController.text.trim(),
      );
      final ok = await _api.customerCheck();
      if (!ok) {
        throw Exception('Session cookie check failed for customer login');
      }

      await SessionStore.instance
          .saveCustomer(email: (result['email'] ?? '').toString());

      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => CustomerHomeScreen(
            apiClient: widget.apiClient,
            initialLanguage: _language,
            showLanguageSelector: true,
          ),
        ),
      );
    } on DioException catch (e) {
      setState(() => _error = _messageFromDio(e));
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _ownerLogin() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final result = await _api.ownerLogin(
        username: _ownerUsernameController.text.trim(),
        password: _ownerPasswordController.text,
      );

      // Avoid hard-failing immediately on cookie check; dashboard will re-check and show concrete backend errors.
      await _api.ownerCheck();

      await SessionStore.instance
          .saveOwner(username: (result['username'] ?? '').toString());

      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => OwnerDashboardScreen(apiClient: widget.apiClient),
        ),
      );
    } on DioException catch (e) {
      setState(() => _error = _messageFromDio(e));
    } catch (e) {
      setState(() => _error = 'Owner login failed: ${e.toString()}');
    } finally {
      setState(() => _loading = false);
    }
  }

  String _messageFromDio(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['error'] != null) {
      return data['error'].toString();
    }
    return e.message ?? 'Request failed';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('NearBite Login'),
        actions: [
          if (_languages.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: DropdownButtonHideUnderline(
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
                    setState(() {
                      _language = value;
                    });
                    unawaited(LanguageStore.save(value));
                  },
                ),
              ),
            ),
        ],
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Customer OTP'),
            Tab(text: 'Owner Login'),
          ],
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  _buildCustomerTab(),
                  _buildOwnerTab(),
                ],
              ),
            ),
            if (_error != null)
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildCustomerTab() {
    return ListView(
      children: [
        TextField(
          controller: _customerEmailController,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(labelText: 'Email'),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _loading ? null : _requestOtp,
          child: Text(_loading ? 'Sending...' : 'Send OTP'),
        ),
        if (_otpSent) ...[
          const SizedBox(height: 20),
          TextField(
            controller: _customerOtpController,
            keyboardType: TextInputType.number,
            maxLength: 6,
            decoration: const InputDecoration(labelText: 'OTP Code'),
          ),
          FilledButton(
            onPressed: _loading ? null : _verifyOtp,
            child: Text(_loading ? 'Verifying...' : 'Verify OTP'),
          ),
        ],
      ],
    );
  }

  Widget _buildOwnerTab() {
    return ListView(
      children: [
        TextField(
          controller: _ownerUsernameController,
          decoration: const InputDecoration(labelText: 'Username'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _ownerPasswordController,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Password'),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _loading ? null : _ownerLogin,
          child: Text(_loading ? 'Signing in...' : 'Login as Owner'),
        ),
      ],
    );
  }
}
