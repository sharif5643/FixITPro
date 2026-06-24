'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

export interface ChatMessage {
  id:         string
  repairId:   string
  content:    string
  senderId:   string
  senderName: string
  createdAt:  string
  isOwn?:     boolean
}

interface UseRepairChatOptions {
  repairId: string
  currentUserId: string
}

export function useRepairChat({ repairId, currentUserId }: UseRepairChatOptions) {
  const socketRef = useRef<Socket | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1'
    // Socket.IO server URL — strip the /api/v1 path to get the base URL
    const serverUrl = apiBase.startsWith('http')
      ? apiBase.replace(/\/api\/v1$/, '')
      : ''   // empty = same origin

    const socket = io(`${serverUrl}/chat`, {
      withCredentials: true,   // send HttpOnly cookie for auth
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('join_room', { repairId })
    })

    socket.on('disconnect', () => setConnected(false))

    socket.on('new_message', (msg: Omit<ChatMessage, 'isOwn'>) => {
      setMessages((prev) => {
        // Skip if already present (optimistic duplicate)
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, { ...msg, isOwn: msg.senderId === currentUserId }]
      })
    })

    return () => {
      socket.emit('leave_room', { repairId })
      socket.disconnect()
      socketRef.current = null
    }
  }, [repairId, currentUserId])

  const sendMessage = useCallback((content: string) => {
    socketRef.current?.emit('send_message', { repairId, content })
  }, [repairId])

  return { messages, setMessages, connected, sendMessage }
}
