"use client"

import { useEffect } from "react"
import {
  LiveKitRoom,
  VideoConference,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  ControlBar,
  useTracks,
} from "@livekit/components-react"
import { Track } from "livekit-client"
import "@livekit/components-styles"

interface VideoRoomProps {
  token: string
  serverUrl: string
  onDisconnected?: () => void
  userChoices?: { videoEnabled?: boolean; audioEnabled?: boolean }
}

export function VideoRoom({ token, serverUrl, onDisconnected, userChoices }: VideoRoomProps) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      video={userChoices?.videoEnabled ?? true}
      audio={userChoices?.audioEnabled ?? true}
      onDisconnected={onDisconnected}
      data-lk-theme="default"
      style={{ height: "100%", minHeight: "600px" }}
    >
      <VideoConference />
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}

/**
 * Simpler 2-participant layout (agent + customer)
 */
export function VideoCallLayout() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  )

  return (
    <GridLayout tracks={tracks} style={{ height: "calc(100% - 60px)" }}>
      <ParticipantTile />
    </GridLayout>
  )
}
