# Navipost Implementation Plan

This plan outlines the steps to build the Navipost Chrome extension using Plasmo, React, and Tailwind CSS.

## 1. Project Setup & Configuration

- [ ] **Initialize Plasmo**: Ensure the project is correctly configured for Plasmo with React.
- [ ] **Install Dependencies**: Add Tailwind CSS and necessary utility libraries.
  - `npm install -D tailwindcss postcss autoprefixer`
  - `npx tailwindcss init -p`
- [ ] **Configure Tailwind**: Set up `tailwind.config.js` and `postcss.config.js` to scan content scripts and side panel files.
- [ ] **Manifest Configuration**: Update `package.json` manifest fields for permissions and host permissions.
  - Permissions: `storage`, `sidePanel`, `tabs`, `scripting`.
  - Host Permissions: `https://x.com/*`, `https://twitter.com/*`.

## 2. Core Data Layer

- [ ] **Define Types (`src/types/index.ts`)**:
  - `Tweet`: Interface for tweet data (`id`, `handle`, `text`, `url`, `savedAt`).
  - `Folder`: Interface for folders (`id`, `name`, `tweets`).
  - `StorageSchema`: Interface for the storage object (`settings`, `folders`).
- [ ] **Storage Utility (`src/utils/storage.ts`)**:
  - `getStorage()`: Retrieve the entire storage object.
  - `setStorage(data)`: Save the storage object.
  - `addTweetToFolder(folderId, tweet)`: Helper to add a tweet.
  - `removeTweet(tweetId)`: Helper to remove a tweet.
  - `createFolder(name)`: Helper to create a new folder.
  - `deleteFolder(folderId)`: Helper to delete a folder.

## 3. Content Script (The "Observer")

- [ ] **Create `src/contents/twitter-observer.ts`**:
  - **Config**: Set `matches` to `["https://x.com/*", "https://twitter.com/*"]`.
  - **Event Listener**: Add a global click listener to `document.body`.
  - **Logic**:
    - Check if the target is `[data-testid="bookmark"]` or `[data-testid="removeBookmark"]`.
    - If "bookmark":
      - Scrape tweet data: `tweet_id`, `author_handle`, `content_text`, `timestamp`.
      - Send message `TWEET_BOOKMARKED` to background script.
    - If "removeBookmark":
      - Extract `tweet_id`.
      - Send message `TWEET_UNBOOKMARKED` to background script (or handle locally via storage).

## 4. Background Service Worker (The "Brain")

- [ ] **Create `src/background/index.ts`**:
  - **Lifecycle**: On `runtime.onInstalled`, initialize default storage structure if empty.
  - **Message Listener**:
    - Handle `TWEET_BOOKMARKED`:
      - Open the Side Panel using `chrome.sidePanel.open()` (requires user interaction or specific API usage).
      - Note: `sidePanel.open()` might require a user gesture or be triggered by the click in the content script.
    - Handle `TWEET_UNBOOKMARKED`:
      - Remove the tweet from storage.

## 5. Side Panel (The "Manager")

- [ ] **Create `src/sidepanel/index.tsx`**:
  - **UI Layout**:
    - Header: "Navipost" title and Search bar.
    - Content: Folder list (Accordion style).
    - Footer: "New Folder" button.
  - **Components**:
    - `FolderItem`: Displays folder name and tweet count.
    - `TweetCard`: Displays tweet summary within a folder.
    - `FolderList`: Manages the list of folders.
  - **State Management**:
    - Use `useStorage` hook from Plasmo or custom hook to sync with `chrome.storage.local`.
  - **Interactions**:
    - Drag and drop (optional for Phase 1).
    - Click to view tweet (opens in new tab).
    - Delete folder/tweet.

## 6. Popup (Optional/Minimal)

- [ ] **Update `src/popup.tsx`**:
  - Provide a simple button to open the Side Panel or link to settings.
  - Alternatively, redirect to the Side Panel if possible, or just show basic stats.

## 7. Verification & Polish

- [ ] **Testing**:
  - Verify bookmarking on X.com triggers the side panel (or updates storage).
  - Verify data persistence in `chrome.storage.local`.
  - Verify UI responsiveness.
- [ ] **Error Handling**:
  - Handle cases where DOM elements on X.com change (robust selectors).
  - Handle storage quota limits.

## Directory Structure

```
src/
  background/
    index.ts
  contents/
    twitter-observer.ts
  sidepanel/
    index.tsx
    components/
      FolderList.tsx
      TweetCard.tsx
  types/
    index.ts
  utils/
    storage.ts
  popup.tsx
```
