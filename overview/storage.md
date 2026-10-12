# Navipost — Storage Model & Account Handling

This document details the persisted data layer (`lib/storage.ts` + `types/navipost.ts`). For the overall architecture, see the [overview](../overview.md).

## Storage engine

- Persisted via `chrome.storage.local` — local to the browser profile, no sync, no backend.
- The extension stores **one root object per storage key**, not one key per tweet.

## Schema

```ts
type ThemeMode = "light" | "dark" | "system"

type FolderDeleteBehavior = "move_to_unsorted" | "delete_tweets"

interface Tweet {
  id: string        // X/Twitter status ID
  handle: string    // author handle, e.g. "@someone" ("@unknown" if undetectable)
  text: string
  url: string       // tweet permalink
  savedAt: number   // Unix timestamp (seconds) when captured
}

interface Folder {
  id: string        // "unsorted" for the default folder, otherwise a generated UUID
  name: string
  tweets: Tweet[]
}

interface NavipostSettings {
  autoOpenSidePanel: boolean
  theme: ThemeMode
  folderDeleteBehavior: FolderDeleteBehavior
}

interface NavipostStorage {
  settings: NavipostSettings
  folders: Folder[]
}
```

## Defaults

```text
autoOpenSidePanel: true
theme:             "system"          // follows OS prefers-color-scheme
folderDeleteBehavior: "move_to_unsorted"
folders:           [ { id: "unsorted", name: "General / Unsorted", tweets: [] } ]
```

## Storage namespaces and per-account isolation

`buildStorageKey(handle)` produces:

| Handle detected | Storage key |
| --- | --- |
| `alice` / `@alice` | `navipost::alice` |
| not detected | `navipost` (shared fallback) |

Implications:

- Each X/Twitter account gets its own folders and settings **only while the handle is detected** on the page.
- If detection fails (e.g. X/Twitter markup changes, logged-out state, fresh navigation before `OBSERVER_READY`), operations fall back to the shared `navipost` key. Data written there is not visible to account namespaces.
- The background resolves the handle from its per-tab observer state (reported by the content script via `OBSERVER_READY`); if the sending tab is unknown, it consults the active tab in the current window.
- Handle detection is DOM-based, so it is as fragile as any scraping (see [Limitations](../overview.md#limitations)).

## Data normalization and invariants

Every read and write goes through `buildStorage()`, which guarantees:

- **Shape safety** — non-object storage, missing settings, or non-array `folders` are replaced with defaults; each field is type-checked individually.
- **Unsorted folder always exists** — if it's missing, it is re-inserted at the front with id `unsorted` and name "General / Unsorted".
- **Malformed entries are dropped** — folders without valid `id`/`name`/`tweets`, and tweets without valid `id`/`handle`/`text`/`url`/`savedAt`, are filtered out.
- **Settings validation** — invalid values fall back to `DEFAULT_STORAGE` values per field.

This means the UI can always assume a complete, valid `NavipostStorage`, even after partial corruption or schema drift from older versions.

## Folder rules

- Folder names are **trimmed**; empty/whitespace names are ignored (no folder created).
- Folder names are **case-insensitively deduplicated** — creating a folder with an existing name (any casing) is a no-op.
- The `unsorted` folder **cannot be deleted** (`DELETE_FOLDER` on `unsorted` is a no-op).
- Folder IDs are `crypto.randomUUID()` where available, with a timestamp-based fallback.

## Tweet placement rules

- New/updated bookmarks go into the **unsorted** folder (`addOrUpdateTweetInUnsorted`); re-bookmarking an existing tweet updates it in place.
- Moving a tweet (`assignTweetToFolder`) **removes it from every folder first**, then inserts it (at the top) of the target folder.
- If the target folder no longer exists, the tweet is returned to the **unsorted** folder rather than dropped.
- Unbookmarking (`removeTweetEverywhere`) removes the tweet from **all** folders.

## Folder deletion behavior

Governed by `settings.folderDeleteBehavior`:

- `move_to_unsorted` (default) — the deleted folder's tweets are prepended to the unsorted folder.
- `delete_tweets` — the deleted folder's tweets are removed entirely.

> Note: this setting is honored by the storage layer but currently has no UI or message to change it.

## Concurrency notes

- Mutations are sequential per message: read-modify-write with `await` on Chrome storage promises. There is no locking; rapid concurrent mutations (e.g. many bookmark clicks in quick succession) are serialized by the background's async handler order, but callers should not assume transactional guarantees across independent messages.
