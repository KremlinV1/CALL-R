"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import {
  LiveAvatarSession,
  SessionEvent,
  SessionState,
  AgentEventsEnum,
} from "@heygen/liveavatar-web-sdk"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PhoneOff, Mic, MicOff, Loader2, Bot } from "lucide-react"

interface HeyGenAvatarRoomProps {
  sessionToken: string
  agentDisplayName?: string
  onDisconnected?: () => void
}

export function HeyGenAvatarRoom({
  sessionToken,
  agentDisplayName = "AI Agent",
  onDisconnected,
}: HeyGenAvatarRoomProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const sessionRef = useRef<LiveAvatarSession | null>(null)
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [micEnabled, setMicEnabled] = useState(true)
  const [voiceChatActive, setVoiceChatActive] = useState(false)

  const handleDisconnected = useCallback(() => {
    onDisconnected?.()
  }, [onDisconnected])

  useEffect(() => {
    let mounted = true

    const startSession = async () => {
      try {
        const session = new LiveAvatarSession(sessionToken, {
          voiceChat: true,
        })
        sessionRef.current = session

        session.on(SessionEvent.SESSION_STATE_CHANGED, (state: SessionState) => {
          if (!mounted) return
          if (state === SessionState.CONNECTED) {
            setStatus("connected")
            // Attach video stream once connected
            if (videoRef.current) {
              session.attach(videoRef.current)
            }
          } else if (state === SessionState.DISCONNECTED) {
            setStatus("disconnected")
          }
        })

        session.on(SessionEvent.SESSION_STREAM_READY, () => {
          if (!mounted) return
          if (videoRef.current) {
            session.attach(videoRef.current)
          }
        })

        session.on(SessionEvent.SESSION_DISCONNECTED, () => {
          if (!mounted) return
          setStatus("disconnected")
          handleDisconnected()
        })

        session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
          if (mounted) setVoiceChatActive(true)
        })

        session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
          if (mounted) setVoiceChatActive(false)
        })

        await session.start()
      } catch (err: any) {
        if (mounted) {
          setStatus("error")
          setErrorMsg(err?.message || "Failed to start avatar session")
        }
      }
    }

    startSession()

    return () => {
      mounted = false
      if (sessionRef.current) {
        sessionRef.current.stop().catch(() => {})
        sessionRef.current = null
      }
    }
  }, [sessionToken, handleDisconnected])

  const toggleMic = () => {
    const next = !micEnabled
    setMicEnabled(next)
    const vc = sessionRef.current?.voiceChat
    if (!vc) return
    if (next) {
      vc.unmute().catch(() => {})
    } else {
      vc.mute().catch(() => {})
    }
  }

  const endCall = async () => {
    if (sessionRef.current) {
      try {
        await sessionRef.current.stop()
      } catch {
        // ignore
      }
      sessionRef.current = null
    }
    setStatus("disconnected")
    onDisconnected?.()
  }

  if (status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-black text-white">
        <p className="text-red-400">{errorMsg || "Failed to connect"}</p>
        <Button variant="destructive" onClick={endCall}>
          <PhoneOff className="mr-2 h-4 w-4" />
          Close
        </Button>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full bg-black">
      {/* Top bar */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <Badge variant="secondary" className="bg-black/50 text-white">
          <Bot className="mr-1 h-3 w-3" />
          {agentDisplayName}
        </Badge>
        {voiceChatActive && (
          <Badge className="bg-green-600 text-white">
            <Mic className="mr-1 h-3 w-3" />
            Voice Active
          </Badge>
        )}
      </div>

      {/* Status indicator */}
      {status === "connecting" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black">
          <div className="text-center space-y-3">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-white/70" />
            <p className="text-sm text-white/70">Connecting to AI avatar...</p>
          </div>
        </div>
      )}

      {/* Avatar video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-contain"
      />

      {/* Bottom controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3">
        <Button
          variant="secondary"
          size="icon"
          onClick={toggleMic}
          className="rounded-full"
        >
          {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>
        <Button variant="destructive" size="icon" onClick={endCall} className="rounded-full">
          <PhoneOff className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}
