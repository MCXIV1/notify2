# Recipes

- Place service recipes here and list them in `services.json`.
- `js_unread` should be a self-invoking function string that subscribes to DOM changes (MutationObserver) and calls:
  - `rambox.setUnreadCount(N)` to set count
  - `rambox.clearUnreadCount()` to clear
- Keep scripts idempotent and light; avoid network calls.

Security tips:
- Do not access `node` APIs: webview runs without nodeIntegration.
- Only parse DOM; avoid injecting remote code.