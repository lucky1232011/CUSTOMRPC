# CUSTOMRPC

## Android app

**[Android install and download guide](ANDROID_INSTALL.md)**

The guide covers installing and running the Android Rich Presence app. The APK is expected at [android/app-debug.apk](android/app-debug.apk).

> If the APK link does not open, upload and commit `app-debug.apk` to the repository's `android/` folder first.

The Android app can publish Rich Presence while its foreground service runs on your phone. The phone must stay on, and Discord must be installed and signed in. Android app/media detection is local and video titles are best-effort.

## Web dashboard

The previous web dashboard source is in [presence-cloud/](presence-cloud/README.md). It does not run the Android Rich Presence worker.

For Android SDK dependency setup and Android Studio build steps, see [ANDROID_INSTALL.md](ANDROID_INSTALL.md).
