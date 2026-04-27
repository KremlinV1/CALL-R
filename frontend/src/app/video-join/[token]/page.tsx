"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import axios from "axios"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Video, Loader2, AlertCircle, PhoneOff, Camera, Mic } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { VideoRoom } from "@/components/video-call/VideoRoom"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"

interface JoinData {
  token: string
  livekitUrl: string
  roomName: string
  customerName: string
  identity: string
}

export default function VideoJoinPage() {
  const params = useParams<{ token: string }>()
  const joinToken = params?.token

  const [joinData, setJoinData] = useState<JoinData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [micEnabled, setMicEnabled] = useState(true)
  const [inCall, setInCall] = useState(false)

  useEffect(() => {
    if (!joinToken) return
    const fetchToken = async () => {
      try {
        const { data } = await axios.get(
          `${API_URL}/api/video-calls/customer/${joinToken}`
        )
        setJoinData(data)
      } catch (err: any) {
        setError(err.response?.data?.error || "Failed to load video call")
      } finally {
        setLoading(false)
      }
    }
    fetchToken()
  }, [joinToken])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading video call...</p>
        </div>
      </div>
    )
  }

  if (error || !joinData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="mx-auto bg-destructive/10 rounded-full p-3 w-fit">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-center mt-4">Unable to Join</CardTitle>
            <CardDescription className="text-center">
              {error || "This video call link is invalid or has expired."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground text-center">
            Please contact the person who sent you this link for a new one.
          </CardContent>
        </Card>
      </div>
    )
  }

  if (inCall) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <div className="absolute top-4 right-4 z-10">
          <Button variant="destructive" size="sm" onClick={() => setInCall(false)}>
            <PhoneOff className="mr-2 h-4 w-4" />
            Leave Call
          </Button>
        </div>
        <VideoRoom
          token={joinData.token}
          serverUrl={joinData.livekitUrl}
          onDisconnected={() => setInCall(false)}
          userChoices={{ videoEnabled: cameraEnabled, audioEnabled: micEnabled }}
        />
      </div>
    )
  }

  // Pre-join lobby
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="mx-auto bg-primary/10 rounded-full p-3 w-fit">
            <Video className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-center mt-4">Ready to Join?</CardTitle>
          <CardDescription className="text-center">
            Hi <strong>{joinData.customerName}</strong>, you're about to join a video call.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label className="flex items-center gap-2 cursor-pointer">
              <Camera className="h-4 w-4" />
              Camera
            </Label>
            <Switch checked={cameraEnabled} onCheckedChange={setCameraEnabled} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label className="flex items-center gap-2 cursor-pointer">
              <Mic className="h-4 w-4" />
              Microphone
            </Label>
            <Switch checked={micEnabled} onCheckedChange={setMicEnabled} />
          </div>
          <Button
            onClick={() => setInCall(true)}
            size="lg"
            className="w-full"
          >
            <Video className="mr-2 h-5 w-5" />
            Join Video Call
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Your camera and microphone access will be requested by the browser.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
