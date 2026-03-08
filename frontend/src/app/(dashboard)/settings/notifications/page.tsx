"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  Loader2,
  Trash2,
  Send,
  Bell,
  MessageSquare,
  Mail,
  Smartphone,
  Webhook,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useAuthStore } from "@/stores/auth-store"
import axios from "axios"
import Link from "next/link"
import { format } from "date-fns"

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`

interface NotificationChannel {
  id: string
  name: string
  channelType: string
  subscribedEvents: string[]
  agentIds: string[]
  campaignIds: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface NotificationLog {
  id: string
  channelId: string
  eventType: string
  payload: any
  status: string
  error: string | null
  responseCode: number | null
  sentAt: string
}

interface EventDef {
  type: string
  label: string
  description: string
}

const channelTypeConfig: Record<string, { label: string; icon: any; color: string }> = {
  slack:    { label: "Slack",    icon: MessageSquare, color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  email:    { label: "Email",    icon: Mail,          color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  sms:      { label: "SMS",      icon: Smartphone,    color: "bg-green-500/10 text-green-600 border-green-500/20" },
  teams:    { label: "Teams",    icon: MessageSquare, color: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20" },
  discord:  { label: "Discord",  icon: MessageSquare, color: "bg-violet-500/10 text-violet-600 border-violet-500/20" },
  webhook:  { label: "Webhook",  icon: Webhook,       color: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
}

export default function NotificationSettingsPage() {
  const { token } = useAuthStore()
  const queryClient = useQueryClient()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["notification-channels"],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/notifications/channels`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data
    },
    enabled: !!token,
  })

  const { data: eventsData } = useQuery({
    queryKey: ["notification-events"],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/notifications/events`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data
    },
    enabled: !!token,
  })

  const channels: NotificationChannel[] = data?.channels || []
  const eventDefs: EventDef[] = eventsData?.events || []

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`${API_URL}/notifications/channels/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-channels"] })
      toast.success("Channel removed")
    },
    onError: () => toast.error("Failed to remove channel"),
  })

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await axios.post(`${API_URL}/notifications/channels/${id}/test`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data
    },
    onSuccess: (data) => {
      if (data.success) toast.success("Test notification sent!")
      else toast.error("Test failed")
    },
    onError: () => toast.error("Test failed"),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await axios.put(`${API_URL}/notifications/channels/${id}`, { isActive }, {
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-channels"] })
    },
    onError: () => toast.error("Failed to update"),
  })

  const updateEventsMutation = useMutation({
    mutationFn: async ({ id, subscribedEvents }: { id: string; subscribedEvents: string[] }) => {
      await axios.put(`${API_URL}/notifications/channels/${id}`, { subscribedEvents }, {
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-channels"] })
      toast.success("Events updated")
    },
    onError: () => toast.error("Failed to update events"),
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/settings" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          </div>
          <p className="text-muted-foreground">
            Configure channels to receive real-time alerts for calls, campaigns, and appointments.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLogsOpen(true)}>
            <Bell className="mr-2 h-4 w-4" /> Logs
          </Button>
          <Button onClick={() => setIsAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Channel
          </Button>
        </div>
      </div>

      {/* Available channel types (when empty) */}
      {channels.length === 0 && !isLoading && (
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(channelTypeConfig).map(([key, cfg]) => {
            const Icon = cfg.icon
            return (
              <Card key={key} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setIsAddOpen(true)}>
                <CardContent className="p-6 text-center">
                  <div className={`mx-auto w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${cfg.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold">{cfg.label}</h3>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Channel list */}
      {channels.length > 0 && (
        <div className="space-y-4">
          {channels.map((channel) => {
            const cfg = channelTypeConfig[channel.channelType] || { label: channel.channelType, icon: Bell, color: "" }
            const Icon = cfg.icon

            return (
              <Card key={channel.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cfg.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{channel.name}</CardTitle>
                        <CardDescription>{cfg.label}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={channel.isActive}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: channel.id, isActive: checked })}
                      />
                      <Badge variant={channel.isActive ? "default" : "secondary"}>
                        {channel.isActive ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Subscribed events */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-2 block">Subscribed Events</Label>
                      <div className="flex flex-wrap gap-2">
                        {eventDefs.map(evt => {
                          const isSubscribed = channel.subscribedEvents.includes(evt.type)
                          return (
                            <button
                              key={evt.type}
                              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                isSubscribed
                                  ? "bg-primary/10 border-primary/30 text-primary"
                                  : "bg-muted/50 border-transparent text-muted-foreground hover:border-primary/20"
                              }`}
                              onClick={() => {
                                const updated = isSubscribed
                                  ? channel.subscribedEvents.filter(e => e !== evt.type)
                                  : [...channel.subscribedEvents, evt.type]
                                updateEventsMutation.mutate({ id: channel.id, subscribedEvents: updated })
                              }}
                            >
                              {evt.label}
                            </button>
                          )
                        })}
                        {channel.subscribedEvents.length === 0 && (
                          <span className="text-xs text-muted-foreground italic">All events (no filter)</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testMutation.mutate(channel.id)}
                        disabled={testMutation.isPending}
                      >
                        {testMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
                        Send Test
                      </Button>
                      <div className="flex-1" />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                        onClick={() => {
                          if (confirm("Remove this notification channel?")) deleteMutation.mutate(channel.id)
                        }}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          <Button variant="outline" className="w-full" onClick={() => setIsAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Another Channel
          </Button>
        </div>
      )}

      {/* Add Channel Dialog */}
      <AddChannelDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        token={token}
        eventDefs={eventDefs}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["notification-channels"] })}
      />

      {/* Logs Dialog */}
      <LogsDialog open={logsOpen} onOpenChange={setLogsOpen} token={token} />
    </div>
  )
}

// ─── Add Channel Dialog ─────────────────────────────────────────────

function AddChannelDialog({ open, onOpenChange, token, eventDefs, onCreated }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string | null
  eventDefs: EventDef[]
  onCreated: () => void
}) {
  const [channelType, setChannelType] = useState("")
  const [name, setName] = useState("")
  const [webhookUrl, setWebhookUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [fromEmail, setFromEmail] = useState("")
  const [fromNumber, setFromNumber] = useState("")
  const [provider, setProvider] = useState("sendgrid")
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const toggleEvent = (type: string) => {
    setSelectedEvents(prev =>
      prev.includes(type) ? prev.filter(e => e !== type) : [...prev, type]
    )
  }

  const handleSubmit = async () => {
    if (!token || !channelType || !name) return
    setSubmitting(true)
    try {
      const config: any = {}
      if (['slack', 'teams', 'discord'].includes(channelType)) config.webhookUrl = webhookUrl
      if (channelType === 'email') { config.provider = provider; config.apiKey = apiKey; config.fromEmail = fromEmail }
      if (channelType === 'sms') { config.provider = provider; config.apiKey = apiKey; config.fromNumber = fromNumber }
      if (channelType === 'webhook') { config.url = webhookUrl; config.method = 'POST' }

      await axios.post(`${API_URL}/notifications/channels`, {
        name,
        channelType,
        config,
        subscribedEvents: selectedEvents,
      }, { headers: { Authorization: `Bearer ${token}` } })

      toast.success("Channel added!")
      onOpenChange(false)
      setChannelType(""); setName(""); setWebhookUrl(""); setApiKey(""); setFromEmail(""); setFromNumber(""); setSelectedEvents([])
      onCreated()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to add channel")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Notification Channel</DialogTitle>
          <DialogDescription>Set up a new channel to receive alerts</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {/* Channel type selection */}
          <div className="space-y-2">
            <Label>Channel Type *</Label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(channelTypeConfig).map(([key, cfg]) => {
                const Icon = cfg.icon
                return (
                  <button
                    key={key}
                    type="button"
                    className={`p-3 rounded-lg border text-center transition-colors ${
                      channelType === key ? "border-primary bg-primary/5" : "hover:border-primary/50"
                    }`}
                    onClick={() => {
                      setChannelType(key)
                      if (!name) setName(cfg.label)
                    }}
                  >
                    <Icon className="h-5 w-5 mx-auto mb-1" />
                    <span className="text-xs font-medium">{cfg.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Channel Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sales Alerts" />
          </div>

          {/* Channel-specific fields */}
          {['slack', 'teams', 'discord'].includes(channelType) && (
            <div className="space-y-2">
              <Label>Webhook URL *</Label>
              <Input
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder={`${channelType === 'slack' ? 'https://hooks.slack.com/services/...' : channelType === 'teams' ? 'https://outlook.office.com/webhook/...' : 'https://discord.com/api/webhooks/...'}`}
              />
            </div>
          )}

          {channelType === 'email' && (
            <>
              <div className="space-y-2">
                <Label>Email Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sendgrid">SendGrid</SelectItem>
                    <SelectItem value="postmark">Postmark</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>API Key *</Label>
                <Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="API key" />
              </div>
              <div className="space-y-2">
                <Label>From Email *</Label>
                <Input value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="alerts@yourcompany.com" />
              </div>
            </>
          )}

          {channelType === 'sms' && (
            <>
              <div className="space-y-2">
                <Label>SMS Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="telnyx">Telnyx</SelectItem>
                    <SelectItem value="twilio">Twilio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>API Key *</Label>
                <Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={provider === 'twilio' ? 'accountSid:authToken' : 'API key'} />
              </div>
              <div className="space-y-2">
                <Label>From Number *</Label>
                <Input value={fromNumber} onChange={e => setFromNumber(e.target.value)} placeholder="+1234567890" />
              </div>
            </>
          )}

          {channelType === 'webhook' && (
            <div className="space-y-2">
              <Label>Webhook URL *</Label>
              <Input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://api.yourservice.com/webhook" />
            </div>
          )}

          {/* Event subscriptions */}
          {channelType && (
            <div className="space-y-2">
              <Label>Subscribe to Events <span className="text-muted-foreground text-xs">(leave empty for all)</span></Label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded p-3">
                {eventDefs.map(evt => (
                  <label key={evt.type} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={selectedEvents.includes(evt.type)}
                      onCheckedChange={() => toggleEvent(evt.type)}
                    />
                    <span>{evt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !channelType || !name}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add Channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Logs Dialog ────────────────────────────────────────────────────

function LogsDialog({ open, onOpenChange, token }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string | null
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["notification-logs"],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/notifications/logs`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data
    },
    enabled: !!token && open,
  })

  const logs: NotificationLog[] = data?.logs || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Notification Logs</DialogTitle>
          <DialogDescription>Recent notification delivery history</DialogDescription>
        </DialogHeader>
        {isLoading && (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        )}
        {!isLoading && logs.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No notifications sent yet</p>
        )}
        {logs.length > 0 && (
          <div className="space-y-2 mt-2">
            {logs.map(log => (
              <div key={log.id} className="flex items-center gap-3 p-3 border rounded-lg text-sm">
                {log.status === "sent" && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                {log.status === "failed" && <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                {log.status === "pending" && <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{log.eventType}</Badge>
                    <Badge variant={log.status === "sent" ? "default" : "destructive"} className="text-[10px]">
                      {log.status}
                    </Badge>
                    {log.responseCode && (
                      <span className="text-[10px] text-muted-foreground">HTTP {log.responseCode}</span>
                    )}
                  </div>
                  {log.error && <p className="text-xs text-red-500 mt-0.5 truncate">{log.error}</p>}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {format(new Date(log.sentAt), "MMM d, h:mm a")}
                </span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
