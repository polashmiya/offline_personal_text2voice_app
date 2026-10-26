# Privacy

- All text processing, speech generation, playback and export run **on the device**.
- The `offline` release flavor has **no `INTERNET` permission**, so it cannot send anything anywhere. Debug builds add INTERNET only so they can talk to Metro.
- No account, no analytics, no crash reporting SDK.
- Logs contain ids, states, timings and error codes, never user text or audio (`src/services/logging/logger.ts`).
- Voice packages are data only and are never executed.
- Sharing exposes only files the user exported (`files/exports/`) through Android's FileProvider.
- **Settings → Privacy → Delete all projects and audio** removes projects, history, exports, drafts and dictionary entries. Each voice can be deleted from its detail screen.
- Personal voices (future): the consent record is required in the voicepack manifest, and recordings stay on the device unless the user exports them.
