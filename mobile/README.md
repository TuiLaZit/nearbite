# NearBite Native Mobile (Flutter)

Native mobile app built with Flutter for 2 actors:
- Customer: OTP login, map tracking, narration/audio, tour planner.
- Owner: login, restaurant profile update, menu CRUD, tag management, image upload/delete.

Included in this app:
- `.env` support (gitignored) for backend domain.
- Free map stack via OpenStreetMap (`flutter_map`).
- Session-expired redirect (auto re-login when cookie expires).
- Offline cache + retry queue for tracking endpoints.

## 1) Prerequisites

- Flutter SDK 3.3+
- Android Studio (for Android demo)
- A backend URL already deployed from this repository (Railway Flask backend)

## 2) First-time setup (Windows)

Open terminal at `mobile` and run:

```bash
flutter doctor
```

Fix all required items from `flutter doctor` (Android SDK, licenses, etc.) before continuing.

## 3) Configure backend URL (.env)

Edit `.env` in this folder:

```env
API_BASE_URL=https://your-railway-domain.up.railway.app
```

`.env` is already gitignored, so your domain/config is not committed.

## 4) Run app with Flutter (recommended)

In terminal at `mobile`:

```bash
pwsh ./run-android.ps1
```

What this script does:
- Checks Flutter SDK availability.
- Creates `android/` platform if missing.
- Keeps your `.env` config.
- Runs `flutter pub get` and `flutter run`.

If you need recreate Android platform:

```bash
pwsh ./run-android.ps1 -RecreateAndroid
```

If you want override backend URL only for one run:

```bash
pwsh ./run-android.ps1 -ApiBaseUrl https://your-other-domain.up.railway.app
```

## 5) Run from Android Studio (GUI flow)

1. Open folder `mobile` in Android Studio.
2. Wait for Gradle/Flutter indexing to finish.
3. Open Device Manager, start an emulator.
4. Open Terminal in Android Studio and run:

```bash
pwsh ./run-android.ps1
```

5. Or press Run button after Flutter plugin recognizes target device.

## 6) Map choice for student budget

Current implementation uses:
- `flutter_map` + OpenStreetMap public tiles (free, no Google key needed for demo).

Important note:
- OpenStreetMap public tile server is free but has usage policy and rate limits.
- For heavier demo/load, use a free-tier tile provider (MapTiler, Stadia Maps) or self-host tiles.

If you still want Google Maps later, switch back to `google_maps_flutter` and configure keys.

## 7) Session expiry re-login

- API client listens for `401 Unauthorized`.
- On session timeout, app emits session-expired event and redirects user back to login screen.
- Applied for both customer and owner screens.

## 8) Offline cache + retry queue

- Cached data:
  - languages
  - restaurants by language
  - tags by language
- If network fails, app falls back to cached data.
- Tracking endpoints (`/heartbeat`, `/track-location`, `/track-audio`) are queued offline.
- Queue is retried automatically when connectivity returns and every 30 seconds.

## 9) Backend compatibility

This app is wired to existing REST endpoints in backend:

- Auth: `/customer/request-otp`, `/customer/verify-otp`, `/customer/check`, `/customer/logout`, `/owner/login`, `/owner/check`, `/owner/logout`
- Customer: `/languages`, `/restaurants`, `/tags`, `/location`, `/plan-tour`, `/heartbeat`, `/track-location`, `/track-audio`
- Owner: `/admin/restaurants/analytics`, `/admin/restaurants/:id`, `/admin/restaurants/:id/menu`, `/admin/menu/:id`, `/admin/tags`, `/admin/restaurants/:id/tags/:id`, `/admin/upload-image`, `/admin/restaurants/:id/images`, `/admin/images/:id`

The app uses session cookies (same as current web flow) via `dio_cookie_manager` and persisted cookie jar.

## 10) Main app structure

- `lib/features/auth/login_screen.dart`: Customer OTP + Owner login
- `lib/features/customer/customer_home_screen.dart`: Flutter Map (OSM) + tracking + audio + heartbeat
- `lib/features/customer/tour_planner_screen.dart`: tour planning and open in Google Maps
- `lib/features/owner/owner_dashboard_screen.dart`: owner full CRUD dashboard
- `lib/services/backend_api.dart`: REST API integration layer

## 11) Optional Google Maps (only if needed)

### Android

Edit `android/app/src/main/AndroidManifest.xml` and add inside `<application>`:

```xml
<meta-data
  android:name="com.google.android.geo.API_KEY"
  android:value="YOUR_ANDROID_MAPS_KEY"/>
```

### iOS

Edit `ios/Runner/AppDelegate.swift` and initialize maps key:

```swift
import GoogleMaps

GMSServices.provideAPIKey("YOUR_IOS_MAPS_KEY")
```

Also ensure `ios/Runner/Info.plist` has location permissions:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>NearBite uses location to suggest nearby restaurants and build tours.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>NearBite uses location to keep live nearby restaurant recommendations updated.</string>
```

## 12) Recommended next improvements

- Add biometric re-auth for owner actions.
- Add secure local storage encryption for sensitive client state.
- Add push notifications (FCM) for owner alerts.
- Add offline cache for restaurants/tags and retry queue for tracking events.
- Add unit/widget/integration test suites.
