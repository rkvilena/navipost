import { useEffect, useMemo, useState } from "react"

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

  useEffect(() => {
    const loadStorage = async () => {
      const response = await chrome.runtime.sendMessage({
        type: "GET_STORAGE"
      } as NavipostMessage)

      if (response?.ok && response.storage) {
        setStorage(response.storage)
      }
    }

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

  const openSidePanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
      return
    }
    await chrome.sidePanel.open({ tabId: tab.id })
  }

  return (
    <div className={`w-[320px] p-4 ${isDark ? "bg-slate-900 text-slate-100" : "bg-slate-50"}`}>
      <h1 className="mb-3 text-lg font-semibold">Navipost</h1>
      <div
        className={`mb-3 rounded-lg border p-3 ${
          isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"
        }`}>
        <div className={isDark ? "text-sm text-slate-400" : "text-sm text-slate-600"}>Folders</div>
        <div className={isDark ? "text-xl font-semibold text-slate-100" : "text-xl font-semibold text-slate-900"}>
          {stats.folderCount}
        </div>
      </div>
      <div
        className={`mb-4 rounded-lg border p-3 ${
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
        className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        onClick={openSidePanel}>
        Open Side Panel
      </button>
    </div>
  )
}

export default IndexPopup
