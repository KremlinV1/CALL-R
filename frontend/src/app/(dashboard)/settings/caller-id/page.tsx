"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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
  Phone,
  Shield,
  ShieldAlert,
  Star,
  ArrowLeft,
  Hash,
  Users,
  Megaphone,
  MapPin,
} from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useAuthStore } from "@/stores/auth-store"
import axios from "axios"
import Link from "next/link"

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`

interface CallerIdProfile {
  id: string
  name: string
  displayNumber: string
  displayName: string | null
  mode: string
  isDefault: boolean
  agentIds: string[]
  campaignIds: string[]
  matchAreaCodes: string[]
  priority: number
  usageCount: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export default function CallerIdSettingsPage() {
  const { token } = useAuthStore()
  const queryClient = useQueryClient()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<CallerIdProfile | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["caller-id-profiles"],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/caller-id`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data
    },
    enabled: !!token,
  })

  const profiles: CallerIdProfile[] = data?.profiles || []

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`${API_URL}/caller-id/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["caller-id-profiles"] })
      toast.success("Profile removed")
    },
    onError: () => toast.error("Failed to remove profile"),
  })

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      await axios.post(`${API_URL}/caller-id/${id}/set-default`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["caller-id-profiles"] })
      toast.success("Default caller ID updated")
    },
    onError: () => toast.error("Failed to set default"),
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
            <h1 className="text-3xl font-bold tracking-tight">Caller ID</h1>
          </div>
          <p className="text-muted-foreground">
            Configure which number appears on outbound calls. Use owned numbers or spoof custom numbers.
          </p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Caller ID
        </Button>
      </div>

      {/* Info card */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-blue-600 mb-1">How Caller ID Works</p>
              <ul className="space-y-1 text-muted-foreground">
                <li><strong>Owned mode</strong> — Uses a number you own on your telephony provider. Fully compliant and recommended.</li>
                <li><strong>Custom mode</strong> — Spoofs any number as the caller ID. The recipient sees whatever number you set. Use responsibly.</li>
                <li><strong>Area-code matching</strong> — Automatically selects a local number when calling a specific area code.</li>
                <li><strong>Priority</strong> — When multiple profiles match, the highest priority wins.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && profiles.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Phone className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No caller ID profiles</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add a caller ID to control what number recipients see on outbound calls
            </p>
            <Button onClick={() => setIsAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Caller ID
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Profile list */}
      {profiles.length > 0 && (
        <div className="space-y-4">
          {profiles.map((profile) => (
            <Card key={profile.id} className={profile.isDefault ? "border-primary/30" : ""}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      profile.mode === "custom"
                        ? "bg-orange-500/10 text-orange-600"
                        : "bg-green-500/10 text-green-600"
                    }`}>
                      {profile.mode === "custom" ? <ShieldAlert className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{profile.name}</h3>
                        {profile.isDefault && (
                          <Badge className="bg-primary/10 text-primary border-primary/20">
                            <Star className="h-3 w-3 mr-1" /> Default
                          </Badge>
                        )}
                        <Badge variant="outline" className={
                          profile.mode === "custom"
                            ? "bg-orange-500/10 text-orange-600 border-orange-500/20"
                            : "bg-green-500/10 text-green-600 border-green-500/20"
                        }>
                          {profile.mode === "custom" ? "Spoofed" : "Owned"}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1 font-mono">
                          <Phone className="h-3.5 w-3.5" />
                          {profile.displayNumber}
                        </span>
                        {profile.displayName && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {profile.displayName}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Hash className="h-3.5 w-3.5" />
                          Used {profile.usageCount} times
                        </span>
                        <span>Priority: {profile.priority}</span>
                      </div>

                      {/* Scoping tags */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(profile.matchAreaCodes as string[]).length > 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            <MapPin className="h-2.5 w-2.5 mr-0.5" />
                            Area codes: {(profile.matchAreaCodes as string[]).join(", ")}
                          </Badge>
                        )}
                        {(profile.agentIds as string[]).length > 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            <Users className="h-2.5 w-2.5 mr-0.5" />
                            {(profile.agentIds as string[]).length} agent(s)
                          </Badge>
                        )}
                        {(profile.campaignIds as string[]).length > 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            <Megaphone className="h-2.5 w-2.5 mr-0.5" />
                            {(profile.campaignIds as string[]).length} campaign(s)
                          </Badge>
                        )}
                        {(profile.matchAreaCodes as string[]).length === 0 &&
                         (profile.agentIds as string[]).length === 0 &&
                         (profile.campaignIds as string[]).length === 0 && (
                          <span className="text-[10px] text-muted-foreground italic">All agents & campaigns</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!profile.isDefault && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDefaultMutation.mutate(profile.id)}
                        disabled={setDefaultMutation.isPending}
                      >
                        <Star className="mr-1 h-3.5 w-3.5" /> Set Default
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingProfile(profile)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                      onClick={() => {
                        if (confirm("Remove this caller ID profile?")) deleteMutation.mutate(profile.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <CallerIdDialog
        open={isAddOpen || !!editingProfile}
        onOpenChange={(open) => {
          if (!open) { setIsAddOpen(false); setEditingProfile(null) }
        }}
        token={token}
        existing={editingProfile}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["caller-id-profiles"] })
          setIsAddOpen(false)
          setEditingProfile(null)
        }}
      />
    </div>
  )
}

// ─── Add/Edit Dialog ────────────────────────────────────────────────

function CallerIdDialog({ open, onOpenChange, token, existing, onSaved }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string | null
  existing: CallerIdProfile | null
  onSaved: () => void
}) {
  const isEdit = !!existing

  const [name, setName] = useState(existing?.name || "")
  const [displayNumber, setDisplayNumber] = useState(existing?.displayNumber || "")
  const [displayName, setDisplayName] = useState(existing?.displayName || "")
  const [mode, setMode] = useState(existing?.mode || "owned")
  const [isDefault, setIsDefault] = useState(existing?.isDefault || false)
  const [matchAreaCodes, setMatchAreaCodes] = useState(
    (existing?.matchAreaCodes || []).join(", ")
  )
  const [priority, setPriority] = useState(String(existing?.priority || 0))
  const [submitting, setSubmitting] = useState(false)

  // Reset form when existing changes
  const existingId = existing?.id
  useState(() => {
    if (existing) {
      setName(existing.name)
      setDisplayNumber(existing.displayNumber)
      setDisplayName(existing.displayName || "")
      setMode(existing.mode)
      setIsDefault(existing.isDefault)
      setMatchAreaCodes((existing.matchAreaCodes || []).join(", "))
      setPriority(String(existing.priority))
    } else {
      setName(""); setDisplayNumber(""); setDisplayName(""); setMode("owned")
      setIsDefault(false); setMatchAreaCodes(""); setPriority("0")
    }
  })

  const handleSubmit = async () => {
    if (!token || !name || !displayNumber) return
    setSubmitting(true)

    const areaCodes = matchAreaCodes
      .split(",")
      .map(s => s.trim())
      .filter(s => s.length > 0)

    const body = {
      name,
      displayNumber,
      displayName: displayName || null,
      mode,
      isDefault,
      matchAreaCodes: areaCodes,
      priority: parseInt(priority) || 0,
    }

    try {
      if (isEdit && existing) {
        await axios.put(`${API_URL}/caller-id/${existing.id}`, body, {
          headers: { Authorization: `Bearer ${token}` },
        })
        toast.success("Caller ID updated")
      } else {
        await axios.post(`${API_URL}/caller-id`, body, {
          headers: { Authorization: `Bearer ${token}` },
        })
        toast.success("Caller ID created")
      }
      onSaved()
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit" : "Add"} Caller ID Profile</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update caller ID settings" : "Configure a number to display on outbound calls"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Profile Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Main Office, Local Sales" />
          </div>

          <div className="space-y-2">
            <Label>Display Number * <span className="text-xs text-muted-foreground">(shown to recipient)</span></Label>
            <Input value={displayNumber} onChange={e => setDisplayNumber(e.target.value)} placeholder="+12125551234" />
          </div>

          <div className="space-y-2">
            <Label>Display Name <span className="text-xs text-muted-foreground">(CNAM, if supported)</span></Label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Acme Corp" />
          </div>

          <div className="space-y-2">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="owned">
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-green-500" />
                    Owned — Number you own on your provider
                  </div>
                </SelectItem>
                <SelectItem value="custom">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-3.5 w-3.5 text-orange-500" />
                    Custom — Spoof any number (recipient sees this)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            {mode === "custom" && (
              <p className="text-xs text-orange-600 bg-orange-500/10 p-2 rounded">
                ⚠ Custom/spoofed caller ID may not work with all carriers and may violate regulations in some jurisdictions. Use responsibly.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Match Area Codes <span className="text-xs text-muted-foreground">(comma-separated, auto-selects for matching destinations)</span></Label>
            <Input value={matchAreaCodes} onChange={e => setMatchAreaCodes(e.target.value)} placeholder="212, 310, 415" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Input type="number" value={priority} onChange={e => setPriority(e.target.value)} placeholder="0" />
              <p className="text-[10px] text-muted-foreground">Higher = preferred when multiple match</p>
            </div>
            <div className="space-y-2">
              <Label>Set as Default</Label>
              <div className="flex items-center gap-2 pt-1">
                <Switch checked={isDefault} onCheckedChange={setIsDefault} />
                <span className="text-sm text-muted-foreground">{isDefault ? "Yes" : "No"}</span>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !name || !displayNumber}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save Changes" : "Add Caller ID"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
