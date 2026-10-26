# Android build

| Variant | INTERNET permission | Use |
|---|---|---|
| `offlineDebug` | yes (Metro only) | development |
| `offlineRelease` | **no** | private/offline distribution |
| `standardDebug` / `standardRelease` | yes | future optional model downloads |

```bash
cd mobile/android
./gradlew assembleOfflineDebug   -PreactNativeArchitectures=arm64-v8a
./gradlew assembleOfflineRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

- First build downloads the sherpa-onnx 1.13.8 AAR (47 MB) into `app/libs/` and checks its SHA-256 (`633c2432…bd96`).
- `:lame` builds LAME 3.100 with CMake. It is linked with a 16 KB max page size for Android 15+ devices.
- Release builds are still signed with the debug keystore. **Create your own keystore before publishing.**
- Run `npx react-native run-android --mode offlineDebug` or install the APK with `adb`.

## Windows note

If `npm` fails with `EPERM lstat C:\Users\<other user>\AppData`, Node was installed via nvm under another account. Run npm as `node --preserve-symlinks-main --preserve-symlinks <nvm>\node_modules\npm\bin\npm-cli.js`. During development the `.tools/bin` shims did exactly this.
