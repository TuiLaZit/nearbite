import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../../core/auth/session_store.dart';
import '../../core/network/api_client.dart';
import '../../core/settings/language_store.dart';
import '../../services/backend_api.dart';
import '../customer/customer_home_screen.dart';
import '../owner/owner_dashboard_screen.dart';

class RoleSelectionScreen extends StatefulWidget {
  const RoleSelectionScreen({super.key, required this.apiClient});

  final ApiClient apiClient;

  @override
  State<RoleSelectionScreen> createState() => _RoleSelectionScreenState();
}

class _RoleSelectionScreenState extends State<RoleSelectionScreen> {
  _RoleType _selectedRole = _RoleType.customer;
  String _language = 'vi';
  late final PageController _pageController;
  late final BackendApi _api;

  final _customerEmailController = TextEditingController();
  final _customerOtpController = TextEditingController();
  final _ownerUsernameController = TextEditingController();
  final _ownerPasswordController = TextEditingController();

  bool _otpSent = false;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _api = BackendApi(widget.apiClient);
    _pageController = PageController(initialPage: 0);
    _restoreLanguage();
  }

  @override
  void dispose() {
    _pageController.dispose();
    _customerEmailController.dispose();
    _customerOtpController.dispose();
    _ownerUsernameController.dispose();
    _ownerPasswordController.dispose();
    super.dispose();
  }

  Future<void> _restoreLanguage() async {
    final saved = await LanguageStore.read();
    if (!mounted || saved == null) return;
    setState(() {
      _language = saved;
    });
  }

  String _text(String vi, String en, String fr) {
    switch (_language) {
      case 'en':
        return en;
      case 'fr':
        return fr;
      default:
        return vi;
    }
  }

  String _messageFromDio(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['error'] != null) {
      return data['error'].toString();
    }
    return e.message ?? 'Request failed';
  }

  Future<void> _requestOtp() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await _api.customerRequestOtp(email: _customerEmailController.text.trim());
      if (!mounted) return;
      setState(() {
        _otpSent = true;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _messageFromDio(e);
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
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

      await SessionStore.instance.saveCustomer(
        email: (result['email'] ?? '').toString(),
      );

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
      if (!mounted) return;
      setState(() {
        _error = _messageFromDio(e);
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
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

      await _api.ownerCheck();

      await SessionStore.instance.saveOwner(
        username: (result['username'] ?? '').toString(),
      );

      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => OwnerDashboardScreen(apiClient: widget.apiClient),
        ),
      );
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _messageFromDio(e);
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Owner login failed: ${e.toString()}';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
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
    final selectedIndex = _selectedRole == _RoleType.customer ? 0 : 1;

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        leading: IconButton(
          tooltip: _text('Về màn hình khách', 'Back to guest mode', 'Retour mode invite'),
          onPressed: _continueAsGuest,
          icon: const Icon(Icons.arrow_back),
        ),
        title: Text(
          _text('Chọn vai trò đăng nhập', 'Choose login role', 'Choisir le role'),
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
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 16),
              Text(
                _text(
                  'Trượt để chọn vai trò',
                  'Slide to choose role',
                  'Glissez pour choisir le role',
                ),
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              SegmentedButton<int>(
                segments: [
                  ButtonSegment<int>(
                    value: 0,
                    icon: const Icon(Icons.person),
                    label: Text(_text('Khách hàng', 'Customer', 'Client')),
                  ),
                  ButtonSegment<int>(
                    value: 1,
                    icon: const Icon(Icons.store),
                    label: Text(_text('Chủ quán', 'Owner', 'Gerant')),
                  ),
                ],
                selected: <int>{selectedIndex},
                onSelectionChanged: (values) {
                  final value = values.first;
                  setState(() {
                    _selectedRole = value == 0 ? _RoleType.customer : _RoleType.owner;
                  });
                  _pageController.animateToPage(
                    value,
                    duration: const Duration(milliseconds: 260),
                    curve: Curves.easeOutCubic,
                  );
                },
              ),
              const SizedBox(height: 16),
              Expanded(
                child: PageView(
                  controller: _pageController,
                  onPageChanged: (index) {
                    setState(() {
                      _selectedRole = index == 0 ? _RoleType.customer : _RoleType.owner;
                    });
                  },
                  children: [
                    _RoleCard(
                      icon: Icons.person,
                      title: _text('Khách hàng', 'Customer', 'Client'),
                      child: Column(
                        children: [
                          TextField(
                            controller: _customerEmailController,
                            keyboardType: TextInputType.emailAddress,
                            decoration: InputDecoration(
                              labelText: _text('Email', 'Email', 'Email'),
                            ),
                          ),
                          const SizedBox(height: 10),
                          Align(
                            alignment: Alignment.centerRight,
                            child: FilledButton(
                              onPressed: _loading ? null : _requestOtp,
                              child: Text(
                                _loading
                                    ? _text('Đang gửi...', 'Sending...', 'Envoi...')
                                    : _text('Gửi OTP', 'Send OTP', 'Envoyer OTP'),
                              ),
                            ),
                          ),
                          if (_otpSent) ...[
                            const SizedBox(height: 10),
                            TextField(
                              controller: _customerOtpController,
                              keyboardType: TextInputType.number,
                              maxLength: 6,
                              decoration: InputDecoration(
                                labelText: _text('Mã OTP', 'OTP Code', 'Code OTP'),
                              ),
                            ),
                            Align(
                              alignment: Alignment.centerRight,
                              child: FilledButton(
                                onPressed: _loading ? null : _verifyOtp,
                                child: Text(
                                  _loading
                                      ? _text('Đang xác minh...', 'Verifying...', 'Verification...')
                                      : _text('Đăng nhập', 'Login', 'Connexion'),
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    _RoleCard(
                      icon: Icons.store,
                      title: _text('Chủ quán', 'Owner', 'Gerant'),
                      child: Column(
                        children: [
                          TextField(
                            controller: _ownerUsernameController,
                            decoration: InputDecoration(
                              labelText: _text('Tên đăng nhập', 'Username', 'Nom utilisateur'),
                            ),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            controller: _ownerPasswordController,
                            obscureText: true,
                            decoration: InputDecoration(
                              labelText: _text('Mật khẩu', 'Password', 'Mot de passe'),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Align(
                            alignment: Alignment.centerRight,
                            child: FilledButton(
                              onPressed: _loading ? null : _ownerLogin,
                              child: Text(
                                _loading
                                    ? _text('Đang đăng nhập...', 'Signing in...', 'Connexion...')
                                    : _text('Đăng nhập', 'Login', 'Connexion'),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
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
}

enum _RoleType { customer, owner }

class _RoleCard extends StatelessWidget {
  const _RoleCard({
    required this.icon,
    required this.title,
    required this.child,
  });

  final IconData icon;
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 6,
      shadowColor: const Color(0x22000000),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.start,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: const Color(0xFFBCEEE7),
                borderRadius: BorderRadius.circular(18),
              ),
              child: Icon(icon, size: 34, color: const Color(0xFF0A5C54)),
            ),
            const SizedBox(height: 12),
            Text(title, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 14),
            child,
          ],
        ),
      ),
    );
  }
}
