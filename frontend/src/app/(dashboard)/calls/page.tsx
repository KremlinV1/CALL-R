"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Search,
  Play,
  Download,
  Clock,
  Calendar,
  Bot,
  User,
  FileText,
  MessageSquare,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useAuthStore } from "@/stores/auth-store"
import axios from "axios"
import { formatDistanceToNow, format } from "date-fns"
import { Label } from "@/components/ui/label"
import {
  DialogFooter,
} from "@/components/ui/dialog"

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`

interface Call {
  id: string
  agentId: string
  agentName?: string
  campaignId?: string
  campaignName?: string
  contactId?: string
  direction: 'inbound' | 'outbound'
  status: string
  fromNumber: string
  toNumber: string
  startedAt?: string
  answeredAt?: string
  endedAt?: string
  durationSeconds?: number
  recordingUrl?: string
  transcript?: string
  summary?: string
  sentiment?: string
  outcome?: string
  qualityScore?: number
  costCents?: number
  metadata?: any
  createdAt: string
}

interface CallStats {
  totalCalls: number
  completedCalls: number
  failedCalls: number
  successRate: number
  inboundCalls: number
  outboundCalls: number
  totalDurationMinutes: number
  avgDurationSeconds: number
  totalCostDollars: number
  avgQualityScore: number
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
  }
  return phone
}

interface Agent {
  id: string
  name: string
  status: string
}

interface OrgPhoneNumber {
  id: string
  number: string
  label: string | null
  provider: string
  status: string
}

export default function CallsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [directionFilter, setDirectionFilter] = useState<string>("all")
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all")
  const [page, setPage] = useState(1)
  const [makeCallOpen, setMakeCallOpen] = useState(false)
  const [callToNumber, setCallToNumber] = useState("")
  const [callAgentId, setCallAgentId] = useState("")
  const [callFromNumberId, setCallFromNumberId] = useState("")
  const [callStatus, setCallStatus] = useState<'idle' | 'dialing' | 'ringing' | 'connected' | 'failed'>('idle')
  
  const { token } = useAuthStore()
  const queryClient = useQueryClient()

  // Fetch calls from API
  const { data: callsData, isLoading: isLoadingCalls, refetch } = useQuery({
    queryKey: ['calls', page, statusFilter, directionFilter, outcomeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '25' })
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (directionFilter !== 'all') params.append('direction', directionFilter)
      if (outcomeFilter !== 'all') params.append('outcome', outcomeFilter)
      
      const response = await axios.get(`${API_URL}/calls?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data as { calls: Call[], pagination: { total: number, totalPages: number } }
    },
    enabled: !!token,
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  // Fetch agents for call dialog
  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/agents`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return (response.data.agents || response.data) as Agent[]
    },
    enabled: !!token,
  })

  // Fetch org phone numbers for from-number selection
  const { data: orgPhoneNumbers } = useQuery({
    queryKey: ['livekit-phone-numbers-for-calls'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/livekit/phone-numbers`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const items = response.data.items || response.data.numbers || []
      return items.map((n: any) => ({
        id: n.id || n.trunkId || n.number,
        number: n.e164_format || n.number,
        label: n.locality ? `${n.locality}, ${n.region}` : (n.trunkName || null),
        provider: 'livekit',
        status: 'active',
      })) as OrgPhoneNumber[]
    },
    enabled: !!token,
  })

  // Make outbound call mutation
  const makeCallMutation = useMutation({
    mutationFn: async (data: { agentId: string; toNumber: string; fromNumberId?: string }) => {
      const response = await axios.post(
        `${API_URL}/calls/outbound`,
        data,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      return response.data
    },
    onSuccess: (data) => {
      toast.success(`Call initiated to ${callToNumber}`)
      setCallStatus('ringing')
      queryClient.invalidateQueries({ queryKey: ['calls'] })
      queryClient.invalidateQueries({ queryKey: ['call-stats'] })
      // Auto-close after a brief delay
      setTimeout(() => {
        setMakeCallOpen(false)
        resetCallDialog()
      }, 2000)
    },
    onError: (error: any) => {
      setCallStatus('failed')
      toast.error(error.response?.data?.error || 'Failed to initiate call')
    },
  })

  const resetCallDialog = useCallback(() => {
    setCallToNumber('')
    setCallAgentId('')
    setCallFromNumberId('')
    setCallStatus('idle')
  }, [])

  const handleMakeCall = () => {
    if (!callToNumber.trim()) {
      toast.error('Please enter a phone number')
      return
    }
    if (!callAgentId) {
      toast.error('Please select an agent')
      return
    }
    setCallStatus('dialing')
    makeCallMutation.mutate({
      agentId: callAgentId,
      toNumber: callToNumber.trim(),
      fromNumberId: callFromNumberId || undefined,
    })
  }

  // Fetch call statistics
  const { data: statsData } = useQuery({
    queryKey: ['call-stats'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/calls/stats/summary`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data as CallStats
    },
    enabled: !!token,
  })

  const calls = callsData?.calls || []
  const stats = statsData

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500">Completed</Badge>
      case "voicemail":
        return <Badge variant="secondary">Voicemail</Badge>
      case "failed":
        return <Badge variant="destructive">Failed</Badge>
      case "in-progress":
        return <Badge className="bg-blue-500">In Progress</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getSentimentBadge = (sentiment: string) => {
    switch (sentiment) {
      case "positive":
        return <Badge variant="outline" className="text-green-500 border-green-500">Positive</Badge>
      case "negative":
        return <Badge variant="outline" className="text-red-500 border-red-500">Negative</Badge>
      default:
        return <Badge variant="outline">Neutral</Badge>
    }
  }

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case "inbound":
        return <PhoneIncoming className="h-4 w-4 text-blue-500" />
      case "outbound":
        return <PhoneOutgoing className="h-4 w-4 text-green-500" />
      default:
        return <Phone className="h-4 w-4" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Call History</h1>
          <p className="text-muted-foreground">
            View and analyze all your voice agent calls
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => { resetCallDialog(); setMakeCallOpen(true) }}>
            <PhoneOutgoing className="mr-2 h-4 w-4" />
            Make Call
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export Calls
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalCalls?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.inboundCalls || 0} inbound • {stats?.outboundCalls || 0} outbound
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(stats?.avgDurationSeconds)}</div>
            <p className="text-xs text-muted-foreground">{stats?.totalDurationMinutes || 0} total minutes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats?.successRate || 0}%</div>
            <p className="text-xs text-muted-foreground">{stats?.completedCalls || 0} completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Quality Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{stats?.avgQualityScore || 0}/10</div>
            <p className="text-xs text-muted-foreground">average rating</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search calls..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="in-progress">In Progress</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
          </SelectContent>
        </Select>
        <Select value={directionFilter} onValueChange={setDirectionFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Direction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Directions</SelectItem>
            <SelectItem value="inbound">Inbound</SelectItem>
            <SelectItem value="outbound">Outbound</SelectItem>
          </SelectContent>
        </Select>
        <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Outcome" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Outcomes</SelectItem>
            <SelectItem value="Appointment Scheduled">Appointment Scheduled</SelectItem>
            <SelectItem value="Interested">Interested</SelectItem>
            <SelectItem value="Successful">Successful</SelectItem>
            <SelectItem value="Callback Requested">Callback Requested</SelectItem>
            <SelectItem value="Information Provided">Information Provided</SelectItem>
            <SelectItem value="Transfer">Transfer</SelectItem>
            <SelectItem value="Follow Up">Follow Up</SelectItem>
            <SelectItem value="Not Interested">Not Interested</SelectItem>
            <SelectItem value="Wrong Number">Wrong Number</SelectItem>
            <SelectItem value="Already Customer">Already Customer</SelectItem>
            <SelectItem value="Call Back Later">Call Back Later</SelectItem>
            <SelectItem value="No Answer">No Answer</SelectItem>
            <SelectItem value="Voicemail">Voicemail</SelectItem>
            <SelectItem value="Busy">Busy</SelectItem>
            <SelectItem value="Failed">Failed</SelectItem>
            <SelectItem value="Hung Up">Hung Up</SelectItem>
            <SelectItem value="Do Not Call">Do Not Call</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Calls Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Sentiment</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingCalls ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : calls.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    No calls found
                  </TableCell>
                </TableRow>
              ) : (
                calls.map((call) => (
                  <TableRow
                    key={call.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedCall(call)}
                  >
                    <TableCell>{getDirectionIcon(call.direction)}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{formatPhoneNumber(call.direction === 'outbound' ? call.toNumber : call.fromNumber)}</p>
                        <p className="text-sm text-muted-foreground">{call.direction === 'outbound' ? 'To' : 'From'}</p>
                      </div>
                    </TableCell>
                    <TableCell>{call.agentName || 'Unknown Agent'}</TableCell>
                    <TableCell className="text-sm">{call.campaignName || '-'}</TableCell>
                    <TableCell>{formatDuration(call.durationSeconds)}</TableCell>
                    <TableCell>{getStatusBadge(call.status)}</TableCell>
                    <TableCell>{call.outcome || '-'}</TableCell>
                    <TableCell>{getSentimentBadge(call.sentiment || 'neutral')}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {call.createdAt ? formatDistanceToNow(new Date(call.createdAt), { addSuffix: true }) : '-'}
                    </TableCell>
                    <TableCell>
                      {call.recordingUrl && (
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Call Detail Dialog */}
      <Dialog open={!!selectedCall} onOpenChange={() => setSelectedCall(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {selectedCall && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {getDirectionIcon(selectedCall.direction)}
                  {selectedCall.direction === 'outbound' ? 'Outbound Call' : 'Inbound Call'}
                </DialogTitle>
                <DialogDescription>
                  {formatPhoneNumber(selectedCall.direction === 'outbound' ? selectedCall.toNumber : selectedCall.fromNumber)} •{' '}
                  {selectedCall.createdAt ? format(new Date(selectedCall.createdAt), 'PPp') : 'Unknown time'}
                </DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="summary" className="mt-4">
                <TabsList>
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="transcript">Transcript</TabsTrigger>
                  <TabsTrigger value="recording">Recording</TabsTrigger>
                </TabsList>
                <TabsContent value="summary" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Agent</p>
                      <p className="font-medium flex items-center gap-2">
                        <Bot className="h-4 w-4" />
                        {selectedCall.agentName || 'Unknown Agent'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Duration</p>
                      <p className="font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        {formatDuration(selectedCall.durationSeconds)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Status</p>
                      {getStatusBadge(selectedCall.status)}
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Sentiment</p>
                      {getSentimentBadge(selectedCall.sentiment || 'neutral')}
                    </div>
                    {selectedCall.qualityScore && (
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Quality Score</p>
                        <p className="font-medium">{selectedCall.qualityScore}/10</p>
                      </div>
                    )}
                    {selectedCall.costCents && (
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Cost</p>
                        <p className="font-medium">${(selectedCall.costCents / 100).toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">AI Summary</p>
                    <div className="p-4 bg-muted rounded-lg">
                      <p>{selectedCall.summary || 'No summary available'}</p>
                    </div>
                  </div>
                  {selectedCall.outcome && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">Outcome</p>
                      <Badge>{selectedCall.outcome}</Badge>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="transcript" className="mt-4">
                  <div className="p-4 bg-muted rounded-lg max-h-96 overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-sm font-sans">
                      {selectedCall.transcript || "No transcript available"}
                    </pre>
                  </div>
                </TabsContent>
                <TabsContent value="recording" className="mt-4">
                  {selectedCall.recordingUrl ? (
                    <RecordingPlayer callId={selectedCall.id} token={token} />
                  ) : (
                    <p className="text-muted-foreground">No recording available</p>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Make Call Dialog */}
      <Dialog open={makeCallOpen} onOpenChange={(open) => { if (!open) { setMakeCallOpen(false); resetCallDialog() } else setMakeCallOpen(true) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneOutgoing className="h-5 w-5" />
              Make Outbound Call
            </DialogTitle>
            <DialogDescription>
              Place a call using one of your AI agents via LiveKit SIP.
            </DialogDescription>
          </DialogHeader>

          {callStatus === 'idle' || callStatus === 'failed' ? (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="toNumber">Phone Number</Label>
                <Input
                  id="toNumber"
                  placeholder="+1 (555) 123-4567"
                  value={callToNumber}
                  onChange={(e) => setCallToNumber(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Enter the number to call in E.164 format or with area code</p>
              </div>

              <div className="space-y-2">
                <Label>Agent</Label>
                <Select value={callAgentId} onValueChange={setCallAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Array.isArray(agentsData) ? agentsData : []).map((agent: any) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>From Number (optional)</Label>
                <Select value={callFromNumberId} onValueChange={setCallFromNumberId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Auto-select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-select</SelectItem>
                    {orgPhoneNumbers?.map((num) => (
                      <SelectItem key={num.id} value={num.id}>
                        {num.number} {num.label ? `(${num.label})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {callStatus === 'failed' && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-sm text-red-600">Call failed. Check the number and try again.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 flex flex-col items-center gap-4">
              {callStatus === 'dialing' && (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-lg font-medium">Dialing...</p>
                  <p className="text-sm text-muted-foreground font-mono">{callToNumber}</p>
                </>
              )}
              {callStatus === 'ringing' && (
                <>
                  <Phone className="h-10 w-10 text-green-500 animate-pulse" />
                  <p className="text-lg font-medium text-green-600">Call Initiated!</p>
                  <p className="text-sm text-muted-foreground font-mono">{callToNumber}</p>
                  <p className="text-xs text-muted-foreground">The agent is now handling the call.</p>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            {(callStatus === 'idle' || callStatus === 'failed') && (
              <>
                <Button variant="outline" onClick={() => { setMakeCallOpen(false); resetCallDialog() }}>
                  Cancel
                </Button>
                <Button
                  onClick={handleMakeCall}
                  disabled={!callToNumber.trim() || !callAgentId || makeCallMutation.isPending}
                >
                  {makeCallMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calling...</>
                  ) : (
                    <><PhoneOutgoing className="mr-2 h-4 w-4" /> Call Now</>
                  )}
                </Button>
              </>
            )}
            {callStatus === 'ringing' && (
              <Button variant="outline" onClick={() => { setMakeCallOpen(false); resetCallDialog() }}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pagination */}
      {callsData?.pagination && callsData.pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {callsData.pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= callsData.pagination.totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

function RecordingPlayer({ callId, token }: { callId: string; token: string | null }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let revoke: string | null = null

    async function fetchAudio() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`${API_URL}/calls/${callId}/recording?token=${token}`)
        if (!res.ok) {
          throw new Error(`Failed to load recording (${res.status})`)
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        revoke = url
        setBlobUrl(url)
      } catch (e: any) {
        console.error('Recording fetch error:', e)
        setError(e.message || 'Failed to load recording')
      } finally {
        setLoading(false)
      }
    }

    if (token) fetchAudio()

    return () => {
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [callId, token])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading recording...
      </div>
    )
  }

  if (error || !blobUrl) {
    return <p className="text-destructive text-sm p-4">{error || 'Recording not available'}</p>
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-muted rounded-lg">
        <audio controls className="w-full" src={blobUrl}>
          Your browser does not support the audio element.
        </audio>
      </div>
      <Button variant="outline" asChild>
        <a href={blobUrl} download={`recording-${callId}.mp3`}>
          <Download className="mr-2 h-4 w-4" />
          Download Recording
        </a>
      </Button>
    </div>
  )
}
