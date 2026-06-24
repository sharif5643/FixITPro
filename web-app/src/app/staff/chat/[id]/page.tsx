'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Send, Loader2, Wrench, Wifi, WifiOff } from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { useAuthStore } from '@/store/auth.store'
import { useRepairChat, type ChatMessage } from '@/hooks/use-repair-chat'
import api from '@/lib/api'
import { toast } from 'sonner'

export default function StaffChatPage() {
  const router = useRouter()
  const { id: repairId } = useParams<{ id: string }>()
  const user = useAuthStore((s) => s.user)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { messages, setMessages, connected, sendMessage } = useRepairChat({
    repairId,
    currentUserId: user?.id ?? '',
  })

  // Load message history once on mount
  useEffect(() => {
    api.get(`/repairs/${repairId}/messages`)
      .then((res) => {
        const history: ChatMessage[] = (res.data ?? []).map((m: any) => ({
          id:         m.id,
          repairId:   m.repairId,
          content:    m.content,
          senderId:   m.senderId,
          senderName: m.sender?.name ?? m.senderName ?? '',
          createdAt:  m.createdAt,
          isOwn:      m.senderId === user?.id,
        }))
        setMessages(history)
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repairId, user?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: historyLoaded ? 'smooth' : 'instant' })
  }, [messages, historyLoaded])

  async function handleSend() {
    if (!text.trim() || sending) return
    const content = text.trim()
    setText('')
    setSending(true)

    // Optimistic bubble
    const optimistic: ChatMessage = {
      id:         `opt-${Date.now()}`,
      repairId,
      content,
      senderId:   user?.id ?? '',
      senderName: user?.name ?? '',
      createdAt:  new Date().toISOString(),
      isOwn:      true,
    }
    setMessages((prev) => [...prev, optimistic])

    try {
      sendMessage(content)
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      toast.error('ส่งข้อความไม่สำเร็จ')
      setText(content)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Header */}
      <div className="flex items-center gap-3 bg-white px-5 pt-12 pb-4 shadow-[0_1px_0_rgba(0,0,0,0.06)] flex-shrink-0">
        <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-yellow">
          <Wrench className="h-4 w-4 text-brand-black" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-brand-black">แชทกับช่าง</p>
          <p className="text-xs text-slate-400 font-mono">{repairId?.slice(0, 8)}</p>
        </div>
        {/* Connection status */}
        <div className={`flex items-center gap-1 ${connected ? 'text-green-500' : 'text-slate-300'}`}>
          {connected
            ? <Wifi className="h-4 w-4" />
            : <WifiOff className="h-4 w-4" />
          }
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {!historyLoaded ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-brand-yellow" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <p className="text-sm text-slate-400">ยังไม่มีข้อความ</p>
            <p className="text-xs text-slate-300">เริ่มสนทนากับช่างได้เลย</p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.isOwn ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                m.isOwn
                  ? 'bg-brand-yellow rounded-br-sm'
                  : 'bg-white shadow-card rounded-bl-sm'
              } ${m.id.startsWith('opt-') ? 'opacity-70' : ''}`}>
                {!m.isOwn && (
                  <p className="text-[10px] font-semibold text-brand-yellow mb-1">{m.senderName}</p>
                )}
                <p className={`text-sm ${m.isOwn ? 'text-brand-black' : 'text-slate-800'}`}>{m.content}</p>
                <p className={`text-[10px] mt-1 text-right ${m.isOwn ? 'text-black/40' : 'text-slate-300'}`}>
                  {format(new Date(m.createdAt), 'HH:mm', { locale: th })}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-3 bg-white border-t border-slate-100 px-5 py-3 flex-shrink-0">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="พิมพ์ข้อความ..."
          disabled={!connected}
          className="flex-1 h-11 rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-brand-yellow disabled:bg-slate-50 disabled:text-slate-300"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending || !connected}
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-yellow disabled:opacity-40"
        >
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 text-brand-black" />}
        </button>
      </div>
    </div>
  )
}
