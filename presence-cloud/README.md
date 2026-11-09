# Presence Cloud

A phone-friendly Discord Rich Presence control panel backed by a long-running Linux process using Discord Social SDK. The browser is only the remote dashboard; the SDK worker stays running on the server after the phone browser closes.

## What is implemented

- Discord OAuth2 login and a single-account lock after the first successful sign-in.
- Encrypted-at-rest OAuth access and refresh tokens (AES-256-GCM), signed, secure session cookies, and same-origin checks for browser writes.
- A persistent C++ worker process using the Linux x86_64 Social SDK. It connects with a bearer OAuth token, publishes the selected profile, reports SDK errors, refreshes its OAuth token and restarts after a worker crash.
- Dashboard controls to start or stop the worker and select/update activity profiles. Stopping clears Rich Presence.
- The rest of the profile, schedule and rotation editor from the original dashboard.

The worker is a normal always-running server process. It does not depend on Discord desktop, Chrome, or the phone staying open. The mobile app is the web dashboard; this does not install a native Android app.

## Discord application setup

1. Use the application that has access to the downloaded Social SDK. Its ID is currently configured as `1569073956802134157` by default and can be overridden with `DISCORD_APPLICATION_ID`.
2. In the Developer Portal, open **OAuth2** and create/use a client secret. Set the exact redirect URL to `https://YOUR-DOMAIN/auth/callback`.
3. Make sure the app is permitted to request `sdk.social_layer_presence`. The dashboard requests `identify sdk.social_layer_presence`; Discord may reject the Social SDK scope if the application is not enabled for it.
4. Do not send the client secret to chat or commit it. Add it as a deployment environment variable.

## Private SDK files

Discord's SDK archive is a deployment dependency and is excluded from source control. Copy these Linux x86_64 files from the archive into the local checkout before building:

```text
discord_social_sdk/include/discordpp.h       -> worker/vendor/include/discordpp.h
discord_social_sdk/include/cdiscord.h         -> worker/vendor/include/cdiscord.h
discord_social_sdk/lib/release/libdiscord_partner_sdk.so -> worker/vendor/lib/libdiscord_partner_sdk.so
```

Keep `License-Notices.txt` alongside your private deployment files and comply with Discord's SDK terms. The provided archive is already present in the Codex workspace's local ignored `worker/vendor` folder; it is not uploaded to GitHub.

## Build and run with Docker

Requires Docker and an x86_64 Linux host. The host must support a persistent container and durable storage. Do not use a serverless or sleeping web host for the worker.

```sh
docker build -f worker/Dockerfile -t presence-cloud .
```

Generate secrets with a secure random generator. `TOKEN_ENCRYPTION_KEY` must be 32 random bytes encoded as 64 hexadecimal characters. Set:

```text
NODE_ENV=production
PORT=4173
PUBLIC_URL=https://YOUR-DOMAIN
DISCORD_APPLICATION_ID=1569073956802134157
DISCORD_CLIENT_ID=1569073956802134157
DISCORD_CLIENT_SECRET=<Discord OAuth client secret>
SESSION_SECRET=<at least 32 random bytes, hex or base64>
TOKEN_ENCRYPTION_KEY=<32 random bytes, 64 hex characters>
```

Run the container with a persistent volume mounted at `/app/data`, expose port 4173 behind HTTPS, and configure the OAuth callback above. The first Discord account to complete sign-in becomes the owner; keep the endpoint private until that initial sign-in is complete. Later sign-ins from a different Discord user are rejected. Back up `/app/data/store.json` securely; it contains encrypted OAuth credentials and private profile data.

For local development, `npm start` serves the dashboard. OAuth requires the Discord variables above, `PUBLIC_URL=http://localhost:4173`, and a matching local callback URL in the Developer Portal. Set `COOKIE_SECURE=false` for local HTTP only.

## Worker protocol and limitations

The worker executable is `worker/build/presence-worker` by default; override with `PRESENCE_WORKER`. Discord OAuth tokens are personal credentials and are encrypted in the application data file. The Social SDK scope must be granted by Discord for the app. Image values should be Discord application asset keys or valid SDK-supported image references; URLs may not render as expected. The Social SDK currently expects activity type `Playing`; other editor types are mapped to that supported worker activity type.

Rotations and schedules are still stored by the original dashboard but their background execution controls are not yet wired to the persistent worker. The current server provides start/stop, profile selection/update, and account status setting. An OAuth login success alone is not treated as an activity publishing success; the worker reports SDK callback results.

This repository contains the source, not a hosted website. A live link requires a persistent x86_64 host, HTTPS domain, OAuth client secret and encryption secrets. No hosting service or paid plan has been selected or configured here.

