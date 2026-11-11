# Android app: install and run

## Download the APK

Download [app-debug.apk](https://github.com/lucky1232011/CUSTOMRPC/blob/main/android/app-debug.apk) from this repository. On GitHub, open the file and use **Download raw file**. This is the APK Android Studio reported as successfully built.

This repository is private. Sign into the GitHub account that has access to it before downloading.

## Install on your phone

1. Transfer `app-debug.apk` to your Android phone (USB, Drive, or another file transfer method).
2. Open the APK from the phone's Downloads or file manager.
3. If Android asks, allow that app to **Install unknown apps**, then confirm installation.
4. Open **Custom RPC** and grant the requested Usage Access and Notification Access permissions if you want automatic app/media detection.
5. Sign into the Discord Android app, then start Rich Presence in Custom RPC.
6. For longer sessions, set Custom RPC battery usage to **Unrestricted** and keep the phone powered.

The persistent notification indicates that the foreground service is active and provides a Stop action. Android may still stop it after force-stop, reboot, or aggressive manufacturer battery management; reopen the app and start it again if needed.

## What this build does and does not do

- Publishes Discord Rich Presence using Discord Social SDK Android RPC.
- Lets you provide a manual activity or use on-device app/media detection.
- Does not require a web browser or the computer to stay on.
- Requires the phone to stay powered and Discord installed and signed in. It does not force your Discord account's Online/Idle state.
- Video titles are best-effort; they appear only when the media app exposes them through Android's media session.
- This is a debug APK built by Android Studio, not a Play Store release.

## Build from source

Open the `android/` project folder in Android Studio, let Gradle sync complete, then choose **Build > Build Bundle(s) / APK(s) > Build APK(s)**. The generated debug APK is at:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

The Discord Social SDK AAR is a licensed private dependency excluded from Git. See [android/README.md](android/README.md) to prepare it before rebuilding.
