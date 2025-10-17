# MultiMessenger (clean Franz/Rambox-style clone)

Modern, secure, and extensible multi-messenger built with Electron + TypeScript + React + Vite.

## Features (MVP)
- Per-service persistent sessions via `partition="persist:..."` webviews
- Service recipes with optional `js_unread` injection
- App badge/tray unread counter
- Vertical tab list, add/remove services
- Secure Electron config: sandbox, contextIsolation, no nodeIntegration in webview

Planned:
- Master password + encrypted config (AES-GCM, scrypt) [TODO]
- Proxy settings per service [TODO]
- Auto-launch, DND, per-service mute, custom CSS/JS [TODO]
- Permission governance (notifications, mic/cam) [TODO]

## Dev
```bash
npm i
npm run dev
```
- Vite runs at http://localhost:5173
- Electron loads that URL, TypeScript for main/preloads is compiled by `tsc -w`.

## Build
```bash
npm run build     # compiles main and renderer
npm run dist      # packages installers with electron-builder
```

Artifacts in ./release

## Recipes
Add JSON files to ./recipes and list them in `services.json`. Each recipe:

```json
{
  "id": "slack",
  "name": "Slack",
  "type": "messaging",
  "url": "https://app.slack.com/client",
  "allowPopups": true,
  "permissions": { "notifications": true },
  "js_unread": "(function(){ /* compute count; call rambox.setUnreadCount(n) */ })"
}
```

The string in `js_unread` is injected into the webview and must call `rambox.setUnreadCount(n)` or `rambox.clearUnreadCount()`.

## Security
- Main window: `contextIsolation`, `sandbox`, no `nodeIntegration`
- Webview: runs with its own preload that exposes only the `rambox` API
- External links open in default browser

## Branding & License
This project does not reuse Franz/Rambox brands or assets.  
License: MIT (see LICENSE).