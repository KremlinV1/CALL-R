"use client"

import { useState } from "react"
import { useAuthStore } from "@/stores/auth-store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Video, Copy, PhoneOff, Users, Sparkles, Loader2, Bot } from "lucide-react"
import { toast } from "sonner"
import axios from "axios"
import { VideoRoom } from "@/components/video-call/VideoRoom"
import { HeyGenAvatarRoom } from "@/components/video-call/HeyGenAvatarRoom"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"

interface VideoCallSession {
  roomName: string
  livekitUrl: string
  agentToken: string
  agentIdentity: string
  customerJoinUrl: string
  customerJoinToken: string
  expiresAt: number
}

interface HeyGenSession {
  sessionToken: string
  customerJoinUrl: string
  customerJoinToken: string
  customerName: string
  agentDisplayName: string
  expiresAt: number
}

type CallMode = "livekit" | "heygen"

export default function VideoCallsPage() {
  const { token, user } = useAuthStore()
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [agentDisplayName, setAgentDisplayName] = useState(
    user ? `${user.firstName} ${user.lastName}` : ""
  )
  const [enableFaceSwap, setEnableFaceSwap] = useState(false)
  const [callMode, setCallMode] = useState<CallMode>("livekit")
  const [session, setSession] = useState<VideoCallSession | null>(null)
  const [heygenSession, setHeygenSession] = useState<HeyGenSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [inCall, setInCall] = useState(false)

  const createCall = async () => {
    if (!customerName.trim()) {
      toast.error("Please enter a customer name")
      return
    }
    setLoading(true)
    try {
      if (callMode === "heygen") {
        const { data } = await axios.post(
          `${API_URL}/api/video-calls/heygen/create`,
          {
            customerName,
            customerPhone,
            agentDisplayName,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        )
        setHeygenSession(data)
        toast.success("HeyGen avatar call created! Share the link with the customer.")
      } else {
        const { data } = await axios.post(
          `${API_URL}/api/video-calls/create`,
          {
            customerName,
            customerPhone,
            agentDisplayName,
            enableFaceSwap,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        )
        setSession(data)
        toast.success("Video call created! Share the link with the customer.")
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to create video call")
    } finally {
      setLoading(false)
    }
  }

  const copyLink = async () => {
    const url = heygenSession?.customerJoinUrl || session?.customerJoinUrl
    if (!url) return
    await navigator.clipboard.writeText(url)
    toast.success("Customer link copied to clipboard")
  }

  const joinCall = () => {
    setInCall(true)
  }

  const endCall = async () => {
    if (heygenSession) {
      try {
        await axios.post(
          `${API_URL}/api/video-calls/heygen/${heygenSession.customerJoinToken}/end`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        )
      } catch (error) {
        // Non-fatal
      }
      setInCall(false)
      setHeygenSession(null)
      toast.info("Call ended")
      return
    }
    if (!session) return
    try {
      await axios.post(
        `${API_URL}/api/video-calls/${session.roomName}/end`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      )
    } catch (error) {
      // Non-fatal
    }
    setInCall(false)
    setSession(null)
    toast.info("Call ended")
  }

  // In-call view — HeyGen mode
  if (inCall && heygenSession) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <div className="absolute top-4 right-4 z-10">
          <Button variant="destructive" size="sm" onClick={endCall}>
            <PhoneOff className="mr-2 h-4 w-4" />
            End Call
          </Button>
        </div>
        <HeyGenAvatarRoom
          sessionToken={heygenSession.sessionToken}
          agentDisplayName={heygenSession.agentDisplayName}
          onDisconnected={endCall}
        />
      </div>
    )
  }

  // In-call view — LiveKit mode
  if (inCall && session) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
          <Badge variant="secondary" className="bg-black/50 text-white">
            <Video className="mr-1 h-3 w-3" />
            Room: {session.roomName}
          </Badge>
          {enableFaceSwap && (
            <Badge className="bg-purple-600 text-white">
              <Sparkles className="mr-1 h-3 w-3" />
              Face Swap Active
            </Badge>
          )}
        </div>
        <div className="absolute top-4 right-4 z-10">
          <Button variant="destructive" size="sm" onClick={endCall}>
            <PhoneOff className="mr-2 h-4 w-4" />
            End Call
          </Button>
        </div>
        <VideoRoom
          token={session.agentToken}
          serverUrl={session.livekitUrl}
          onDisconnected={endCall}
        />
      </div>
    )
  }

  // Pre-call setup view
  return (
    <div className="container mx-auto max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Video Calls</h1>
        <p className="text-muted-foreground mt-1">
          Start a video call with a customer. They'll get a link to join from any browser.
        </p>
      </div>

      {!session && !heygenSession ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              New Video Call
            </CardTitle>
            <CardDescription>
              Create a video call room and send a join link to the customer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mode selector */}
            <div className="space-y-2">
              <Label>Call Mode</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCallMode("livekit")}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                    callMode === "livekit"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <Video className="h-4 w-4" />
                  <div className="text-left">
                    <div className="font-medium">LiveKit Video</div>
                    <div className="text-xs text-muted-foreground">Real video call</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setCallMode("heygen")}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                    callMode === "heygen"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <Bot className="h-4 w-4" />
                  <div className="text-left">
                    <div className="font-medium">HeyGen Avatar</div>
                    <div className="text-xs text-muted-foreground">AI avatar agent</div>
                  </div>
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer Name *</Label>
              <Input
                id="customerName"
                placeholder="John Doe"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerPhone">Customer Phone (optional)</Label>
              <Input
                id="customerPhone"
                placeholder="+1 555 123 4567"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agentDisplayName">Your Display Name</Label>
              <Input
                id="agentDisplayName"
                placeholder="Sarah from Support"
                value={agentDisplayName}
                onChange={(e) => setAgentDisplayName(e.target.value)}
              />
            </div>
            {callMode === "livekit" && (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-600" />
                    Enable Face Swap
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Apply real-time face swap to your video (requires GPU agent running).
                  </p>
                </div>
                <Switch checked={enableFaceSwap} onCheckedChange={setEnableFaceSwap} />
              </div>
            )}
            <Button
              onClick={createCall}
              disabled={loading || !customerName.trim()}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : callMode === "heygen" ? (
                <Bot className="mr-2 h-4 w-4" />
              ) : (
                <Video className="mr-2 h-4 w-4" />
              )}
              {callMode === "heygen" ? "Create Avatar Call" : "Create Video Call"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {heygenSession ? (
                <Bot className="h-5 w-5 text-green-600" />
              ) : (
                <Video className="h-5 w-5 text-green-600" />
              )}
              {heygenSession ? "Avatar Call Ready" : "Video Call Ready"}
            </CardTitle>
            <CardDescription>
              Share this link with <strong>{customerName}</strong> so they can join the call.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Customer Join Link</Label>
              <div className="flex gap-2">
                <Input
                  value={heygenSession?.customerJoinUrl || session?.customerJoinUrl || ""}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button variant="outline" size="icon" onClick={copyLink}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="rounded-lg bg-muted p-4 text-sm space-y-1">
              {session && (
                <>
                  <p><strong>Room:</strong> {session.roomName}</p>
                  <p><strong>Expires:</strong> {new Date(session.expiresAt).toLocaleString()}</p>
                  {enableFaceSwap && (
                    <p className="text-purple-600 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Face swap enabled
                    </p>
                  )}
                </>
              )}
              {heygenSession && (
                <>
                  <p><strong>Agent:</strong> {heygenSession.agentDisplayName}</p>
                  <p><strong>Expires:</strong> {new Date(heygenSession.expiresAt).toLocaleString()}</p>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={joinCall} size="lg" className="flex-1">
                {heygenSession ? <Bot className="mr-2 h-4 w-4" /> : <Video className="mr-2 h-4 w-4" />}
                Join Call
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSession(null)
                  setHeygenSession(null)
                }}
                size="lg"
              >
                Cancel
              </Button>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 text-sm">
              <Users className="h-4 w-4 mt-0.5 text-blue-600 flex-shrink-0" />
              <div className="text-blue-900 dark:text-blue-100">
                <strong>Tip:</strong> Click "Join Call" to enter the {heygenSession ? "avatar session" : "video room"}, then send the link
                to your customer via SMS or any messaging app. They can join from any browser — no
                app required.
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
