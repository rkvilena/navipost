import {
  DEFAULT_STORAGE,
  type Folder,
  type NavipostStorage,
  type ThemeMode,
  type Tweet,
  UNSORTED_FOLDER_ID,
  UNSORTED_FOLDER_NAME
} from "~/types/navipost"

const BASE_STORAGE_KEY = "navipost"

export const buildStorageKey = (handle?: string) => {
  if (!handle) {
    return BASE_STORAGE_KEY
  }
  const normalized = handle.startsWith("@") ? handle.slice(1) : handle
  return `${BASE_STORAGE_KEY}::${normalized}`
}

const cloneDefaultStorage = (): NavipostStorage =>
  JSON.parse(JSON.stringify(DEFAULT_STORAGE))

const buildStorage = (candidate: unknown): NavipostStorage => {
  if (!candidate || typeof candidate !== "object") {
    return cloneDefaultStorage()
  }

  const data = candidate as Partial<NavipostStorage>
  const settings = data.settings ?? DEFAULT_STORAGE.settings
  const folders = Array.isArray(data.folders) ? data.folders : []
  const normalizedFolders = folders.filter(
    (folder): folder is Folder =>
      Boolean(
        folder &&
          typeof folder.id === "string" &&
          typeof folder.name === "string" &&
          Array.isArray(folder.tweets)
      )
  )

  if (!normalizedFolders.some((folder) => folder.id === UNSORTED_FOLDER_ID)) {
    normalizedFolders.unshift({
      id: UNSORTED_FOLDER_ID,
      name: UNSORTED_FOLDER_NAME,
      tweets: []
    })
  }

  return {
    settings: {
      autoOpenSidePanel:
        typeof settings.autoOpenSidePanel === "boolean"
          ? settings.autoOpenSidePanel
          : DEFAULT_STORAGE.settings.autoOpenSidePanel,
      theme:
        settings.theme === "light" ||
        settings.theme === "dark" ||
        settings.theme === "system"
          ? settings.theme
          : DEFAULT_STORAGE.settings.theme,
      folderDeleteBehavior:
        settings.folderDeleteBehavior === "delete_tweets" ||
        settings.folderDeleteBehavior === "move_to_unsorted"
          ? settings.folderDeleteBehavior
          : DEFAULT_STORAGE.settings.folderDeleteBehavior
    },
    folders: normalizedFolders.map((folder) => ({
      ...folder,
      tweets: folder.tweets.filter(
        (tweet): tweet is Tweet =>
          Boolean(
            tweet &&
              typeof tweet.id === "string" &&
              typeof tweet.handle === "string" &&
              typeof tweet.text === "string" &&
              typeof tweet.url === "string" &&
              typeof tweet.savedAt === "number"
          )
      )
    }))
  }
}

const generateFolderId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return `folder-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

export const getStorage = async (
  storageKey: string = BASE_STORAGE_KEY
): Promise<NavipostStorage> => {
  const result = await chrome.storage.local.get(storageKey)
  return buildStorage(result[storageKey])
}

export const setStorage = async (
  storage: NavipostStorage,
  storageKey: string = BASE_STORAGE_KEY
): Promise<NavipostStorage> => {
  const normalized = buildStorage(storage)
  await chrome.storage.local.set({ [storageKey]: normalized })
  return normalized
}

export const initializeStorage = async (
  storageKey: string = BASE_STORAGE_KEY
): Promise<NavipostStorage> => {
  const current = await chrome.storage.local.get(storageKey)
  const initialized = buildStorage(current[storageKey])
  await chrome.storage.local.set({ [storageKey]: initialized })
  return initialized
}

export const addOrUpdateTweetInUnsorted = async (tweet: Tweet, storageKey?: string) => {
  const storage = await getStorage(storageKey)
  const folders = storage.folders.map((folder) => ({
    ...folder,
    tweets: folder.tweets.filter((item) => item.id !== tweet.id)
  }))
  const unsorted = folders.find((folder) => folder.id === UNSORTED_FOLDER_ID)

  if (!unsorted) {
    folders.unshift({
      id: UNSORTED_FOLDER_ID,
      name: UNSORTED_FOLDER_NAME,
      tweets: [tweet]
    })
  } else {
    unsorted.tweets.unshift(tweet)
  }

  return setStorage({ ...storage, folders }, storageKey)
}

export const removeTweetEverywhere = async (tweetId: string, storageKey?: string) => {
  const storage = await getStorage(storageKey)
  const folders = storage.folders.map((folder) => ({
    ...folder,
    tweets: folder.tweets.filter((tweet) => tweet.id !== tweetId)
  }))
  return setStorage({ ...storage, folders }, storageKey)
}

export const assignTweetToFolder = async (
  tweetId: string,
  folderId: string,
  storageKey?: string
) => {
  const storage = await getStorage(storageKey)
  let targetTweet: Tweet | null = null

  const cleanedFolders = storage.folders.map((folder) => {
    const found = folder.tweets.find((tweet) => tweet.id === tweetId)
    if (found) {
      targetTweet = found
    }
    return {
      ...folder,
      tweets: folder.tweets.filter((tweet) => tweet.id !== tweetId)
    }
  })

  if (!targetTweet) {
    return storage
  }

  const targetFolder = cleanedFolders.find((folder) => folder.id === folderId)
  if (!targetFolder) {
    const unsorted = cleanedFolders.find((folder) => folder.id === UNSORTED_FOLDER_ID)
    if (unsorted) {
      unsorted.tweets.unshift(targetTweet)
    }
    return setStorage({ ...storage, folders: cleanedFolders }, storageKey)
  }

  targetFolder.tweets.unshift(targetTweet)
  return setStorage({ ...storage, folders: cleanedFolders }, storageKey)
}

export const createFolder = async (name: string, storageKey?: string) => {
  const trimmed = name.trim()
  if (!trimmed) {
    return getStorage(storageKey)
  }

  const storage = await getStorage(storageKey)
  const exists = storage.folders.some(
    (folder) => folder.name.toLowerCase() === trimmed.toLowerCase()
  )
  if (exists) {
    return storage
  }

  const folder: Folder = {
    id: generateFolderId(),
    name: trimmed,
    tweets: []
  }
  return setStorage({ ...storage, folders: [...storage.folders, folder] }, storageKey)
}

export const deleteFolder = async (folderId: string, storageKey?: string) => {
  if (folderId === UNSORTED_FOLDER_ID) {
    return getStorage(storageKey)
  }

  const storage = await getStorage(storageKey)
  const folder = storage.folders.find((item) => item.id === folderId)
  if (!folder) {
    return storage
  }

  const remainder = storage.folders.filter((item) => item.id !== folderId)
  if (storage.settings.folderDeleteBehavior === "delete_tweets") {
    return setStorage({ ...storage, folders: remainder }, storageKey)
  }

  const unsorted = remainder.find((item) => item.id === UNSORTED_FOLDER_ID)
  if (unsorted) {
    unsorted.tweets = [...folder.tweets, ...unsorted.tweets]
  } else {
    remainder.unshift({
      id: UNSORTED_FOLDER_ID,
      name: UNSORTED_FOLDER_NAME,
      tweets: folder.tweets
    })
  }

  return setStorage({ ...storage, folders: remainder }, storageKey)
}

export const setAutoOpenSidePanel = async (enabled: boolean, storageKey?: string) => {
  const storage = await getStorage(storageKey)
  return setStorage({
    ...storage,
    settings: {
      ...storage.settings,
      autoOpenSidePanel: enabled
    }
  }, storageKey)
}

export const setThemeMode = async (theme: ThemeMode, storageKey?: string) => {
  const storage = await getStorage(storageKey)
  return setStorage({
    ...storage,
    settings: {
      ...storage.settings,
      theme
    }
  }, storageKey)
}
