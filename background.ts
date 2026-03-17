import {
  addOrUpdateTweetInUnsorted,
  assignTweetToFolder,
  createFolder,
  deleteFolder,
  getStorage,
  initializeStorage,
  removeTweetEverywhere,
  setAutoOpenSidePanel,
  setThemeMode
} from "~/lib/storage"
import type { NavipostMessage } from "~/types/navipost"

const broadcastStorageUpdated = async () => {
  const storage = await getStorage()
  try {
    await chrome.runtime.sendMessage({
      type: "STORAGE_UPDATED",
      payload: storage
    } as NavipostMessage)
  } catch (error) {
    return
  }
}

const openSidePanelIfNeeded = async (tabId?: number) => {
  if (typeof tabId !== "number") {
    tabId = Number(tabId)
  }

  const storage = await getStorage()
  if (!storage.settings.autoOpenSidePanel) {
    return
  }

  await chrome.sidePanel.open({ tabId })
}

chrome.runtime.onInstalled.addListener(async () => {
  await initializeStorage()
})

chrome.runtime.onMessage.addListener((message: NavipostMessage, sender, sendResponse) => {
  const run = async () => {
    switch (message.type) {
      case "TWEET_BOOKMARKED": {
        await addOrUpdateTweetInUnsorted(message.payload.tweet)
        await broadcastStorageUpdated()
        try {
          await openSidePanelIfNeeded(sender.tab?.id)
        } catch (error) {
          undefined
        }
        sendResponse({ ok: true })
        return
      }
      case "TWEET_UNBOOKMARKED": {
        await removeTweetEverywhere(message.payload.tweetId)
        await broadcastStorageUpdated()
        sendResponse({ ok: true })
        return
      }
      case "ASSIGN_TWEET_TO_FOLDER": {
        await assignTweetToFolder(message.payload.tweetId, message.payload.folderId)
        await broadcastStorageUpdated()
        sendResponse({ ok: true })
        return
      }
      case "CREATE_FOLDER": {
        const storage = await createFolder(message.payload.name)
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
        await deleteFolder(message.payload.folderId)
        await broadcastStorageUpdated()
        sendResponse({ ok: true })
        return
      }
      case "TOGGLE_AUTO_OPEN_SIDE_PANEL": {
        await setAutoOpenSidePanel(message.payload.enabled)
        await broadcastStorageUpdated()
        sendResponse({ ok: true })
        return
      }
      case "SET_THEME_MODE": {
        await setThemeMode(message.payload.theme)
        await broadcastStorageUpdated()
        sendResponse({ ok: true })
        return
      }
      case "GET_STORAGE": {
        const storage = await getStorage()
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
