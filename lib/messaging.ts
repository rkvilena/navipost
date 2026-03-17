import type { NavipostMessage } from "~/types/navipost"

export const sendRuntimeMessage = async <T = unknown>(message: NavipostMessage) => {
  try {
    return (await chrome.runtime.sendMessage(message)) as T
  } catch (error) {
    return null as T
  }
}
