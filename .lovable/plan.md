# Gushu — Premium Private Messaging (v1)

A premium 1:1 messenger built on the **Obsidian Monolith** direction (onyx surfaces, Instrument Serif display + Instrument Sans body, subtle gold accent, glass composer). Lovable Cloud powers auth, database, storage, and realtime. The provided purple→blue chat-bubble **G logo** becomes the app mark.

## Brand / logo

- Register the uploaded `Logo_no_bg.png` as a CDN asset (`src/assets/gushu-logo.png.asset.json`) — no binary in repo.
- A `<Logo />` component renders the mark; sizes used:
  - Auth screen header (64 px) above "Gushu" wordmark.
  - Sidebar header (28 px) beside the wordmark.
  - Favicon + apple-touch-icon + `og:image` (set in `__root.tsx` head).
  - Empty-state illustration in the chat pane (160 px, low opacity).
- Keep the existing onyx/gold palette; the logo's violet→blue gradient becomes a secondary accent used sparingly (sender bubble hover ring, focus rings, "verified" tooltip).

## Scope (v1)

**In:** Auth (email/username + password, demo accounts), unique usernames, profiles, avatar upload, verification badges, 1:1 messaging, realtime updates, message editing with "Edited" label, image/file sharing, read receipts, online/last-seen, dark/light mode, temporary conversations (auto-purged when both leave), responsive layout, simple admin role + verification toggle UI.

**Deferred (schema-ready, not built):** voice notes, video, group chats, friend requests/blocking, self-destruct timers, pinned chats, message search, AI assistant.

## Design system

Port the prototype tokens verbatim into `src/styles.css` (Tailwind v4 `@theme`):
- Colors: `--color-onyx-950 #09090b`, `--color-onyx-900 #121214`, `--color-onyx-800 #1c1c1f`, `--color-gold-400 #eab308`, plus zinc-based foreground tokens, plus `--color-brand-violet #8b5cf6` and `--color-brand-blue #3b82f6` derived from the logo.
- Fonts: Instrument Serif (display), Instrument Sans (body), loaded via `<link>` in `__root.tsx`.
- Light mode: invert onyx → paper (`#fafaf9`, `#f4f4f5`, `#e7e7ea`) with onyx foreground; gold + brand-gradient accents unchanged. Wire both via `@theme inline` shadcn-token pattern. Toggle via `.dark` class on `<html>`, persisted in `localStorage`.
- Composer / cards: rounded-2xl, ring-1 white/5, soft glass blur on header.

## Routes (TanStack Start, file-based)

```
src/routes/
  __root.tsx               shell, fonts, favicon (logo), theme bootstrap, auth listener
  index.tsx                public landing → redirect to /app or /auth
  auth.tsx                 login + register (tabs), logo header, demo credentials visible
  reset-password.tsx       Supabase recovery flow
  _authenticated/
    route.tsx              (integration-managed gate, ssr:false)
    app.tsx                messenger shell (logo in sidebar + outlet)
    app.index.tsx          empty-state with faded logo + "Select a conversation"
    app.c.$conversationId.tsx   active chat pane
    settings.tsx           profile, avatar, bio, theme
    admin.tsx              admin-only verification toggle UI
```

## Database (migrations)

Tables in `public`, each with explicit `GRANT` + RLS:

- `profiles` — `id (uuid pk → auth.users)`, `username citext unique not null`, `display_name`, `avatar_url`, `bio`, `verified bool default false`, `last_seen_at`, `created_at`. Trigger on `auth.users` insert auto-creates a profile using `raw_user_meta_data.username`.
- `conversations` — `id`, `user1_id`, `user2_id`, `created_at`, `last_message_at`. Unique on ordered pair `(least(u1,u2), greatest(u1,u2))`.
- `messages` — `id`, `conversation_id`, `sender_id`, `content text`, `media_url`, `media_type`, `message_type enum('text','image','video','file')`, `edited bool`, `read_at`, `created_at`, `updated_at`.
- `conversation_status` — `(conversation_id, user_id)` pk, `has_left bool`, `left_at`. When both rows `has_left = true`, a `purge_conversation(uuid)` security-definer function deletes messages, storage objects, and the conversation row.
- `app_role` enum (`admin`,`user`) + `user_roles` table + `has_role(uuid, app_role)` security-definer (per knowledge).

**RLS principle:** a user can read/write a conversation row, its messages, and its status only if they are a participant. Profile reads allowed to all authenticated users (for search/header). Only admins can update `profiles.verified`.

**Realtime:** enable on `messages`, `conversations`, `conversation_status`, `profiles`.

**Storage buckets** (created via tool):
- `avatars` — public, 2 MB images.
- `chat-media` — private, signed URLs; path `{conversation_id}/{message_id}.{ext}`. RLS on `storage.objects` checks conversation participation.

## Server functions (`src/lib/*.functions.ts`)

All user-scoped reads/writes go through `createServerFn` + `requireSupabaseAuth`:

- `auth.functions.ts` — `registerUser({ username, email, password })`, `resolveUsernameToEmail(username)` for login-by-username.
- `profiles.functions.ts` — `searchUsers`, `updateProfile`, `getProfileByUsername`.
- `conversations.functions.ts` — `getOrCreateConversation`, `listMyConversations`, `leaveConversation` (sets `has_left=true`, calls `purge_conversation` when both have left).
- `messages.functions.ts` — `sendMessage`, `editMessage`, `markRead`, `listMessages`.
- `presence.functions.ts` — `heartbeat()` to bump `last_seen_at`.
- `admin.functions.ts` — `setVerified(userId, value)` (asserts `has_role(uid,'admin')`).

Client subscribes to realtime channels directly via the browser supabase client; server fns own mutations.

## Components

- `Logo` (CDN-pointer img, configurable size).
- `AppShell` — sidebar + outlet, logo in the header chip.
- `ConversationList`, `ConversationListItem` (avatar, online dot, badge, unread).
- `ChatHeader` (avatar, name, verified badge, online/last-seen, leave button with confirm dialog: "Chats disappear permanently after both participants leave.").
- `MessageThread`, `MessageBubble` (own vs other, edited label, read receipt, media renderer).
- `Composer` (textarea, emoji picker via `emoji-picker-react`, attach, drag-and-drop, upload progress).
- `UserSearch` (debounced search → start chat).
- `AvatarUploader` (`react-easy-crop`, uploads to `avatars`).
- `VerifiedBadge` (gold-ringed check, shared everywhere).
- `ThemeToggle`.
- `AdminVerificationTable` (gated by `has_role`).

## Auth flow

- Register: username (unique + regex check), email, password, confirm. Pass `username` in `signUp` metadata; trigger creates profile. `emailRedirectTo: window.location.origin`.
- Login: accept email or username — if no `@`, resolve via server fn, then `signInWithPassword`.
- Demo credentials displayed on the login card (`alex/alex123`, `sophia/sophia123`). Seeded by an idempotent `/api/public/seed-demo` route guarded by a build-time secret; documented in README. Credentials shown on login regardless.
- Single global `onAuthStateChange` in `__root.tsx`, filtered to identity transitions.
- Sign-out hygiene: cancel queries → clear cache → `signOut()` → `navigate('/auth', replace)`.

## Temporary chat semantics

- Leave Chat → confirm dialog → `leaveConversation` sets caller's `has_left=true`. If counterpart already left, `purge_conversation` deletes all messages, storage objects under `chat-media/{conversation_id}/*`, then deletes the conversation row.
- Sidebar shows the line: "Chats disappear permanently after both participants leave."

## Notifications

- Unread count from `messages where read_at is null and sender_id != me`. Shown as sidebar badge + in `document.title`.
- Browser `Notification` API requested on first chat open; fired on new realtime message when window hidden.

## Security

- RLS on every table, no anon grants on `messages`/`conversations`/`conversation_status`.
- Zod on every server fn input (username `^[a-z0-9_]{3,20}$`, content ≤ 4000 chars, file ≤ 25 MB, allow-listed MIME).
- File uploads: server fn issues signed upload URL; storage RLS double-checks participant.
- Admin endpoints assert `has_role`.
- Leaked-password protection (HIBP) enabled via `configure_auth`.

## Build order

1. Enable Lovable Cloud; create migrations (enums, tables, grants, RLS, triggers, `has_role`, `purge_conversation`); create storage buckets.
2. Register logo as CDN asset; wire design tokens, fonts, favicon, theme toggle, base shell.
3. Auth pages (with logo header) + `_authenticated` flow + profile auto-create.
4. Messenger shell, conversation list, search, start chat.
5. Message thread + composer + edit + read receipts + realtime.
6. Media upload (avatars + chat media) with crop/preview.
7. Leave-chat + purge + warning copy.
8. Verified badges + admin role + admin page.
9. Notifications, last-seen heartbeat, polish, responsive pass.
10. Seed demo users; verify alex/sophia round-trip; QA dark + light.

## Out of scope (schema-ready)

`message_type` enum already covers future kinds; `messages.updated_at` supports future self-destruct; `conversations` extends easily with `pinned_by_*`; `user_roles` enables future moderation; presence can extend to typing via a Realtime presence channel.
