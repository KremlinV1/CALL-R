"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Checkbox } from "@/components/ui/checkbox"
import { DialogFooter } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Megaphone,
  Plus,
  Search,
  MoreVertical,
  Play,
  Pause,
  Copy,
  Trash2,
  Upload,
  Calendar,
  Clock,
  Phone,
  Users,
  CheckCircle,
  XCircle,
  Voicemail,
  TrendingUp,
  Loader2,
  UserPlus,
} from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuthStore } from "@/stores/auth-store"
import axios from "axios"
import { format } from "date-fns"
import { toast } from "sonner"

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`

interface Campaign {
  id: string
  organizationId: string
  agentId: string
  agentName?: string
  name: string
  description?: string
  status: string
  scheduledStartAt?: string
  startedAt?: string
  completedAt?: string
  scheduleType?: string
  recurringPattern?: string
  recurringDays?: number[]
  timeWindowStart?: string
  timeWindowEnd?: string
  timezone?: string
  callsPerMinute?: number
  maxConcurrentCalls?: number
  voicemailAction?: string
  totalContacts: number
  completedCalls: number
  connectedCalls: number
  voicemailCalls: number
  failedCalls: number
  createdAt: string
}

interface Agent {
  id: string
  name: string
}

interface Contact {
  id: string
  firstName?: string
  lastName?: string
  phone: string
}

export default function CampaignsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isAddContactsDialogOpen, setIsAddContactsDialogOpen] = useState(false)
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([])
  
  // Form state
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    description: "",
    agentId: "",
    contactListId: "",
    phoneNumberPoolId: "",
    singlePhoneNumber: "",
    scheduleType: "immediate",
    scheduledStartAt: "",
    recurringPattern: "",
    recurringDays: [] as number[],
    timeWindowStart: "09:00",
    timeWindowEnd: "17:00",
    timezone: "America/New_York",
    callsPerMinute: 10,
    maxConcurrentCalls: 5,
    voicemailAction: "leave_message",
  })
  
  const { token } = useAuthStore()
  const queryClient = useQueryClient()

  // Fetch campaigns
  const { data: campaignsData, isLoading: isLoadingCampaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/campaigns`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data.campaigns as Campaign[]
    },
    enabled: !!token,
  })

  // Fetch agents for dropdown
  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/agents`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return (response.data.agents || []) as Agent[]
    },
    enabled: !!token,
  })

  // Fetch phone pools for dropdown
  const { data: phonePoolsData } = useQuery({
    queryKey: ["phone-pools"],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/phone-pools`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data.pools || []
    },
    enabled: !!token,
  })

  // Fetch contact lists for dropdown
  const { data: contactListsData } = useQuery({
    queryKey: ["contact-lists"],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/contact-lists`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data.lists || []
    },
    enabled: !!token,
  })

  // Fetch contacts for adding to campaign
  const { data: contactsData } = useQuery({
    queryKey: ["contacts-for-campaign"],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/contacts?limit=1000`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return (response.data.contacts || []) as Contact[]
    },
    enabled: !!token && isAddContactsDialogOpen,
  })

  const campaigns = campaignsData || []
  const agents = agentsData || []
  const contacts = contactsData || []

  // Create campaign mutation
  const createCampaignMutation = useMutation({
    mutationFn: async (data: typeof newCampaign) => {
      // Clean empty strings to undefined so optional UUID fields pass Zod validation
      const cleaned = {
        ...data,
        contactListId: data.contactListId || undefined,
        phoneNumberPoolId: data.phoneNumberPoolId || undefined,
        singlePhoneNumber: data.singlePhoneNumber || undefined,
        description: data.description || undefined,
        scheduledStartAt: data.scheduledStartAt || undefined,
        recurringPattern: data.recurringPattern || undefined,
        recurringDays: data.recurringDays?.length ? data.recurringDays : undefined,
        timeWindowStart: data.timeWindowStart || undefined,
        timeWindowEnd: data.timeWindowEnd || undefined,
      }
      const response = await axios.post(`${API_URL}/campaigns`, cleaned, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data.campaign
    },
    onSuccess: () => {
      toast.success("Campaign created successfully")
      queryClient.invalidateQueries({ queryKey: ["campaigns"] })
      setIsCreateDialogOpen(false)
      setNewCampaign({
        name: "",
        description: "",
        agentId: "",
        contactListId: "",
        phoneNumberPoolId: "",
        singlePhoneNumber: "",
        scheduleType: "immediate",
        scheduledStartAt: "",
        recurringPattern: "",
        recurringDays: [] as number[],
        timeWindowStart: "09:00",
        timeWindowEnd: "17:00",
        timezone: "America/New_York",
        callsPerMinute: 10,
        maxConcurrentCalls: 5,
        voicemailAction: "leave_message",
      })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to create campaign")
    },
  })

  // Add contacts mutation
  const addContactsMutation = useMutation({
    mutationFn: async ({ campaignId, contactIds }: { campaignId: string; contactIds: string[] }) => {
      const response = await axios.post(
        `${API_URL}/campaigns/${campaignId}/contacts`,
        { contactIds },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      return response.data
    },
    onSuccess: (data) => {
      toast.success(`Added ${data.added} contacts to campaign`)
      queryClient.invalidateQueries({ queryKey: ["campaigns"] })
      setIsAddContactsDialogOpen(false)
      setSelectedContactIds([])
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to add contacts")
    },
  })

  // Start campaign mutation
  const startCampaignMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await axios.post(
        `${API_URL}/campaigns/${campaignId}/start`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      )
      return response.data.campaign
    },
    onSuccess: () => {
      toast.success("Campaign started")
      queryClient.invalidateQueries({ queryKey: ["campaigns"] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to start campaign")
    },
  })

  // Pause campaign mutation
  const pauseCampaignMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await axios.post(
        `${API_URL}/campaigns/${campaignId}/pause`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      )
      return response.data.campaign
    },
    onSuccess: () => {
      toast.success("Campaign paused")
      queryClient.invalidateQueries({ queryKey: ["campaigns"] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to pause campaign")
    },
  })

  // Delete campaign mutation
  const deleteCampaignMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      await axios.delete(`${API_URL}/campaigns/${campaignId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    onSuccess: () => {
      toast.success("Campaign deleted")
      queryClient.invalidateQueries({ queryKey: ["campaigns"] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to delete campaign")
    },
  })

  const filteredCampaigns = campaigns.filter((campaign) =>
    campaign.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Stats calculations
  const activeCampaigns = campaigns.filter(c => c.status === "running").length
  const totalContacts = campaigns.reduce((sum, c) => sum + (c.totalContacts || 0), 0)
  const totalCompleted = campaigns.reduce((sum, c) => sum + (c.completedCalls || 0), 0)
  const totalConnected = campaigns.reduce((sum, c) => sum + (c.connectedCalls || 0), 0)
  const avgSuccessRate = totalCompleted > 0 ? Math.round((totalConnected / totalCompleted) * 100) : 0

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "default"
      case "scheduled":
        return "secondary"
      case "paused":
        return "outline"
      case "completed":
        return "default"
      default:
        return "secondary"
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground">
            Manage your batch calling campaigns
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Create New Campaign</DialogTitle>
              <DialogDescription>
                Set up a batch calling campaign with your contacts
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4 overflow-y-auto flex-1 pr-2">
              <div className="space-y-2">
                <Label htmlFor="campaign-name">Campaign Name *</Label>
                <Input 
                  id="campaign-name" 
                  placeholder="e.g., Q4 Sales Outreach"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input 
                  placeholder="Campaign description"
                  value={newCampaign.description}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Select Agent *</Label>
                <Select 
                  value={newCampaign.agentId} 
                  onValueChange={(v) => setNewCampaign(prev => ({ ...prev, agentId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.length === 0 ? (
                      <SelectItem value="none" disabled>No agents available</SelectItem>
                    ) : (
                      agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Contact List Selection */}
              <div className="space-y-2">
                <Label>Contact List</Label>
                <Select 
                  value={newCampaign.contactListId || "none"} 
                  onValueChange={(v) => {
                    if (v === "none") {
                      setNewCampaign(prev => ({ ...prev, contactListId: "" }))
                    } else {
                      setNewCampaign(prev => ({ ...prev, contactListId: v }))
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select contact list (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No List (Add contacts manually)</SelectItem>
                    {contactListsData?.map((list: any) => (
                      <SelectItem key={list.id} value={list.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: list.color }}
                          />
                          {list.name} ({list.contactCount} contacts)
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {newCampaign.contactListId 
                    ? "All contacts from this list will be automatically added to the campaign"
                    : "You can add contacts manually after creating the campaign"
                  }
                </p>
              </div>

              {/* Phone Number Selection */}
              <div className="space-y-2">
                <Label>Phone Numbers</Label>
                <Select 
                  value={newCampaign.phoneNumberPoolId || "single"} 
                  onValueChange={(v) => {
                    if (v === "single") {
                      setNewCampaign(prev => ({ ...prev, phoneNumberPoolId: "", singlePhoneNumber: "" }))
                    } else {
                      setNewCampaign(prev => ({ ...prev, phoneNumberPoolId: v, singlePhoneNumber: "" }))
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Use default number" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single Number (Default)</SelectItem>
                    {phonePoolsData?.map((pool: any) => (
                      <SelectItem key={pool.id} value={pool.id}>
                        📞 {pool.name} ({pool.activeNumbers} numbers)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {newCampaign.phoneNumberPoolId 
                    ? "Using phone number pool for rotation (prevents spam flagging)"
                    : "Using default phone number from settings"
                  }
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Calls Per Minute</Label>
                  <Input 
                    type="number" 
                    value={newCampaign.callsPerMinute}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, callsPerMinute: parseInt(e.target.value) || 10 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Concurrent Calls</Label>
                  <Input 
                    type="number" 
                    value={newCampaign.maxConcurrentCalls}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, maxConcurrentCalls: parseInt(e.target.value) || 5 }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Voicemail Action</Label>
                <Select 
                  value={newCampaign.voicemailAction}
                  onValueChange={(v) => setNewCampaign(prev => ({ ...prev, voicemailAction: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="What to do on voicemail" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hangup">Hang up</SelectItem>
                    <SelectItem value="leave_message">Leave message</SelectItem>
                    <SelectItem value="llm_message">LLM-generated message</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Scheduling Section */}
              <div className="border-t pt-4 space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Schedule Settings
                </h3>
                
                <div className="space-y-2">
                  <Label>Schedule Type</Label>
                  <Select 
                    value={newCampaign.scheduleType}
                    onValueChange={(v) => setNewCampaign(prev => ({ ...prev, scheduleType: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">Start Immediately</SelectItem>
                      <SelectItem value="scheduled">Schedule for Later</SelectItem>
                      <SelectItem value="recurring">Recurring Schedule</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newCampaign.scheduleType === "scheduled" && (
                  <div className="space-y-2">
                    <Label>Start Date & Time</Label>
                    <Input 
                      type="datetime-local"
                      value={newCampaign.scheduledStartAt}
                      onChange={(e) => setNewCampaign(prev => ({ ...prev, scheduledStartAt: e.target.value }))}
                    />
                  </div>
                )}

                {newCampaign.scheduleType === "recurring" && (
                  <>
                    <div className="space-y-2">
                      <Label>Recurring Pattern</Label>
                      <Select 
                        value={newCampaign.recurringPattern}
                        onValueChange={(v) => setNewCampaign(prev => ({ ...prev, recurringPattern: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select pattern" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {newCampaign.recurringPattern === "weekly" && (
                      <div className="space-y-2">
                        <Label>Days of Week</Label>
                        <div className="flex gap-2 flex-wrap">
                          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, idx) => (
                            <div key={idx} className="flex items-center space-x-2">
                              <Checkbox
                                id={`day-${idx}`}
                                checked={newCampaign.recurringDays.includes(idx)}
                                onCheckedChange={(checked) => {
                                  setNewCampaign(prev => ({
                                    ...prev,
                                    recurringDays: checked
                                      ? [...prev.recurringDays, idx]
                                      : prev.recurringDays.filter(d => d !== idx)
                                  }))
                                }}
                              />
                              <Label htmlFor={`day-${idx}`} className="text-sm font-normal cursor-pointer">
                                {day}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {(newCampaign.scheduleType === "scheduled" || newCampaign.scheduleType === "recurring") && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Call Window Start</Label>
                        <Input 
                          type="time"
                          value={newCampaign.timeWindowStart}
                          onChange={(e) => setNewCampaign(prev => ({ ...prev, timeWindowStart: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Call Window End</Label>
                        <Input 
                          type="time"
                          value={newCampaign.timeWindowEnd}
                          onChange={(e) => setNewCampaign(prev => ({ ...prev, timeWindowEnd: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Timezone</Label>
                      <Select 
                        value={newCampaign.timezone}
                        onValueChange={(v) => setNewCampaign(prev => ({ ...prev, timezone: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                          <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                          <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                          <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                          <SelectItem value="America/Phoenix">Arizona (MST)</SelectItem>
                          <SelectItem value="America/Anchorage">Alaska (AKT)</SelectItem>
                          <SelectItem value="Pacific/Honolulu">Hawaii (HST)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>
            </div>
            <DialogFooter className="mt-4 flex-shrink-0">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => createCampaignMutation.mutate(newCampaign)}
                disabled={!newCampaign.name || !newCampaign.agentId || createCampaignMutation.isPending}
              >
                {createCampaignMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Campaign"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Add Contacts Dialog */}
      <Dialog open={isAddContactsDialogOpen} onOpenChange={setIsAddContactsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Contacts to Campaign</DialogTitle>
            <DialogDescription>
              Select contacts to add to this campaign
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 py-4">
            {contacts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No contacts available. Add contacts first.
              </p>
            ) : (
              contacts.map((contact) => (
                <div 
                  key={contact.id} 
                  className="flex items-center space-x-3 p-2 hover:bg-muted rounded-lg"
                >
                  <Checkbox
                    checked={selectedContactIds.includes(contact.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedContactIds(prev => [...prev, contact.id])
                      } else {
                        setSelectedContactIds(prev => prev.filter(id => id !== contact.id))
                      }
                    }}
                  />
                  <div className="flex-1">
                    <p className="font-medium">
                      {contact.firstName || ''} {contact.lastName || ''} 
                      {!contact.firstName && !contact.lastName && contact.phone}
                    </p>
                    <p className="text-sm text-muted-foreground">{contact.phone}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddContactsDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (selectedCampaignId) {
                  addContactsMutation.mutate({ 
                    campaignId: selectedCampaignId, 
                    contactIds: selectedContactIds 
                  })
                }
              }}
              disabled={selectedContactIds.length === 0 || addContactsMutation.isPending}
            >
              {addContactsMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                `Add ${selectedContactIds.length} Contacts`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCampaigns}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Contacts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalContacts.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Calls Made
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCompleted.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{avgSuccessRate}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Campaigns List */}
      <div className="space-y-4">
        {isLoadingCampaigns ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg mb-2">No campaigns yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first batch calling campaign to get started
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Campaign
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredCampaigns.map((campaign) => {
            const progressPercent = campaign.totalContacts > 0 
              ? (campaign.completedCalls / campaign.totalContacts) * 100 
              : 0
            const successRate = campaign.completedCalls > 0 
              ? Math.round((campaign.connectedCalls / campaign.completedCalls) * 100) 
              : 0

            return (
              <Card key={campaign.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                        <Megaphone className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{campaign.name}</h3>
                          <Badge variant={getStatusColor(campaign.status)}>
                            {campaign.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Agent: {campaign.agentName || 'Unknown'} 
                          {campaign.startedAt && ` • Started: ${format(new Date(campaign.startedAt), 'MMM d, yyyy h:mm a')}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {campaign.status === "draft" && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSelectedCampaignId(campaign.id)
                            setSelectedContactIds([])
                            setIsAddContactsDialogOpen(true)
                          }}
                        >
                          <UserPlus className="mr-2 h-4 w-4" />
                          Add Contacts
                        </Button>
                      )}
                      {campaign.status === "running" ? (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => pauseCampaignMutation.mutate(campaign.id)}
                          disabled={pauseCampaignMutation.isPending}
                        >
                          <Pause className="mr-2 h-4 w-4" />
                          Pause
                        </Button>
                      ) : (campaign.status === "paused" || campaign.status === "draft" || campaign.status === "scheduled") && campaign.totalContacts > 0 ? (
                        <Button 
                          size="sm"
                          onClick={() => startCampaignMutation.mutate(campaign.id)}
                          disabled={startCampaignMutation.isPending}
                        >
                          <Play className="mr-2 h-4 w-4" />
                          {campaign.status === "paused" ? "Resume" : "Start"}
                        </Button>
                      ) : null}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedCampaignId(campaign.id)
                              setSelectedContactIds([])
                              setIsAddContactsDialogOpen(true)
                            }}
                            disabled={campaign.status === "running" || campaign.status === "completed"}
                          >
                            <UserPlus className="mr-2 h-4 w-4" />
                            Add Contacts
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => deleteCampaignMutation.mutate(campaign.id)}
                            disabled={campaign.status === "running"}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">
                        {(campaign.completedCalls || 0).toLocaleString()} / {(campaign.totalContacts || 0).toLocaleString()} calls
                      </span>
                    </div>
                    <Progress
                      value={progressPercent}
                      className="h-2"
                    />
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-5 gap-4">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="font-medium">{(campaign.totalContacts || 0).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">Connected</p>
                        <p className="font-medium">{(campaign.connectedCalls || 0).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Voicemail className="h-4 w-4 text-yellow-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">Voicemail</p>
                        <p className="font-medium">{(campaign.voicemailCalls || 0).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">Failed</p>
                        <p className="font-medium">{(campaign.failedCalls || 0).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Success Rate</p>
                        <p className="font-medium text-green-500">{successRate}%</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
