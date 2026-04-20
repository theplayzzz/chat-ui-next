/**
 * Stream processor for the Claude Agent (Docker) route.
 *
 * The upstream stream can contain, in order:
 *   1. Thinking text (intermediate model outputs + tool_use status lines)
 *   2. A FINAL_MARKER (3×U+001E Record Separator)
 *   3. The canonical final answer
 *
 * While thinking is streaming, chunks are appended to the bubble so the user
 * sees the model working. When the marker is detected, the accumulated text is
 * wiped and only what comes after the marker is rendered as the final answer.
 *
 * Safety: if the marker never arrives (e.g. Docker crash), whatever was
 * streamed remains visible — the final answer is NOT lost.
 */

import { consumeReadableStream } from "@/lib/consume-stream"
import { ChatMessage } from "@/types"
import React from "react"

const FINAL_MARKER = "\u001e\u001e\u001e"

export const processClaudeAgentResponse = async (
  response: Response,
  lastChatMessage: ChatMessage,
  controller: AbortController,
  setFirstTokenReceived: React.Dispatch<React.SetStateAction<boolean>>,
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setToolInUse: React.Dispatch<React.SetStateAction<string>>
) => {
  if (!response.body) {
    throw new Error("Response body is null")
  }

  // U+2060 (WORD JOINER) is the invisible heartbeat byte emitted by the server
  // to keep the connection alive. Strip it from all rendered text.
  const HEARTBEAT = "\u2060"

  // Buffer to detect the marker even when split across chunks.
  let pendingBuffer = ""
  let fullText = ""
  let markerSeen = false

  const updateBubble = (content: string) => {
    setChatMessages(prev =>
      prev.map(chatMessage => {
        if (chatMessage.message.id === lastChatMessage.message.id) {
          return {
            message: { ...chatMessage.message, content },
            fileItems: chatMessage.fileItems
          }
        }
        return chatMessage
      })
    )
  }

  await consumeReadableStream(
    response.body,
    chunk => {
      setFirstTokenReceived(true)
      setToolInUse("none")

      // Strip heartbeat bytes (invisible U+2060 emitted every 15s)
      const clean = chunk.split(HEARTBEAT).join("")
      if (!clean) return

      if (markerSeen) {
        // Already past the marker — everything is final answer
        fullText += clean
        updateBubble(fullText)
        return
      }

      // Combine with pending buffer to catch marker spanning chunks
      pendingBuffer += clean
      const markerIdx = pendingBuffer.indexOf(FINAL_MARKER)

      if (markerIdx === -1) {
        // No marker yet — everything is thinking.
        // Only flush safe portion (keep last 2 chars in case marker starts there)
        const safeLen = Math.max(
          0,
          pendingBuffer.length - FINAL_MARKER.length + 1
        )
        if (safeLen > 0) {
          fullText += pendingBuffer.slice(0, safeLen)
          pendingBuffer = pendingBuffer.slice(safeLen)
          updateBubble(fullText)
        }
      } else {
        // Marker found — discard thinking, start final answer fresh
        markerSeen = true
        const afterMarker = pendingBuffer.slice(markerIdx + FINAL_MARKER.length)
        fullText = afterMarker
        pendingBuffer = ""
        updateBubble(fullText)
      }
    },
    controller.signal
  )

  // Flush any remaining buffer (no marker ever arrived — treat as full answer)
  if (!markerSeen && pendingBuffer) {
    fullText += pendingBuffer
    updateBubble(fullText)
  }

  return fullText
}
