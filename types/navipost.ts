export type ThemeMode = "light" | "dark" | "system"
export type FolderDeleteBehavior = "move_to_unsorted" | "delete_tweets"

export interface Tweet {
  id: string
  handle: string
  text: string
  url: string
  savedAt: number
}

export interface Folder {
  id: string
  name: string
  tweets: Tweet[]
}

export interface NavipostSettings {
  autoOpenSidePanel: boolean
  theme: ThemeMode
  folderDeleteBehavior: FolderDeleteBehavior
}

export interface NavipostStorage {
  settings: NavipostSettings
  folders: Folder[]
}

export interface BookmarkPayload {
  tweet: Tweet
}

export interface UnbookmarkPayload {
  tweetId: string
}

export interface AssignTweetPayload {
  tweetId: string
  folderId: string
}

export interface CreateFolderPayload {
  name: string
}

export interface DeleteFolderPayload {
  folderId: string
}

export interface ToggleAutoOpenPayload {
  enabled: boolean
}

export interface SetThemeModePayload {
  theme: ThemeMode
}

export interface ObserverReadyPayload {
  ready: boolean
  handle?: string
}

export interface GetObserverStatusPayload {
  tabId: number
}

export type NavipostMessage =
  | { type: "TWEET_BOOKMARKED"; payload: BookmarkPayload }
  | { type: "TWEET_UNBOOKMARKED"; payload: UnbookmarkPayload }
  | { type: "ASSIGN_TWEET_TO_FOLDER"; payload: AssignTweetPayload }
  | { type: "CREATE_FOLDER"; payload: CreateFolderPayload }
  | { type: "DELETE_FOLDER"; payload: DeleteFolderPayload }
  | { type: "TOGGLE_AUTO_OPEN_SIDE_PANEL"; payload: ToggleAutoOpenPayload }
  | { type: "SET_THEME_MODE"; payload: SetThemeModePayload }
  | { type: "OBSERVER_READY"; payload: ObserverReadyPayload }
  | { type: "GET_OBSERVER_STATUS"; payload: GetObserverStatusPayload }
  | { type: "GET_STORAGE" }
  | { type: "STORAGE_UPDATED"; payload: NavipostStorage }

export const UNSORTED_FOLDER_ID = "unsorted"
export const UNSORTED_FOLDER_NAME = "General / Unsorted"

export const DEFAULT_STORAGE: NavipostStorage = {
  settings: {
    autoOpenSidePanel: true,
    theme: "system",
    folderDeleteBehavior: "move_to_unsorted"
  },
  folders: [
    {
      id: UNSORTED_FOLDER_ID,
      name: UNSORTED_FOLDER_NAME,
      tweets: []
    }
  ]
}
