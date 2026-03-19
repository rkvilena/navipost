import { useEffect, useMemo, useRef, useState } from "react"

import "~/style.css"

import type { NavipostMessage, NavipostStorage } from "~/types/navipost"

const emptyStorage: NavipostStorage = {
  settings: {
    autoOpenSidePanel: true,
    theme: "system",
    folderDeleteBehavior: "move_to_unsorted"
  },
  folders: []
}

function IndexPopup() {
  const [storage, setStorage] = useState<NavipostStorage>(emptyStorage)
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light")
  const [connectionStatus, setConnectionStatus] = useState<"ready" | "not-ready" | "not-x">(
    "not-ready"
  )
  const [activeHandle, setActiveHandle] = useState<string | null>(null)
  const connectionStatusRef = useRef(connectionStatus)
  const activeHandleRef = useRef(activeHandle)

  const stats = useMemo(() => {
    const folderCount = storage.folders.length
    const tweetCount = storage.folders.reduce(
      (accumulator, folder) => accumulator + folder.tweets.length,
      0
    )
    return { folderCount, tweetCount }
  }, [storage])
  const resolvedTheme = storage.settings.theme === "system" ? systemTheme : storage.settings.theme
  const isDark = resolvedTheme === "dark"

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

  const loadStorage = async () => {
    const response = await chrome.runtime.sendMessage({
      type: "GET_STORAGE"
    } as NavipostMessage)

    if (response?.ok && response.storage) {
      setStorage(response.storage)
    }
  }

  useEffect(() => {
    loadStorage()
  }, [])

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
      if (!isXUrl(tab.url)) {
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
      const nextStatus = response.ready ? "ready" : "not-ready"
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

  const openSidePanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
      return
    }
    if (!isXUrl(tab.url)) {
      setConnectionStatus("not-x")
      return
    }
    await chrome.sidePanel.open({ tabId: tab.id })
  }

  return (
    <div className={`w-[320px] p-4 ${isDark ? "bg-slate-900 text-slate-100" : "bg-slate-50"}`}>
      <div className="mb-3 flex items-center justify-between">
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
      <div
        className={`mb-3 rounded-sm border p-3 ${
          isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"
        }`}>
        <div className={isDark ? "text-sm text-slate-400" : "text-sm text-slate-600"}>Folders</div>
        <div className={isDark ? "text-xl font-semibold text-slate-100" : "text-xl font-semibold text-slate-900"}>
          {stats.folderCount}
        </div>
      </div>
      <div
        className={`mb-4 rounded-sm border p-3 ${
          isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"
        }`}>
        <div className={isDark ? "text-sm text-slate-400" : "text-sm text-slate-600"}>
          Saved posts
        </div>
        <div className={isDark ? "text-xl font-semibold text-slate-100" : "text-xl font-semibold text-slate-900"}>
          {stats.tweetCount}
        </div>
      </div>
      <button
        className="w-full rounded-sm bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        onClick={openSidePanel}>
        Open Side Panel
      </button>
    </div>
  )
}

export default IndexPopup
