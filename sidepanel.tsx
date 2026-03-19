import { useEffect, useMemo, useRef, useState } from "react"

import Icon from "~/components/Icon"
import "~/style.css"

import {
  DEFAULT_STORAGE,
  type Folder,
  type NavipostMessage,
  type NavipostStorage,
  type ThemeMode,
  type Tweet,
  UNSORTED_FOLDER_ID
} from "~/types/navipost"

interface StorageResponse {
  ok: boolean
  storage?: NavipostStorage
}

type ConnectionStatus = "ready" | "not-ready" | "not-x"

const findFolderForTweet = (folders: Folder[], tweetId: string) =>
  folders.find((folder) => folder.tweets.some((tweet) => tweet.id === tweetId))

const getSystemTheme = (): "light" | "dark" => {
  if (typeof window === "undefined") {
    return "light"
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function SidePanel() {
  const [storage, setStorage] = useState<NavipostStorage>(DEFAULT_STORAGE)
  const [search, setSearch] = useState("")
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [folderName, setFolderName] = useState("")
  const [pendingTweetId, setPendingTweetId] = useState<string | null>(null)
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(getSystemTheme())
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("not-ready")
  const [activeHandle, setActiveHandle] = useState<string | null>(null)
  const connectionStatusRef = useRef(connectionStatus)
  const activeHandleRef = useRef(activeHandle)

  const folders = storage.folders
  const resolvedTheme = storage.settings.theme === "system" ? systemTheme : storage.settings.theme
  const isDark = resolvedTheme === "dark"
  const folderOptions = useMemo(
    () => folders.map((folder) => ({ id: folder.id, name: folder.name })),
    [folders]
  )

  const filteredFolders = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) {
      return folders
    }

    return folders
      .map((folder) => ({
        ...folder,
        tweets: folder.tweets.filter((tweet) => {
          const haystack = `${tweet.handle} ${tweet.text}`.toLowerCase()
          return haystack.includes(keyword)
        })
      }))
      .filter((folder) => folder.tweets.length > 0 || folder.name.toLowerCase().includes(keyword))
  }, [folders, search])

  const loadStorage = async () => {
    const response = (await chrome.runtime.sendMessage({
      type: "GET_STORAGE"
    } as NavipostMessage)) as StorageResponse

    if (!response?.ok || !response.storage) {
      return
    }

    setStorage(response.storage)
    const unsorted = response.storage.folders.find((folder) => folder.id === UNSORTED_FOLDER_ID)
    if (unsorted?.tweets[0]) {
      setPendingTweetId(unsorted.tweets[0].id)
    }
  }

  useEffect(() => {
    loadStorage()
  }, [])

  useEffect(() => {
    const listener = (message: NavipostMessage) => {
      if (message.type === "TWEET_BOOKMARKED") {
        setPendingTweetId(message.payload.tweet.id)
        return
      }

      if (message.type !== "STORAGE_UPDATED") {
        return
      }

      setStorage(message.payload)
      const unsorted = message.payload.folders.find(
        (folder) => folder.id === UNSORTED_FOLDER_ID
      )
      if (!pendingTweetId && unsorted?.tweets[0]) {
        setPendingTweetId(unsorted.tweets[0].id)
      }
      if (pendingTweetId) {
        const activeFolder = findFolderForTweet(message.payload.folders, pendingTweetId)
        if (activeFolder && activeFolder.id !== UNSORTED_FOLDER_ID) {
          setPendingTweetId(null)
        }
      }
    }

    chrome.runtime.onMessage.addListener(listener)
    return () => {
      chrome.runtime.onMessage.removeListener(listener)
    }
  }, [pendingTweetId])

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setSystemTheme(media.matches ? "dark" : "light")
    onChange()
    media.addEventListener("change", onChange)
    return () => {
      media.removeEventListener("change", onChange)
    }
  }, [])

  useEffect(() => {
    connectionStatusRef.current = connectionStatus
  }, [connectionStatus])

  useEffect(() => {
    activeHandleRef.current = activeHandle
  }, [activeHandle])

  useEffect(() => {
    const refreshConnectionStatus = async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) {
        setConnectionStatus("not-x")
        return
      }

      const response = await chrome.runtime.sendMessage({
        type: "GET_OBSERVER_STATUS",
        payload: { tabId: tab.id }
      } as NavipostMessage)

      if (!response?.ok) {
        setConnectionStatus("not-ready")
        return
      }

      if (!response.isX) {
        setConnectionStatus("not-x")
        return
      }

      const nextStatus: ConnectionStatus = response.ready ? "ready" : "not-ready"
      setConnectionStatus(nextStatus)
      const nextHandle = response.handle ?? null
      if (nextHandle && nextHandle !== activeHandleRef.current) {
        setActiveHandle(nextHandle)
        if (response.ready) {
          await loadStorage()
        }
        return
      }
      if (nextStatus === "ready" && connectionStatusRef.current !== "ready") {
        await loadStorage()
      }
    }

    refreshConnectionStatus()
    const intervalId = window.setInterval(refreshConnectionStatus, 2000)
    const onActivated = () => {
      refreshConnectionStatus()
    }
    const onUpdated = () => {
      refreshConnectionStatus()
    }

    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onUpdated.addListener(onUpdated)

    return () => {
      window.clearInterval(intervalId)
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onUpdated.removeListener(onUpdated)
    }
  }, [])

  useEffect(() => {
    if (connectionStatus === "not-x") {
      window.close()
    }
  }, [connectionStatus])

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }))
  }

  const onCreateFolder = async () => {
    const name = folderName.trim()
    if (!name) {
      return
    }

    await chrome.runtime.sendMessage({
      type: "CREATE_FOLDER",
      payload: { name }
    } as NavipostMessage)
    setFolderName("")
  }

  const onDeleteFolder = async (folderId: string) => {
    await chrome.runtime.sendMessage({
      type: "DELETE_FOLDER",
      payload: { folderId }
    } as NavipostMessage)
  }

  const onAssignTweet = async (tweetId: string, folderId: string) => {
    await chrome.runtime.sendMessage({
      type: "ASSIGN_TWEET_TO_FOLDER",
      payload: { tweetId, folderId }
    } as NavipostMessage)
  }

  const onToggleAutoOpen = async () => {
    await chrome.runtime.sendMessage({
      type: "TOGGLE_AUTO_OPEN_SIDE_PANEL",
      payload: { enabled: !storage.settings.autoOpenSidePanel }
    } as NavipostMessage)
  }

  const onToggleTheme = async () => {
    const nextTheme: ThemeMode = resolvedTheme === "dark" ? "light" : "dark"
    await chrome.runtime.sendMessage({
      type: "SET_THEME_MODE",
      payload: { theme: nextTheme }
    } as NavipostMessage)
  }

  return (
    <main
      className={`min-h-screen min-w-[400px] p-4 ${
        isDark ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"
      }`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Navipost</h1>
          <div
            className={`flex items-center gap-2 rounded-sm border px-2 py-1 text-xs ${
              isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"
            }`}>
            <span
              className={`h-2 w-2 rounded-full ${
                connectionStatus === "ready"
                  ? "bg-emerald-500"
                  : connectionStatus === "not-x"
                    ? "bg-amber-400"
                    : "bg-amber-400"
              }`}
            />
            <span className={isDark ? "text-slate-200" : "text-slate-700"}>
              {connectionStatus === "ready"
                ? "Ready"
                : connectionStatus === "not-x"
                  ? "Open X"
                  : "Not Ready"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            className={`rounded-sm border p-2 hover:opacity-90 ${
              isDark
                ? "border-slate-600 bg-slate-800 text-slate-200"
                : "border-slate-300 bg-white text-slate-700"
            }`}
            onClick={onToggleTheme}>
            <Icon name={resolvedTheme === "dark" ? "sun" : "moon"} size={14} />
          </button>
          <button
            className={`rounded-sm border px-3 py-1 text-xs font-medium ${
              isDark
                ? "border-slate-600 bg-slate-800 hover:bg-slate-700"
                : "border-slate-300 bg-white hover:bg-slate-100"
            }`}
            onClick={onToggleAutoOpen}>
            Auto Open: {storage.settings.autoOpenSidePanel ? "On" : "Off"}
          </button>
        </div>
      </div>

      <input
        className={`mb-3 w-full rounded-sm border px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 ${
          isDark
            ? "border-slate-600 bg-slate-800 text-slate-100 placeholder:text-slate-400"
            : "border-slate-300 bg-white"
        }`}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by handle or text"
        value={search}
      />

      <div className="mb-4 flex items-center gap-2">
        <input
          className={`w-full rounded-sm border px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 ${
            isDark
              ? "border-slate-600 bg-slate-800 text-slate-100 placeholder:text-slate-400"
              : "border-slate-300 bg-white"
          }`}
          onChange={(event) => setFolderName(event.target.value)}
          placeholder="New folder name"
          value={folderName}
        />
        <button
          aria-label="Add folder"
          className="rounded-sm bg-blue-600 p-2 text-white hover:bg-blue-700"
          onClick={onCreateFolder}>
          <Icon name="plus" size={18} />
        </button>
      </div>

      <section className="space-y-2">
        {filteredFolders.map((folder) => {
          const isExpanded = expandedFolders[folder.id] ?? true
          return (
            <article
              className={`overflow-hidden rounded-sm border ${
                isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"
              }`}
              key={folder.id}>
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <button
                  className="flex-1 text-left text-sm font-semibold"
                  onClick={() => toggleFolder(folder.id)}>
                  {folder.name} ({folder.tweets.length})
                </button>
                {folder.id !== UNSORTED_FOLDER_ID ? (
                  <button
                    aria-label={`Delete ${folder.name}`}
                    className={`flex items-center justify-center rounded-sm p-1 ${
                      isDark ? "text-red-300 hover:bg-red-900/40" : "text-red-600 hover:bg-red-50"
                    }`}
                    onClick={() => onDeleteFolder(folder.id)}>
                    <Icon name="trash" size={20} />
                  </button>
                ) : null}
              </div>
              {isExpanded ? (
                <div
                  className={`space-y-2 border-t p-3 ${
                    isDark ? "border-slate-700 bg-slate-900" : "border-slate-100 bg-slate-50"
                  }`}>
                  {folder.tweets.length === 0 ? (
                    <div
                      className={`rounded-sm px-3 py-2 text-xs ${
                        isDark ? "bg-slate-800 text-slate-400" : "bg-white text-slate-500"
                      }`}>
                      No posts in this folder
                    </div>
                  ) : (
                    folder.tweets.map((tweet) => (
                      <TweetCard
                        folderId={folder.id}
                        folderOptions={folderOptions}
                        key={tweet.id}
                        onAssignTweet={onAssignTweet}
                        isDark={isDark}
                        pending={pendingTweetId === tweet.id}
                        tweet={tweet}
                      />
                    ))
                  )}
                </div>
              ) : null}
            </article>
          )
        })}
      </section>
    </main>
  )
}

interface TweetCardProps {
  tweet: Tweet
  folderOptions: Array<{ id: string; name: string }>
  folderId: string
  isDark: boolean
  pending: boolean
  onAssignTweet: (tweetId: string, folderId: string) => Promise<void>
}

const TweetCard = ({
  tweet,
  folderOptions,
  folderId,
  isDark,
  pending,
  onAssignTweet
}: TweetCardProps) => {
  const snippet = tweet.text.length > 120 ? `${tweet.text.slice(0, 117)}...` : tweet.text

  return (
    <div
      className={`rounded-sm border p-3 ${
        pending
          ? "border-blue-500 ring-2 ring-blue-200"
          : isDark
            ? "border-slate-700"
            : "border-slate-200"
      } ${isDark ? "bg-slate-800" : "bg-white"} ${
        isDark && pending ? "ring-blue-900/60" : ""
      }`}>
      <a
        className={`mb-1 block text-xs font-semibold hover:underline ${
          isDark ? "text-blue-300" : "text-blue-700"
        }`}
        href={tweet.url}
        rel="noreferrer"
        target="_blank">
        {tweet.handle}
      </a>
      <p className={`mb-2 text-xs ${isDark ? "text-slate-300" : "text-slate-700"}`}>
        {snippet || "(no text)"}
      </p>
      <select
        className={`w-full rounded-sm border px-2 py-1 text-xs ${
          isDark
            ? "border-slate-600 bg-slate-900 text-slate-100"
            : "border-slate-300 bg-white text-slate-900"
        }`}
        onChange={(event) => onAssignTweet(tweet.id, event.target.value)}
        value={folderId}>
        {folderOptions.map((option) => (
          <option key={option.id} value={option.id}>
            Move to {option.name}
          </option>
        ))}
      </select>
    </div>
  )
}

export default SidePanel
