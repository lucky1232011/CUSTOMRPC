# Presence Cloud

A self-hostable, responsive activity profile dashboard. It provides persistent profile configuration, simulated previews, profile search/favourites/categories, rotation presets, schedule storage, a sleep timer preference, asset URL inventory, and operational logs.

## Important capability boundary

This build is a functional configuration dashboard. It **does not publish Rich Presence**, run a remote worker, connect Discord OAuth, or change account status. Selecting a profile only changes the saved dashboard selection. The UI and logs say so explicitly.

Discord's official [Social SDK client reference](https://discord.com/developers/docs/slayer-sdk/classdiscordpp_1_1Client.html) documents both `UpdateRichPresence` and `SetOnlineStatus`. Those methods are part of a client SDK integration in an app, not a generic remote web API. The SDK must be integrated into a compatible native app and authorized; OAuth alone does not give this dashboard a way to publish a third-party game's activity or alter status. Discord's [Getting Started guide](https://discord.com/developers/docs/slayer-sdk/getting_started.html) describes SDK app setup and its main-loop callbacks. This implementation avoids self-bot techniques and personal account tokens.

## Run locally

Requires Node.js 20 or later; no package install is needed.

```sh
npm start
```

Open http://localhost:4173. Data persists in `data/store.json`. Back up this file before moving or replacing the app. The first run creates seeded example profiles.

## Features

- Create, edit, delete, duplicate, search, select, and categorize profiles; favourite state is retained.
- Configure activity type, text, image URLs, button URLs, party fields and a simulated preview.
- Save sequential/random rotation presets and recurring weekday schedules with time zones.
- Save a smart sleep timer preference.
- Inspect asset references, health states, and timestamped events.
- Responsive layout for phone, tablet and desktop.
- JSON-file persistence through a small Node HTTP server.

## Security and deployment status

This is single-user local software, with no authentication, CSRF controls, rate limiting, managed database, OAuth, TLS termination, or multi-user authorization. **Do not expose it to the public internet.** The JSON API is unauthenticated and suitable only for a trusted local machine. Before public deployment, implement those controls, move to a database, validate deployments behind HTTPS, and add backups and secret management.

No cloud account, repository, domain, or deployment credentials were provided, so this artifact has not been deployed. Free hosts frequently sleep or restrict continuous processes; the app has no worker process and therefore schedules/rotations are stored, not executed. A genuinely always-on worker may need paid infrastructure. No subscription has been initiated.

## Discord limitations

- Rich Presence requires a supported Discord client/SDK integration. Discord's desktop RPC IPC is local to the host and cannot be reached by a browser on a remote server.
- The official Social SDK is designed for a game or app integration and SDK authentication; it is not a generic personal RPC host for this dashboard.
- Discord Social SDK includes account online-status support in the SDK API, but it must be called by an integrated authorized client. This app does not have one. Custom status text/emoji are not implemented.
- Discord app image keys should be uploaded in the Developer Portal. Arbitrary external image URLs in saved profiles are only preview references and may not render in Discord.
- No join/spectate transport integration is implemented.
- No authentication means there is no safe multi-user deployment path yet.

## API routes

- `GET /api/state`, `GET /api/health`
- `POST /api/profiles`, `PUT/DELETE /api/profiles/:id`
- `POST /api/activate` (dashboard selection only; response has `published:false`)
- `POST /api/rotations`, `DELETE /api/rotations/:id`
- `POST /api/schedules`, `DELETE /api/schedules/:id`
- `POST /api/settings`, `POST /api/logs`

`npm run check` validates server JavaScript syntax. Manual API smoke-test results are recorded in `TEST-RESULTS.md`.

