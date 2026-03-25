import 'package:shared_preferences/shared_preferences.dart';

enum SessionRole { customer, owner, none }

class SessionSnapshot {
  const SessionSnapshot({required this.role, this.email, this.username});

  final SessionRole role;
  final String? email;
  final String? username;
}

class SessionStore {
  SessionStore._();

  static final SessionStore instance = SessionStore._();

  static const _kRole = 'session_role';
  static const _kEmail = 'session_email';
  static const _kUsername = 'session_username';

  Future<void> saveCustomer({required String email}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kRole, 'customer');
    await prefs.setString(_kEmail, email);
    await prefs.remove(_kUsername);
  }

  Future<void> saveOwner({required String username}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kRole, 'owner');
    await prefs.setString(_kUsername, username);
    await prefs.remove(_kEmail);
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kRole);
    await prefs.remove(_kEmail);
    await prefs.remove(_kUsername);
  }

  Future<SessionSnapshot> readSnapshot() async {
    final prefs = await SharedPreferences.getInstance();
    final rawRole = prefs.getString(_kRole);
    final email = prefs.getString(_kEmail);
    final username = prefs.getString(_kUsername);

    if (rawRole == 'customer') {
      return SessionSnapshot(role: SessionRole.customer, email: email);
    }
    if (rawRole == 'owner') {
      return SessionSnapshot(role: SessionRole.owner, username: username);
    }
    return const SessionSnapshot(role: SessionRole.none);
  }
}
