# Navipost

Navipost is a browser extension for Chrome/Chromium that organizes your X/Twitter bookmarks into named folders. It watches the bookmark button you already use on X/Twitter, captures the bookmarked post, and manages it through a side panel — folders, search, and moving posts around — entirely in your browser.

For the system design and internals, see [overview.md](overview.md).

## Features

- Captures posts when you use X/Twitter's native bookmark / unbookmark buttons
- Saves posts into named folders (new posts land in **General / Unsorted**)
- Search across saved posts
- Create and delete folders; move posts between folders
- Automatically opens the side panel after you bookmark a post (toggleable)
- Light / dark theme support (follows OS by default)
- Per-account storage separation when X/Twitter's active handle can be detected
- Local-only storage — no backend, no Navipost account, no sync

## Supported browsers and sites

- **Browser:** Chrome or Chromium-based browsers with Manifest V3 and the [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) (Chrome 114+). Not tested on Firefox or Safari.
- **Sites:** `https://x.com/*` and `https://twitter.com/*`. The side panel is only available on these domains.
- **Note:** Navipost does *not* add its own bookmark button. It reacts to X/Twitter's existing bookmark controls, so it organizes a local copy of what you bookmark on X/Twitter — it does not modify your native X bookmarks.

## How it works for users

1. Install and load the extension (see below).
2. Open X/Twitter and log in.
3. Bookmark a post the way you normally would — Navipost captures it.
4. The post appears in the **General / Unsorted** folder.
5. Open the side panel (from the extension popup or the browser side-panel control).
6. Create folders and move posts between them as you like.
7. Unbookmarking a post on X/Twitter removes it from Navipost.

## Privacy and data storage

- All data is stored locally in your browser via `chrome.storage.local`. There is no server and nothing is uploaded.
- The extension requests access to X/Twitter pages (`x.com`, `twitter.com`) to observe bookmark clicks, plus `storage`, `tabs`, and `sidePanel` permissions.
- Data is tied to your browser profile; removing the extension or clearing its data deletes everything it saved.
- Per-account isolation depends on detecting the active handle from the X/Twitter page. When detection fails, data falls back to a shared namespace — see [Per-account isolation](overview/storage.md#per-account-isolation) in the architecture docs.

## Prerequisites

- **Node.js** — v18 or later recommended
- **pnpm** — preferred package manager (`npm` also works)
- **Chrome/Chromium** — for loading and testing the extension

## Installation

```bash
pnpm install
```

## Development

Start the Plasmo development server:

```bash
pnpm dev
```

Then load the dev build into Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `build/chrome-mv3-dev` directory.
5. Open (or reload) a X/Twitter tab.

React UI changes hot-reload; if you change the content script or background logic, reload the extension in `chrome://extensions` and refresh the X/Twitter tab.

## Available commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Starts the Plasmo development server |
| `pnpm build` | Creates a production extension build |
| `pnpm package` | Creates a distributable ZIP archive for store submission |
| `pnpm typecheck` | Runs TypeScript type checking without emitting files |

> There are currently no automated tests. See the manual verification checklist below.

## Manual verification checklist

Use this to sanity-check changes before pushing:

- [ ] Load the unpacked extension and open X/Twitter.
- [ ] Bookmark a post → it appears in **General / Unsorted**.
- [ ] The side panel auto-opens (or does not, when auto-open is off).
- [ ] Create a folder and move the post into it.
- [ ] Search for the post.
- [ ] Reload the extension → saved posts persist.
- [ ] Unbookmark the post → it disappears from all folders.
- [ ] Switch X/Twitter accounts → saved posts are separated per account.
- [ ] Toggle dark mode → theme applies to popup and side panel.
- [ ] Toggle dark mode → theme applies to popup and side panel.

## Production build and packaging

```bash
pnpm build    # production build in build/chrome-mv3-prod
pnpm package  # ZIP archive in build/chrome-mv3-prod.zip
```

`pnpm build` produces the extension bundle; `pnpm package` is what creates the ZIP artifact used for store submission.

## Publishing

Publishing is automated through [.github/workflows/submit.yml](.github/workflows/submit.yml), which uses [Browser Platform Publish (bpp)](https://bpp.browser.market):

- Triggered manually via GitHub Actions (`workflow_dispatch`).
- Builds, packages, and publishes `build/chrome-mv3-prod.zip` to the store.
- Requires a `SUBMIT_KEYS` repository secret containing your bpp credentials.
- Before the first automated run, you must manually build and upload the first version to the store to establish credentials. See the [Plasmo submission docs](https://docs.plasmo.com/framework/workflows/submit).

## Troubleshooting

### The side panel does not open

- Make sure the current tab is on `x.com` or `twitter.com` — the panel is disabled elsewhere.
- Your browser must support the Side Panel API (Chrome 114+).
- Try reloading the extension in `chrome://extensions`, then refresh the X/Twitter tab. Tabs that were already open before installation may need a refresh.
- Try opening it from the extension popup's **Open Side Panel** button.

### Bookmarks are not detected

- Refresh the X/Twitter tab so the content script is injected.
- Verify the extension is enabled and has access to X/Twitter pages.
- Navipost relies on X/Twitter's DOM (`data-testid` selectors). If X changes its markup, detection can break — this is a known limitation (see [Limitations](overview.md#limitations)).

### A saved post is missing

- Account detection may have failed, placing data under the shared fallback namespace (see [Per-account isolation](overview/storage.md#per-account-isolation)).
- The post may have been removed by an unbookmark action on X/Twitter.

## Project structure

```
navipost/
├── background.ts          # Background service worker (message router, side panel control)
├── contents/
│   └── x-observer.ts      # Content script observing X/Twitter bookmark clicks
├── lib/
│   ├── storage.ts         # Storage layer (chrome.storage.local)
│   └── messaging.ts       # Runtime message helper
├── types/
│   └── navipost.ts        # Types, message contract, default storage
├── components/Icon.tsx    # Inline SVG icon component
├── utils/icon.ts          # Icon registry
├── popup.tsx              # Extension popup UI
├── sidepanel.tsx          # Side panel UI (main management interface)
└── style.css / tailwind.config.js / postcss.config.js
```

For architecture details, see [overview.md](overview.md), [overview/storage.md](overview/storage.md), and [overview/messaging.md](overview/messaging.md).
