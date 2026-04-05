# Jellytube

`Jellytube` is a Jellyfin-backed request layer for web video downloads.

It is built for the setup where:

- `Jellyfin` already owns the users and passwords
- `MeTube` is the private download worker for `yt-dlp`
- users should be attributable back to Jellyfin identities
- admins need approval, audit, and queue visibility before content lands in the library

## What The MVP Does

- authenticates users directly against Jellyfin
- accepts signed Jellyfin bridge handoff tokens from a Jellyfin plugin
- stores a signed Jellytube session cookie after successful Jellyfin login
- records requests with Jellyfin user id, username, source, kind, and timestamps
- supports admin approval and rejection for requests
- can queue approved requests into MeTube through `POST /add`
- ships with a tiny Chrome extension that can target either Jellytube directly or the Jellyfin bridge launch URL

## Why It Exists

`MeTube` is a strong downloader, but it does not give you a real user/request model that maps back to Jellyfin.

Jellytube keeps the responsibilities separated:

- `Jellyfin`: identity and admin role
- `Jellytube`: request tracking, approval flow, audit trail, MeTube orchestration
- `MeTube`: private download worker

## Repo Layout

- `apps/server`: Fastify service, auth flow, request API, built-in browser UI
- `plugins/Jellytube.JellyfinBridge`: Jellyfin plugin for signed handoff into Jellytube from Jellyfin Web
- `extensions/chrome`: small browser extension that opens a configured launch URL with the current page prefilled
- `docs/architecture.md`: system design notes and next-step boundaries

## Current Scope

This repo intentionally does not try to make MeTube itself multi-user.

Instead it provides:

- a user-facing request layer
- admin controls around approval and audit
- a Jellyfin Web bridge so users can start from inside Jellyfin

## Local Development

1. Copy `.env.example` to `.env`
2. Set `JELLYFIN_URL`, `METUBE_URL`, `COOKIE_SECRET`, and `HANDOFF_SECRET`
3. Install dependencies and start the service

```bash
pnpm install
cp .env.example .env
pnpm dev:server
```

The app will be available at `http://localhost:3135` by default.

## Build And Test

```bash
pnpm build
pnpm test
pnpm typecheck
```

The root build compiles both:

- the Jellytube server
- the Jellytube Jellyfin bridge plugin

## Chrome Extension

The extension is intentionally small.

It lets a user:

- configure a launch URL
- configure the display label for the site name
- open the configured launch URL with the current tab URL prefilled
- use context-menu entries for page URLs or links

Recommended launch URL once the plugin is installed:

```text
https://your-jellyfin.example.com/JellytubeBridge/start
```

That keeps the user flow Jellyfin-first while still landing them in Jellytube with a signed handoff.

Load it in Chrome via `chrome://extensions` using "Load unpacked" and select `extensions/chrome`.

## Environment

- `JELLYFIN_URL`: Jellyfin base URL used for direct auth
- `METUBE_URL`: internal MeTube URL, for example `http://metube:8081`
- `COOKIE_SECRET`: long random secret for signing Jellytube session cookies
- `HANDOFF_SECRET`: long random secret shared with the Jellytube Jellyfin bridge plugin
- `AUTO_APPROVE_VIDEO_REQUESTS`: if `true`, direct video requests are immediately queued to MeTube
- `ALLOWED_HOSTS`: comma-separated allowlist for non-admin submissions

## Jellyfin Web Flow

The intended browser flow is:

1. User is already signed in to Jellyfin Web
2. User opens `/JellytubeBridge/start`
3. The plugin helper page reuses the current Jellyfin session
4. The plugin issues a short-lived signed handoff token
5. Jellytube verifies the token and creates its own session cookie
6. The request UI opens with the user already authenticated

This is the supported "inside Jellyfin Web" story.

Native TV and mobile clients still benefit after download because playback happens through the normal Jellyfin library once the files exist.

## Recommended Production Shape

- keep MeTube private
- expose Jellytube instead of MeTube
- put Cloudflare Access or another front-door control in front of Jellytube if needed
- use the Jellytube Jellyfin bridge for first-class in-Jellyfin browser launch
