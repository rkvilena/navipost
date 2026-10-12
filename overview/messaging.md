# Navipost — Message Protocol

All inter-component communication uses `chrome.runtime` messages typed by the `NavipostMessage` union in `types/navipost.ts`. This document is the contract between the content script, background service worker, popup, and side panel. See the [overview](../overview.md) for the big picture.

## Rules

- **The background worker is the hub.** The content script and UIs never message each other directly; every request goes through the background.
- **The background is the only writer** to `chrome.storage.local`. UIs and the content script only read via `GET_STORAGE` or receive snapshots via `STORAGE_UPDATED`.
- Messages carry `{ type, payload? }`; the background replies via `sendResponse` with `{ ok: true, ... }` on success or `{ ok: false }` on failure/unknown type.
- `lib/messaging.ts` (`sendRuntimeMessage`) wraps sending in try/catch and returns `null` on failure so a sleeping or missing receiver never throws into the sender.
- Background operations are async; the listener returns `true` to keep the `sendResponse` channel open until the async work finishes.

## Message reference

| Type | Sender | Payload | Handler effect | Response |
| --- | --- | --- | --- | --- |
| `TWEET_BOOKMARKED` | Content script | `{ tweet: Tweet }` | Adds/updates the tweet in the unsorted folder; broadcasts `STORAGE_UPDATED`; auto-opens the side panel if enabled | `{ ok: true }` |
| `TWEET_UNBOOKMARKED` | Content script | `{ tweetId: string }` | Removes the tweet from all folders; broadcasts | `{ ok: true }` |
| `ASSIGN_TWEET_TO_FOLDER` | Side panel | `{ tweetId, folderId }` | Moves the tweet (removes from every folder, inserts into target; unsorted fallback if target missing); broadcasts | `{ ok: true }` |
| `CREATE_FOLDER` | Side panel | `{ name }` | Creates a (trimmed, case-insensitively deduplicated) folder; broadcasts | `{ ok: true }` |
| `DELETE_FOLDER` | Side panel | `{ folderId }` | Deletes the folder per `folderDeleteBehavior` (no-op for `unsorted`); broadcasts | `{ ok: true }` |
| `TOGGLE_AUTO_OPEN_SIDE_PANEL` | Side panel | `{ enabled: boolean }` | Persists `settings.autoOpenSidePanel`; broadcasts | `{ ok: true }` |
| `SET_THEME_MODE` | Side panel | `{ theme: "light" \| "dark" \| "system" }` | Persists `settings.theme`; broadcasts | `{ ok: true }` |
| `OBSERVER_READY` | Content script | `{ ready: boolean, handle?: string }` | Sets/clears the tab's observer state (handle + readiness) used for storage-key resolution | `{ ok: true }` if from a tab, else `{ ok: false }` |
| `GET_OBSERVER_STATUS` | Popup, side panel | `{ tabId: number }` | Reads (does not mutate) tab observer state and whether the tab URL is X/Twitter | `{ ok, ready, isX, handle? }` |
| `GET_STORAGE` | Popup, side panel | — | Reads and normalizes storage for the caller's namespace | `{ ok: true, storage }` |
| `STORAGE_UPDATED` | Background (broadcast) | `{ storage: NavipostStorage }` | Not a request — UIs listen for this to refresh local state | — (no response expected) |

Payload types are defined in `types/navipost.ts` (e.g. `BookmarkPayload`, `AssignTweetPayload`, `ObserverReadyPayload`).

## Storage-key resolution on requests

For every mutating or reading request, the background resolves a storage key:

1. If the sender's tab has a detected handle (`observerStateByTab`), use `navipost::<handle>`.
2. Otherwise, fall back to the handle of the **active tab** in the current window, if known.
3. Otherwise use the shared `navipost` fallback key.

This is why `OBSERVER_READY` (with the handle) matters even before the user bookmarks anything: without it, the background cannot attribute operations to an account.

## UI synchronization pattern

Both UIs follow the same pattern:

1. On mount, send `GET_STORAGE` to hydrate local React state.
2. Register a `chrome.runtime.onMessage` listener for `STORAGE_UPDATED`; on receipt, replace local state with `payload.storage`.
3. All mutations are fire-and-forget messages; the UI waits for the broadcast rather than the request response to refresh.

Trade-off: UIs stay consistent across popup/side-panel instances, but a lost broadcast (e.g. no receiver registered at broadcast time) can leave a stale view until the next event or reopen.
