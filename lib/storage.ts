import {
  DEFAULT_STORAGE,
  type Folder,
  type NavipostStorage,
  type ThemeMode,
  type Tweet,
  UNSORTED_FOLDER_ID,
  UNSORTED_FOLDER_NAME
} from "~/types/navipost"

const STORAGE_KEY = "navipost"

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

export const getStorage = async (): Promise<NavipostStorage> => {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return buildStorage(result[STORAGE_KEY])
}

export const setStorage = async (storage: NavipostStorage): Promise<NavipostStorage> => {
  const normalized = buildStorage(storage)
  await chrome.storage.local.set({ [STORAGE_KEY]: normalized })
  return normalized
}

export const initializeStorage = async (): Promise<NavipostStorage> => {
  const current = await chrome.storage.local.get(STORAGE_KEY)
  const initialized = buildStorage(current[STORAGE_KEY])
  await chrome.storage.local.set({ [STORAGE_KEY]: initialized })
  return initialized
}

export const addOrUpdateTweetInUnsorted = async (tweet: Tweet) => {
  const storage = await getStorage()
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

  return setStorage({ ...storage, folders })
}

export const removeTweetEverywhere = async (tweetId: string) => {
  const storage = await getStorage()
  const folders = storage.folders.map((folder) => ({
    ...folder,
    tweets: folder.tweets.filter((tweet) => tweet.id !== tweetId)
  }))
  return setStorage({ ...storage, folders })
}

export const assignTweetToFolder = async (tweetId: string, folderId: string) => {
  const storage = await getStorage()
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
    return setStorage({ ...storage, folders: cleanedFolders })
  }

  targetFolder.tweets.unshift(targetTweet)
  return setStorage({ ...storage, folders: cleanedFolders })
}

export const createFolder = async (name: string) => {
  const trimmed = name.trim()
  if (!trimmed) {
    return getStorage()
  }

  const storage = await getStorage()
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
  return setStorage({ ...storage, folders: [...storage.folders, folder] })
}

export const deleteFolder = async (folderId: string) => {
  if (folderId === UNSORTED_FOLDER_ID) {
    return getStorage()
  }

  const storage = await getStorage()
  const folder = storage.folders.find((item) => item.id === folderId)
  if (!folder) {
    return storage
  }

  const remainder = storage.folders.filter((item) => item.id !== folderId)
  if (storage.settings.folderDeleteBehavior === "delete_tweets") {
    return setStorage({ ...storage, folders: remainder })
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

  return setStorage({ ...storage, folders: remainder })
}

export const setAutoOpenSidePanel = async (enabled: boolean) => {
  const storage = await getStorage()
  return setStorage({
    ...storage,
    settings: {
      ...storage.settings,
      autoOpenSidePanel: enabled
    }
  })
}

export const setThemeMode = async (theme: ThemeMode) => {
  const storage = await getStorage()
  return setStorage({
    ...storage,
    settings: {
      ...storage.settings,
      theme
    }
  })
}
