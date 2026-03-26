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

  String _t({
    required String vi,
    required String en,
    required String fr,
  }) {
    switch (_language) {
      case 'en':
        return en;
      case 'fr':
        return fr;
      default:
        return vi;
    }
  }

  String _flagForLanguage(String code) {
    final normalized = code.toLowerCase();
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

  String _languageLabel(String code, String fallback) {
    switch (code.toLowerCase()) {
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

  Future<void> _continueAsGuest() async {
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
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        leading: IconButton(
          tooltip: _t(
            vi: 'Về màn hình khách',
            en: 'Back to guest mode',
            fr: 'Retour mode invite',
          ),
          onPressed: _continueAsGuest,
          icon: const Icon(Icons.arrow_back),
        ),
        title: Text(_t(vi: 'Đăng nhập NearBite', en: 'NearBite Login', fr: 'Connexion NearBite')),
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
                          child: _CountryBall(flag: _flagForLanguage(l.code)),
                        ),
                      )
                      .toList(),
                  selectedItemBuilder: (context) {
                    return _languages
                        .map((l) => Center(child: _CountryBall(flag: _flagForLanguage(l.code))))
                        .toList();
                  },
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
          tabs: [
            Tab(text: _t(vi: 'OTP khách hàng', en: 'Customer OTP', fr: 'OTP client')),
            Tab(text: _t(vi: 'Đăng nhập chủ quán', en: 'Owner Login', fr: 'Connexion gerant')),
          ],
        ),
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFEAF7F5), Color(0xFFF3F6F6), Color(0xFFFFFFFF)],
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Expanded(
                child: Card(
                  elevation: 6,
                  shadowColor: const Color(0x22000000),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: TabBarView(
                      controller: _tabController,
                      children: [
                        _buildCustomerTab(),
                        _buildOwnerTab(),
                      ],
                    ),
                  ),
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(
                    _error!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCustomerTab() {
    return ListView(
      children: [
        Text(
          _t(
            vi: 'Đăng nhập nhanh bằng OTP',
            en: 'Fast OTP sign in',
            fr: 'Connexion OTP rapide',
          ),
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _customerEmailController,
          keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(labelText: _t(vi: 'Email', en: 'Email', fr: 'Email')),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _loading ? null : _requestOtp,
            child: Text(_loading
              ? _t(vi: 'Đang gửi...', en: 'Sending...', fr: 'Envoi...')
              : _t(vi: 'Gửi OTP', en: 'Send OTP', fr: 'Envoyer OTP')),
        ),
        if (_otpSent) ...[
          const SizedBox(height: 20),
          TextField(
            controller: _customerOtpController,
            keyboardType: TextInputType.number,
            maxLength: 6,
              decoration: InputDecoration(labelText: _t(vi: 'Ma OTP', en: 'OTP Code', fr: 'Code OTP')),
          ),
          FilledButton(
            onPressed: _loading ? null : _verifyOtp,
              child: Text(_loading
                  ? _t(vi: 'Đang xác minh...', en: 'Verifying...', fr: 'Verification...')
                  : _t(vi: 'Xác minh OTP', en: 'Verify OTP', fr: 'Verifier OTP')),
          ),
        ],
      ],
    );
  }

  Widget _buildOwnerTab() {
    return ListView(
      children: [
        Text(
          _t(
            vi: 'Bảng quản trị chủ quán',
            en: 'Owner management access',
            fr: 'Acces gestion proprietaire',
          ),
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _ownerUsernameController,
          decoration: InputDecoration(labelText: _t(vi: 'Tên đăng nhập', en: 'Username', fr: 'Nom utilisateur')),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _ownerPasswordController,
          obscureText: true,
          decoration: InputDecoration(labelText: _t(vi: 'Mật khẩu', en: 'Password', fr: 'Mot de passe')),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _loading ? null : _ownerLogin,
          child: Text(_loading
              ? _t(vi: 'Đang đăng nhập...', en: 'Signing in...', fr: 'Connexion...')
              : _t(vi: 'Đăng nhập chủ quán', en: 'Login as Owner', fr: 'Connexion gerant')),
        ),
      ],
    );
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
