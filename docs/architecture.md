# Architecture

## Purpose

Jellytube is not a downloader.

It is the user and admin control plane that sits in front of MeTube so requests can be tied to Jellyfin identities.

## Runtime Components

### Jellyfin

- source of truth for users and admin status
- authenticates username/password through the standard Jellyfin auth endpoint
- provides a plugin-based handoff flow for Jellyfin Web users

### Jellytube Server

- validates direct Jellyfin login
- issues a signed Jellytube session cookie
- stores request history and approval state
- exposes admin moderation actions
- queues approved requests into MeTube
- serves a minimal browser UI

### MeTube

- stays private behind the request layer
- receives approved jobs through `POST /add`
- downloads to the shared web-video library watched by Jellyfin

### Browser Extension

- convenience client only
- opens either Jellytube directly or the Jellyfin bridge start URL with the current page URL prefilled
- does not become the system of record

### Jellytube Jellyfin Bridge Plugin

- runs on the Jellyfin origin
- reuses the current authenticated Jellyfin web session when available
- issues a short-lived signed handoff token
- redirects the browser into Jellytube without a second login

## Data Model

Each request stores:

- Jellyfin user id
- Jellyfin username
- Jellyfin role at submission time
- source URL
- source classification
- request kind such as `video`, `playlist`, or `channel`
- optional note and title hint
- status
- timestamps
- MeTube submission result metadata when queued

## Security Boundaries

- Jellyfin credentials are only used during login verification and are not persisted
- Jellytube sessions are signed with `COOKIE_SECRET`
- non-admin users are limited by `ALLOWED_HOSTS`
- MeTube should not be directly exposed to the public internet

## Why This Is Better Than Exposing MeTube

MeTube has strong download features but does not provide the audit and approval model needed for shared-family or shared-user environments.

Jellytube adds:

- attributable requests
- admin visibility
- approval and rejection workflow
- a clean place for quotas and future policy

## Planned Next Steps

- SQLite or Postgres storage instead of JSON file persistence
- richer MeTube submission options and result polling
- per-user limits and moderation rules
- dedicated admin review UI for playlist and channel backfill decisions
- Jellyfin Web navigation integration beyond the bridge route itself
