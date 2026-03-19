import {
  addOrUpdateTweetInUnsorted,
  assignTweetToFolder,
  buildStorageKey,
  createFolder,
  deleteFolder,
  getStorage,
  initializeStorage,
  removeTweetEverywhere,
  setAutoOpenSidePanel,
  setThemeMode
} from "~/lib/storage"
import type { NavipostMessage } from "~/types/navipost"

const observerStateByTab = new Map<number, { ready: boolean; handle?: string }>()

const isXUrl = (url?: string): boolean => {
  if (!url) {
    return false
  }

  try {
    const parsed = new URL(url)
    return (
      parsed.hostname === "x.com" ||
      parsed.hostname.endsWith(".x.com") ||
      parsed.hostname === "twitter.com" ||
      parsed.hostname.endsWith(".twitter.com")
    )
  } catch (error) {
    return false
  }
}

const broadcastStorageUpdated = async (storage: Awaited<ReturnType<typeof getStorage>>) => {
  try {
    await chrome.runtime.sendMessage({
      type: "STORAGE_UPDATED",
      payload: storage
    } as NavipostMessage)
  } catch (error) {
    return
  }
}

const syncSidePanelForTab = async (tabId: number, url?: string) => {
  const enabled = isXUrl(url)
  await chrome.sidePanel.setOptions({
    tabId,
    enabled,
    path: enabled ? "sidepanel.html" : undefined
  })
  if (!enabled) {
    observerStateByTab.delete(tabId)
  }
}

const syncActiveTabSidePanel = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    return
  }
  await syncSidePanelForTab(tab.id, tab.url)
}

const resolveStorageKey = async (tabId?: number) => {
  if (typeof tabId === "number") {
    const handle = observerStateByTab.get(tabId)?.handle
    if (handle) {
      return buildStorageKey(handle)
    }
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const activeHandle = tab?.id ? observerStateByTab.get(tab.id)?.handle : undefined
  return buildStorageKey(activeHandle)
}

const openSidePanelIfNeeded = async (tabId?: number) => {
  if (typeof tabId !== "number") {
    tabId = Number(tabId)
  }

  const tab = await chrome.tabs.get(tabId)
  if (!isXUrl(tab.url)) {
    return
  }

  const storageKey = await resolveStorageKey(tabId)
  const storage = await getStorage(storageKey)
  if (!storage.settings.autoOpenSidePanel) {
    return
  }

  await chrome.sidePanel.open({ tabId })
}

chrome.runtime.onInstalled.addListener(async () => {
  await initializeStorage()
  await syncActiveTabSidePanel()
})

chrome.runtime.onStartup.addListener(async () => {
  await syncActiveTabSidePanel()
})

chrome.runtime.onMessage.addListener((message: NavipostMessage, sender, sendResponse) => {
  const run = async () => {
    switch (message.type) {
      case "TWEET_BOOKMARKED": {
        const storageKey = await resolveStorageKey(sender.tab?.id)
        const storage = await addOrUpdateTweetInUnsorted(message.payload.tweet, storageKey)
        await broadcastStorageUpdated(storage)
        try {
          await openSidePanelIfNeeded(sender.tab?.id)
        } catch (error) {
          undefined
        }
        sendResponse({ ok: true })
        return
      }
      case "TWEET_UNBOOKMARKED": {
        const storageKey = await resolveStorageKey(sender.tab?.id)
        const storage = await removeTweetEverywhere(message.payload.tweetId, storageKey)
        await broadcastStorageUpdated(storage)
        sendResponse({ ok: true })
        return
      }
      case "ASSIGN_TWEET_TO_FOLDER": {
        const storageKey = await resolveStorageKey(sender.tab?.id)
        const storage = await assignTweetToFolder(
          message.payload.tweetId,
          message.payload.folderId,
          storageKey
        )
        await broadcastStorageUpdated(storage)
        sendResponse({ ok: true })
        return
      }
      case "CREATE_FOLDER": {
        const storageKey = await resolveStorageKey(sender.tab?.id)
        const storage = await createFolder(message.payload.name, storageKey)
        try {
          await chrome.runtime.sendMessage({
            type: "STORAGE_UPDATED",
            payload: storage
          } as NavipostMessage)
        } catch (error) {
          undefined
        }
        sendResponse({ ok: true })
        return
      }
      case "DELETE_FOLDER": {
        const storageKey = await resolveStorageKey(sender.tab?.id)
        const storage = await deleteFolder(message.payload.folderId, storageKey)
        await broadcastStorageUpdated(storage)
        sendResponse({ ok: true })
        return
      }
      case "TOGGLE_AUTO_OPEN_SIDE_PANEL": {
        const storageKey = await resolveStorageKey(sender.tab?.id)
        const storage = await setAutoOpenSidePanel(message.payload.enabled, storageKey)
        await broadcastStorageUpdated(storage)
        sendResponse({ ok: true })
        return
      }
      case "SET_THEME_MODE": {
        const storageKey = await resolveStorageKey(sender.tab?.id)
        const storage = await setThemeMode(message.payload.theme, storageKey)
        await broadcastStorageUpdated(storage)
        sendResponse({ ok: true })
        return
      }
      case "OBSERVER_READY": {
        const tabId = sender.tab?.id
        if (typeof tabId === "number") {
          if (message.payload.ready) {
            observerStateByTab.set(tabId, {
              ready: true,
              handle: message.payload.handle
            })
          } else {
            observerStateByTab.delete(tabId)
          }
          sendResponse({ ok: true })
          return
        }
        sendResponse({ ok: false })
        return
      }
      case "GET_OBSERVER_STATUS": {
        const tabId = message.payload.tabId
        const tab = await chrome.tabs.get(tabId)
        sendResponse({
          ok: true,
          ready: observerStateByTab.get(tabId)?.ready ?? false,
          isX: isXUrl(tab.url),
          handle: observerStateByTab.get(tabId)?.handle
        })
        return
      }
      case "GET_STORAGE": {
        const storageKey = await resolveStorageKey(sender.tab?.id)
        const storage = await getStorage(storageKey)
        sendResponse({ ok: true, storage })
        return
      }
      default: {
        sendResponse({ ok: false })
      }
    }
  }

  run().catch(() => sendResponse({ ok: false }))
  return true
})

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId)
  await syncSidePanelForTab(tabId, tab.url)
})

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    await syncSidePanelForTab(tabId, changeInfo.url)
    return
  }
  if (changeInfo.status === "complete") {
    await syncSidePanelForTab(tabId, tab.url)
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  observerStateByTab.delete(tabId)
})

chrome.windows.onFocusChanged.addListener(async () => {
  await syncActiveTabSidePanel()
})
