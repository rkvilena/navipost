import type { PlasmoCSConfig } from "plasmo"

import { sendRuntimeMessage } from "~/lib/messaging"
import type { NavipostMessage, Tweet } from "~/types/navipost"

export const config: PlasmoCSConfig = {
  matches: ["https://x.com/*", "https://twitter.com/*"]
}

const STATUS_URL_REGEX = /\/status\/(\d+)/

const getTweetIdFromTweetNode = (tweetNode: Element): string | null => {
  const link = tweetNode.querySelector<HTMLAnchorElement>('a[href*="/status/"]')
  if (!link?.href) {
    return null
  }

  const match = link.href.match(STATUS_URL_REGEX)
  return match?.[1] ?? null
}

const getTweetUrlFromTweetNode = (tweetNode: Element): string => {
  const link = tweetNode.querySelector<HTMLAnchorElement>('a[href*="/status/"]')
  return link?.href ?? window.location.href
}

const getHandleFromTweetNode = (tweetNode: Element): string => {
  const handleLink = Array.from(
    tweetNode.querySelectorAll<HTMLAnchorElement>('[data-testid="User-Name"] a')
  ).find((node) => node.textContent?.trim().startsWith("@"))

  if (handleLink?.textContent) {
    return handleLink.textContent.trim()
  }

  const fallbackHandle = tweetNode.querySelector('[data-testid="User-Name"] span:last-child')
  return fallbackHandle?.textContent?.trim() ?? "@unknown"
}

const getTextFromTweetNode = (tweetNode: Element): string => {
  const textNode = tweetNode.querySelector('[data-testid="tweetText"]')
  return textNode?.textContent?.trim() ?? ""
}

const scrapeTweetFromTarget = (target: HTMLElement): Tweet | null => {
  const tweetNode = target.closest('[data-testid="tweet"]')
  if (!tweetNode) {
    return null
  }

  const id = getTweetIdFromTweetNode(tweetNode)
  if (!id) {
    return null
  }

  return {
    id,
    handle: getHandleFromTweetNode(tweetNode),
    text: getTextFromTweetNode(tweetNode),
    url: getTweetUrlFromTweetNode(tweetNode),
    savedAt: Math.floor(Date.now() / 1000)
  }
}

const extractHandleFromText = (text?: string | null) => {
  if (!text) {
    return null
  }
  const match = text.match(/@([A-Za-z0-9_]{1,15})/)
  return match?.[1] ?? null
}

const getHandleFromProfileLink = () => {
  const link = document.querySelector<HTMLAnchorElement>(
    'a[data-testid="AppTabBar_Profile_Link"]'
  )
  if (!link?.href) {
    return null
  }
  try {
    const url = new URL(link.href)
    const segment = url.pathname.split("/").filter(Boolean)[0]
    return segment ? segment.replace(/^@/, "") : null
  } catch (error) {
    return null
  }
}

const getCurrentAccountHandle = () => {
  const switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')
  const fromSwitcher = extractHandleFromText(switcher?.textContent)
  if (fromSwitcher) {
    return fromSwitcher
  }
  return getHandleFromProfileLink()
}

const notifyObserverReady = async (ready: boolean, handle?: string | null) => {
  const message: NavipostMessage = {
    type: "OBSERVER_READY",
    payload: { ready, handle: handle ?? undefined }
  }
  await sendRuntimeMessage(message)
}

const handleDocumentClick = async (event: MouseEvent) => {
  const target = event.target as HTMLElement | null
  if (!target) {
    return
  }

  const bookmarkButton = target.closest('[data-testid="bookmark"]')
  if (bookmarkButton) {
    const tweet = scrapeTweetFromTarget(bookmarkButton as HTMLElement)
    if (!tweet) {
      return
    }

    const message: NavipostMessage = {
      type: "TWEET_BOOKMARKED",
      payload: { tweet }
    }
    await sendRuntimeMessage(message)
    return
  }

  const removeBookmarkButton = target.closest('[data-testid="removeBookmark"]')
  if (removeBookmarkButton) {
    const tweet = scrapeTweetFromTarget(removeBookmarkButton as HTMLElement)
    if (!tweet) {
      return
    }

    const message: NavipostMessage = {
      type: "TWEET_UNBOOKMARKED",
      payload: { tweetId: tweet.id }
    }
    await sendRuntimeMessage(message)
  }
}

document.addEventListener("click", handleDocumentClick, { capture: true })
let lastHandle = getCurrentAccountHandle()
notifyObserverReady(true, lastHandle)
setInterval(() => {
  const currentHandle = getCurrentAccountHandle()
  if (currentHandle && currentHandle !== lastHandle) {
    lastHandle = currentHandle
    notifyObserverReady(true, currentHandle)
  }
}, 3000)
window.addEventListener("pagehide", () => {
  notifyObserverReady(false)
})
