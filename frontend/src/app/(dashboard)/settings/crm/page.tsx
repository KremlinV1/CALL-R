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
  Check,
  X,
  RefreshCw,
  Plug,
  Trash2,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useAuthStore } from "@/stores/auth-store"
import axios from "axios"
import Link from "next/link"
import { format } from "date-fns"

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`

interface CrmIntegration {
  id: string
  provider: string
  name: string
  instanceUrl: string | null
  accountName: string | null
  syncContacts: boolean
  syncCalls: boolean
  syncAppointments: boolean
  autoCreateContacts: boolean
  autoLogCalls: boolean
  isActive: boolean
  lastSyncAt: string | null
  lastSyncStatus: string | null
  lastSyncError: string | null
  createdAt: string
}

const providerConfig: Record<string, { label: string; color: string; logo: string; description: string }> = {
  salesforce: {
    label: "Salesforce",
    color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    logo: "SF",
    description: "Connect to Salesforce CRM for contact sync, call logging, and activity tracking.",
  },
  hubspot: {
    label: "HubSpot",
    color: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    logo: "HS",
    description: "Integrate with HubSpot CRM to sync contacts and automatically log call activities.",
  },
  pipedrive: {
    label: "Pipedrive",
    color: "bg-green-500/10 text-green-600 border-green-500/20",
    logo: "PD",
    description: "Connect Pipedrive to sync persons, log calls as activities, and manage deals.",
  },
}

export default function CrmSettingsPage() {
  const { token } = useAuthStore()
  const queryClient = useQueryClient()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState<CrmIntegration | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["crm-integrations"],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/crm`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data
    },
    enabled: !!token,
  })

  const integrations: CrmIntegration[] = data?.integrations || []

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`${API_URL}/crm/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-integrations"] })
      toast.success("Integration removed")
    },
    onError: () => toast.error("Failed to remove integration"),
  })

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await axios.post(`${API_URL}/crm/${id}/test`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data
    },
    onSuccess: (data) => {
      if (data.connected) {
        toast.success("Connection successful!")
      } else {
        toast.error("Connection failed — check credentials")
      }
    },
    onError: () => toast.error("Connection test failed"),
  })

  const syncMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await axios.post(`${API_URL}/crm/${id}/sync-contacts`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["crm-integrations"] })
      const r = data.result
      toast.success(`Sync complete: ${r.created} created, ${r.updated} updated, ${r.failed} failed`)
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || "Sync failed"),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await axios.put(`${API_URL}/crm/${id}`, data, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-integrations"] })
      toast.success("Settings updated")
    },
    onError: () => toast.error("Failed to update settings"),
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
            <h1 className="text-3xl font-bold tracking-tight">CRM Integrations</h1>
          </div>
          <p className="text-muted-foreground">
            Connect your CRM to sync contacts, log calls, and track activities automatically.
          </p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Integration
        </Button>
      </div>

      {/* Available CRM providers */}
      {integrations.length === 0 && !isLoading && (
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(providerConfig).map(([key, config]) => (
            <Card key={key} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setIsAddOpen(true)}>
              <CardContent className="p-6 text-center">
                <div className={`mx-auto w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold mb-3 ${config.color}`}>
                  {config.logo}
                </div>
                <h3 className="font-semibold">{config.label}</h3>
                <p className="text-xs text-muted-foreground mt-1">{config.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Connected integrations */}
      {integrations.length > 0 && (
        <div className="space-y-4">
          {integrations.map((integration) => {
            const config = providerConfig[integration.provider] || { label: integration.provider, color: "", logo: "?", description: "" }
            return (
              <Card key={integration.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${config.color}`}>
                        {config.logo}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{integration.name}</CardTitle>
                        <CardDescription>
                          {config.label}
                          {integration.accountName && ` • ${integration.accountName}`}
                          {integration.instanceUrl && ` • ${integration.instanceUrl}`}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={integration.isActive ? "default" : "secondary"}>
                        {integration.isActive ? "Active" : "Inactive"}
                      </Badge>
                      {integration.lastSyncStatus && (
                        <Badge variant="outline" className={
                          integration.lastSyncStatus === 'success' ? 'text-green-600' :
                          integration.lastSyncStatus === 'error' ? 'text-red-600' : ''
                        }>
                          {integration.lastSyncStatus === 'success' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                          {integration.lastSyncStatus === 'error' && <AlertCircle className="h-3 w-3 mr-1" />}
                          Last sync: {integration.lastSyncAt ? format(new Date(integration.lastSyncAt), "MMM d, h:mm a") : "Never"}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Sync toggles */}
                    <div className="grid grid-cols-5 gap-4">
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <Label className="text-xs">Sync Contacts</Label>
                        <Switch
                          checked={integration.syncContacts}
                          onCheckedChange={(checked) => updateMutation.mutate({
                            id: integration.id, data: { syncContacts: checked }
                          })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <Label className="text-xs">Sync Calls</Label>
                        <Switch
                          checked={integration.syncCalls}
                          onCheckedChange={(checked) => updateMutation.mutate({
                            id: integration.id, data: { syncCalls: checked }
                          })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <Label className="text-xs">Auto-Create</Label>
                        <Switch
                          checked={integration.autoCreateContacts}
                          onCheckedChange={(checked) => updateMutation.mutate({
                            id: integration.id, data: { autoCreateContacts: checked }
                          })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <Label className="text-xs">Auto-Log Calls</Label>
                        <Switch
                          checked={integration.autoLogCalls}
                          onCheckedChange={(checked) => updateMutation.mutate({
                            id: integration.id, data: { autoLogCalls: checked }
                          })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <Label className="text-xs">Appointments</Label>
                        <Switch
                          checked={integration.syncAppointments}
                          onCheckedChange={(checked) => updateMutation.mutate({
                            id: integration.id, data: { syncAppointments: checked }
                          })}
                        />
                      </div>
                    </div>

                    {/* Error display */}
                    {integration.lastSyncError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-600">
                        <AlertCircle className="h-4 w-4 inline mr-2" />
                        {integration.lastSyncError}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testMutation.mutate(integration.id)}
                        disabled={testMutation.isPending}
                      >
                        {testMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plug className="mr-2 h-3.5 w-3.5" />}
                        Test Connection
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => syncMutation.mutate(integration.id)}
                        disabled={syncMutation.isPending}
                      >
                        {syncMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
                        Sync Now
                      </Button>
                      <div className="flex-1" />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                        onClick={() => {
                          if (confirm("Remove this CRM integration?")) {
                            deleteMutation.mutate(integration.id)
                          }
                        }}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {/* Add more */}
          <Button variant="outline" className="w-full" onClick={() => setIsAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Another Integration
          </Button>
        </div>
      )}

      {/* Add Integration Dialog */}
      <AddCrmDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        token={token}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["crm-integrations"] })}
      />
    </div>
  )
}

// ─── Add CRM Integration Dialog ─────────────────────────────────────

function AddCrmDialog({ open, onOpenChange, token, onCreated }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string | null
  onCreated: () => void
}) {
  const [provider, setProvider] = useState("")
  const [name, setName] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [instanceUrl, setInstanceUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!token || !provider || !name) return
    setSubmitting(true)
    try {
      await axios.post(`${API_URL}/crm`, {
        provider,
        name,
        accessToken: accessToken || undefined,
        apiKey: apiKey || undefined,
        instanceUrl: instanceUrl || undefined,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      toast.success("CRM integration added!")
      onCreated()
      onOpenChange(false)
      setProvider(""); setName(""); setAccessToken(""); setApiKey(""); setInstanceUrl("")
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to add integration")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add CRM Integration</DialogTitle>
          <DialogDescription>Connect a CRM to sync contacts and log calls</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>CRM Provider *</Label>
            <Select value={provider} onValueChange={(v) => {
              setProvider(v)
              if (!name) {
                setName(providerConfig[v]?.label || v)
              }
            }}>
              <SelectTrigger><SelectValue placeholder="Select provider..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="salesforce">Salesforce</SelectItem>
                <SelectItem value="hubspot">HubSpot</SelectItem>
                <SelectItem value="pipedrive">Pipedrive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Integration Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Production Salesforce" />
          </div>

          {provider === 'salesforce' && (
            <>
              <div className="space-y-2">
                <Label>Instance URL *</Label>
                <Input
                  value={instanceUrl}
                  onChange={e => setInstanceUrl(e.target.value)}
                  placeholder="https://yourorg.my.salesforce.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Access Token</Label>
                <Input
                  type="password"
                  value={accessToken}
                  onChange={e => setAccessToken(e.target.value)}
                  placeholder="OAuth access token"
                />
                <p className="text-xs text-muted-foreground">Get this from Salesforce Connected App OAuth flow</p>
              </div>
            </>
          )}

          {provider === 'hubspot' && (
            <div className="space-y-2">
              <Label>Access Token</Label>
              <Input
                type="password"
                value={accessToken}
                onChange={e => setAccessToken(e.target.value)}
                placeholder="HubSpot private app token"
              />
              <p className="text-xs text-muted-foreground">Create a private app in HubSpot to get an access token</p>
            </div>
          )}

          {provider === 'pipedrive' && (
            <div className="space-y-2">
              <Label>API Token</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Pipedrive API token"
              />
              <p className="text-xs text-muted-foreground">Find this in Pipedrive → Settings → Personal preferences → API</p>
            </div>
          )}

          {provider && (
            <div className="text-xs text-muted-foreground bg-blue-500/10 border border-blue-500/20 rounded p-3">
              <strong>Note:</strong> In production, use OAuth 2.0 for secure authentication. API tokens shown here are for development/testing.
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !provider || !name}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
