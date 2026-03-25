class OnlineUserStats {
  const OnlineUserStats({
    required this.onlineDevices,
    required this.onlineUsers,
  });

  final int onlineDevices;
  final int onlineUsers;

  factory OnlineUserStats.fromJson(Map<String, dynamic> json) {
    return OnlineUserStats(
      onlineDevices: (json['online_devices'] as num?)?.toInt() ?? 0,
      onlineUsers: (json['online_users'] as num?)?.toInt() ?? 0,
    );
  }
}
