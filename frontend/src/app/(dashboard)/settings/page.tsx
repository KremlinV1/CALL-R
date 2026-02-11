"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Settings,
  User,
  Building,
  CreditCard,
  Phone,
  Key,
  Bell,
  Shield,
  Globe,
  Webhook,
  Plus,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react"
import { useState, useEffect, useMemo } from "react"
import { useAuthStore } from "@/stores/auth-store"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { toast } from "sonner"

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`

// Hook to get token with hydration safety
function useToken() {
  const storeToken = useAuthStore((state) => state.token)
  const [isHydrated, setIsHydrated] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  
  useEffect(() => {
    // Only run on client after hydration
    const storedToken = localStorage.getItem('token')
    setToken(storedToken || storeToken)
    setIsHydrated(true)
  }, [storeToken])
  
  return { token, isHydrated }
}

// AI Provider configuration
const AI_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', description: 'GPT models for LLM and Whisper for STT', placeholder: 'sk-...' },
  { id: 'anthropic', name: 'Anthropic', description: 'Claude models for LLM', placeholder: 'sk-ant-...' },
  { id: 'groq', name: 'Groq', description: 'Free & ultra-fast Llama/Mixtral models', placeholder: 'gsk_...' },
  { id: 'google', name: 'Google', description: 'Gemini models for LLM', placeholder: 'AIza...' },
  { id: 'deepgram', name: 'Deepgram', description: 'Speech-to-text transcription', placeholder: 'dg_...' },
  { id: 'cartesia', name: 'Cartesia', description: 'High-quality text-to-speech', placeholder: 'sk_car_...' },
  { id: 'elevenlabs', name: 'ElevenLabs', description: 'Natural voice synthesis', placeholder: 'xi_...' },
] as const

type AIProvider = typeof AI_PROVIDERS[number]['id']

interface ProviderStatus {
  provider: string
  configured: boolean
  keyPrefix: string | null
  lastVerifiedAt: string | null
  updatedAt: string | null
}

export default function SettingsPage() {
  const [showApiKey, setShowApiKey] = useState(false)
  const [configureDialogOpen, setConfigureDialogOpen] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  
  const { user, organization } = useAuthStore()
  const { token, isHydrated } = useToken() // Use hydration-safe token
  const queryClient = useQueryClient()

  // Fetch AI provider statuses - only when hydrated and token exists
  const { data: providerStatuses, isLoading: isLoadingProviders } = useQuery({
    queryKey: ['ai-providers'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/settings/ai-providers`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data.providers as ProviderStatus[]
    },
    enabled: isHydrated && !!token,
  })

  // Configure API key mutation
  const configureKeyMutation = useMutation({
    mutationFn: async ({ provider, apiKey }: { provider: string, apiKey: string }) => {
      const response = await axios.post(
        `${API_URL}/settings/ai-providers/${provider}`,
        { apiKey },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      return response.data
    },
    onSuccess: (data) => {
      toast.success(`API key configured successfully`)
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] })
      setConfigureDialogOpen(false)
      setApiKeyInput('')
      setSelectedProvider(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to configure API key')
    }
  })

  // Verify API key mutation
  const verifyKeyMutation = useMutation({
    mutationFn: async ({ provider, apiKey }: { provider: string, apiKey: string }) => {
      const response = await axios.post(
        `${API_URL}/settings/ai-providers/${provider}/verify`,
        { apiKey },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      return response.data
    },
  })

  // Delete API key mutation
  const deleteKeyMutation = useMutation({
    mutationFn: async (provider: string) => {
      const response = await axios.delete(
        `${API_URL}/settings/ai-providers/${provider}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      return response.data
    },
    onSuccess: () => {
      toast.success('API key removed')
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to remove API key')
    }
  })

  const handleOpenConfigureDialog = (providerId: AIProvider) => {
    setSelectedProvider(providerId)
    setApiKeyInput('')
    setShowKeyInput(false)
    setConfigureDialogOpen(true)
  }

  const handleVerifyAndSave = async () => {
    if (!selectedProvider || !apiKeyInput.trim()) return

    setIsVerifying(true)
    try {
      // First verify the key
      const verifyResult = await verifyKeyMutation.mutateAsync({
        provider: selectedProvider,
        apiKey: apiKeyInput.trim()
      })

      if (verifyResult.valid) {
        // Then save it
        await configureKeyMutation.mutateAsync({
          provider: selectedProvider,
          apiKey: apiKeyInput.trim()
        })
      } else {
        toast.error('API key verification failed. Please check your key.')
      }
    } catch (error: any) {
      // If verification fails but we want to save anyway
      const shouldSaveAnyway = confirm('API key verification failed. Save anyway?')
      if (shouldSaveAnyway) {
        await configureKeyMutation.mutateAsync({
          provider: selectedProvider,
          apiKey: apiKeyInput.trim()
        })
      }
    } finally {
      setIsVerifying(false)
    }
  }

  const getProviderStatus = (providerId: string): ProviderStatus | undefined => {
    return providerStatuses?.find(p => p.provider === providerId)
  }

  const selectedProviderConfig = AI_PROVIDERS.find(p => p.id === selectedProvider)

  // Show loading while hydrating
  if (!isHydrated) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Show message if not authenticated
  if (!token) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Please log in to access settings.</p>
        <a href="/login" className="text-primary underline">Go to Login</a>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and platform settings
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-flex">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="telephony">Telephony</TabsTrigger>
          <TabsTrigger value="api">API Keys</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        {/* Profile Settings */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" defaultValue={user?.firstName || ''} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" defaultValue={user?.lastName || ''} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" defaultValue={user?.email || ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input id="phone" defaultValue="+1 (555) 123-4567" />
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Manage your notification preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { id: "email-reports", label: "Email daily reports", checked: true },
                { id: "email-alerts", label: "Email critical alerts", checked: true },
                { id: "sms-alerts", label: "SMS alerts for failed campaigns", checked: false },
                { id: "browser", label: "Browser notifications", checked: true },
              ].map((item) => (
                <div key={item.id} className="flex items-center space-x-2">
                  <Checkbox id={item.id} defaultChecked={item.checked} />
                  <Label htmlFor={item.id} className="font-normal">{item.label}</Label>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Organization Settings */}
        <TabsContent value="organization" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Organization Details</CardTitle>
              <CardDescription>Manage your organization settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization Name</Label>
                <Input id="orgName" defaultValue={organization?.name || ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input id="website" defaultValue="https://acme.com" />
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select defaultValue="america-new-york">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="america-new-york">America/New_York (EST)</SelectItem>
                    <SelectItem value="america-los-angeles">America/Los_Angeles (PST)</SelectItem>
                    <SelectItem value="america-chicago">America/Chicago (CST)</SelectItem>
                    <SelectItem value="europe-london">Europe/London (GMT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Manage team access</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { name: "John Doe", email: "john@acme.com", role: "Owner" },
                  { name: "Jane Smith", email: "jane@acme.com", role: "Admin" },
                  { name: "Bob Johnson", email: "bob@acme.com", role: "Member" },
                ].map((member, i) => (
                  <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{member.name}</p>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                    <Badge variant={member.role === "Owner" ? "default" : "outline"}>
                      {member.role}
                    </Badge>
                  </div>
                ))}
                <Button variant="outline" className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Invite Team Member
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Telephony Settings */}
        <TelephonySettings token={token} isHydrated={isHydrated} />
        

        {/* API Keys */}
        <TabsContent value="api" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>Manage your API keys for programmatic access</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Production Key</p>
                    <p className="text-sm text-muted-foreground">Created Dec 1, 2024</p>
                  </div>
                  <Badge>Active</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={showApiKey ? "pk_live_abc123xyz789..." : "pk_live_••••••••••••••••"}
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Generate New Key
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI Provider Keys</CardTitle>
              <CardDescription>Configure your AI service API keys</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingProviders ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                AI_PROVIDERS.map((provider) => {
                  const status = getProviderStatus(provider.id)
                  const isConfigured = status?.configured ?? false
                  
                  return (
                    <div key={provider.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {isConfigured ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <Key className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium">{provider.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {isConfigured ? (
                              <span className="text-green-600">Configured • {status?.keyPrefix}</span>
                            ) : (
                              "Not configured"
                            )}
                          </p>
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleOpenConfigureDialog(provider.id)}
                      >
                        {isConfigured ? "Update" : "Configure"}
                      </Button>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configure API Key Dialog */}
        <Dialog open={configureDialogOpen} onOpenChange={setConfigureDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Configure {selectedProviderConfig?.name} API Key</DialogTitle>
              <DialogDescription>
                {selectedProviderConfig?.description}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <div className="relative">
                  <Input
                    id="apiKey"
                    type={showKeyInput ? "text" : "password"}
                    placeholder={selectedProviderConfig?.placeholder}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className="pr-10 font-mono"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowKeyInput(!showKeyInput)}
                  >
                    {showKeyInput ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground bg-muted p-3 rounded-lg">
                <p className="font-medium mb-1">Your key will be:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Encrypted before storage</li>
                  <li>Verified with the provider</li>
                  <li>Used by your AI agents automatically</li>
                </ul>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setConfigureDialogOpen(false)
                  setApiKeyInput('')
                  setSelectedProvider(null)
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleVerifyAndSave}
                disabled={!apiKeyInput.trim() || isVerifying || configureKeyMutation.isPending}
              >
                {isVerifying || configureKeyMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isVerifying ? 'Verifying...' : 'Saving...'}
                  </>
                ) : (
                  'Verify & Save'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Webhooks */}
        <TabsContent value="webhooks" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Webhooks</CardTitle>
              <CardDescription>Configure endpoints to receive real-time events</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { url: "https://api.acme.com/webhooks/calls", events: ["call.started", "call.ended"], active: true },
                { url: "https://api.acme.com/webhooks/campaigns", events: ["campaign.completed"], active: true },
              ].map((webhook, i) => (
                <div key={i} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium font-mono text-sm">{webhook.url}</p>
                      <div className="flex gap-1 mt-1">
                        {webhook.events.map((event) => (
                          <Badge key={event} variant="secondary" className="text-xs">
                            {event}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={webhook.active ? "default" : "secondary"}>
                        {webhook.active ? "Active" : "Inactive"}
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add Webhook
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing */}
        <TabsContent value="billing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>Manage your subscription</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg bg-primary/5">
                <div>
                  <p className="font-semibold text-lg">Pro Plan</p>
                  <p className="text-muted-foreground">$299/month • Billed monthly</p>
                </div>
                <Badge>Current Plan</Badge>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-4 border rounded-lg">
                  <p className="text-2xl font-bold">8,542</p>
                  <p className="text-sm text-muted-foreground">Calls this month</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-2xl font-bold">10,000</p>
                  <p className="text-sm text-muted-foreground">Call limit</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-2xl font-bold">85%</p>
                  <p className="text-sm text-muted-foreground">Usage</p>
                </div>
              </div>
              <Button variant="outline">Upgrade Plan</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment Method</CardTitle>
              <CardDescription>Manage your payment details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">•••• •••• •••• 4242</p>
                    <p className="text-sm text-muted-foreground">Expires 12/25</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">Update</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Telephony Settings Component
const TELEPHONY_PROVIDERS = [
  { id: 'twilio', name: 'Twilio', fields: ['accountSid', 'authToken'] },
  { id: 'telnyx', name: 'Telnyx', fields: ['apiKey'] },
  { id: 'vonage', name: 'Vonage', fields: ['accountSid', 'authToken'] },
  { id: 'signalwire', name: 'SignalWire', fields: ['accountSid', 'authToken', 'spaceUrl'] },
  { id: 'livekit_sip', name: 'LiveKit SIP', fields: ['sipUri'] },
  { id: 'vogent', name: 'Vogent', fields: ['apiKey', 'vogentBaseAgentId', 'vogentPhoneNumberId', 'vogentDefaultModelId'] },
] as const

type TelephonyProviderType = typeof TELEPHONY_PROVIDERS[number]['id']

interface TelephonyConfig {
  configured: boolean
  provider: TelephonyProviderType | null
  accountSidPrefix: string | null
  authTokenPrefix: string | null
  livekitSipUri: string | null
  signalwireSpaceUrl: string | null
  vogentBaseAgentId: string | null
  vogentPhoneNumberId: string | null
  vogentDefaultModelId: string | null
}

function TelephonySettings({ token, isHydrated }: { token: string | null; isHydrated: boolean }) {
  const [selectedProvider, setSelectedProvider] = useState<TelephonyProviderType>('twilio')
  const [accountSid, setAccountSid] = useState('')
  const [authToken, setAuthToken] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [sipUri, setSipUri] = useState('')
  const [spaceUrl, setSpaceUrl] = useState('')
  const [vogentBaseAgentId, setVogentBaseAgentId] = useState('')
  const [vogentPhoneNumberId, setVogentPhoneNumberId] = useState('')
  const [vogentDefaultModelId, setVogentDefaultModelId] = useState('')
  const [showAuthToken, setShowAuthToken] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  const queryClient = useQueryClient()

  // Fetch telephony configuration
  const { data: telephonyData, isLoading } = useQuery({
    queryKey: ['telephony-config'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/settings/telephony`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data as TelephonyConfig
    },
    enabled: isHydrated && !!token,
  })

  // Set form values when data loads
  useEffect(() => {
    if (telephonyData?.configured && telephonyData.provider) {
      setSelectedProvider(telephonyData.provider)
    }
  }, [telephonyData])

  // Save telephony configuration mutation
  const saveMutation = useMutation({
    mutationFn: async (data: {
      provider: TelephonyProviderType
      accountSid?: string
      authToken?: string
      apiKey?: string
      sipUri?: string
      spaceUrl?: string
      vogentBaseAgentId?: string
      vogentPhoneNumberId?: string
      vogentDefaultModelId?: string
    }) => {
      const response = await axios.post(
        `${API_URL}/settings/telephony`,
        data,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      return response.data
    },
    onSuccess: () => {
      toast.success('Telephony configuration saved successfully')
      queryClient.invalidateQueries({ queryKey: ['telephony-config'] })
      // Clear sensitive fields
      setAccountSid('')
      setAuthToken('')
      setApiKey('')
      setSipUri('')
      setSpaceUrl('')
      setVogentBaseAgentId('')
      setVogentPhoneNumberId('')
      setVogentDefaultModelId('')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to save telephony configuration')
    }
  })

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const data: any = { provider: selectedProvider }
      
      if (selectedProvider === 'twilio' || selectedProvider === 'vonage') {
        if (!accountSid || !authToken) {
          toast.error('Account SID and Auth Token are required')
          return
        }
        data.accountSid = accountSid
        data.authToken = authToken
      } else if (selectedProvider === 'telnyx') {
        if (!apiKey) {
          toast.error('API Key is required')
          return
        }
        data.apiKey = apiKey
      } else if (selectedProvider === 'signalwire') {
        if (!accountSid || !authToken || !spaceUrl) {
          toast.error('Project ID, API Token, and Space URL are required')
          return
        }
        data.accountSid = accountSid
        data.authToken = authToken
        data.spaceUrl = spaceUrl
      } else if (selectedProvider === 'livekit_sip') {
        if (!sipUri) {
          toast.error('SIP URI is required')
          return
        }
        data.sipUri = sipUri
      } else if (selectedProvider === 'vogent') {
        if (!apiKey) {
          toast.error('Vogent API Key is required')
          return
        }
        data.apiKey = apiKey
        if (vogentBaseAgentId) data.vogentBaseAgentId = vogentBaseAgentId
        if (vogentPhoneNumberId) data.vogentPhoneNumberId = vogentPhoneNumberId
        if (vogentDefaultModelId) data.vogentDefaultModelId = vogentDefaultModelId
      }

      await saveMutation.mutateAsync(data)
    } finally {
      setIsSaving(false)
    }
  }

  const providerConfig = TELEPHONY_PROVIDERS.find(p => p.id === selectedProvider)

  return (
    <TabsContent value="telephony" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Telephony Provider</CardTitle>
          <CardDescription>Configure your phone system integration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {telephonyData?.configured && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg mb-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-700">
                      {TELEPHONY_PROVIDERS.find(p => p.id === telephonyData.provider)?.name} configured
                    </span>
                  </div>
                  {telephonyData.accountSidPrefix && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Account: {telephonyData.accountSidPrefix}
                    </p>
                  )}
                </div>
              )}
              
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select 
                  value={selectedProvider} 
                  onValueChange={(v) => setSelectedProvider(v as TelephonyProviderType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TELEPHONY_PROVIDERS.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(selectedProvider === 'twilio' || selectedProvider === 'vonage') && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="accountSid">
                      {selectedProvider === 'twilio' ? 'Account SID' : 'API Key'}
                    </Label>
                    <Input
                      id="accountSid"
                      placeholder={selectedProvider === 'twilio' ? 'AC...' : 'Your API Key'}
                      value={accountSid}
                      onChange={(e) => setAccountSid(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="authToken">
                      {selectedProvider === 'twilio' ? 'Auth Token' : 'API Secret'}
                    </Label>
                    <div className="relative">
                      <Input
                        id="authToken"
                        type={showAuthToken ? 'text' : 'password'}
                        placeholder="••••••••••••••••"
                        value={authToken}
                        onChange={(e) => setAuthToken(e.target.value)}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowAuthToken(!showAuthToken)}
                      >
                        {showAuthToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {selectedProvider === 'signalwire' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="swSpaceUrl">Space URL</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="swSpaceUrl"
                        placeholder="myspace"
                        value={spaceUrl}
                        onChange={(e) => setSpaceUrl(e.target.value)}
                        className="flex-1"
                      />
                      <span className="text-sm text-muted-foreground">.signalwire.com</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Enter your SignalWire space name (without .signalwire.com)</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="swProjectId">Project ID</Label>
                    <Input
                      id="swProjectId"
                      placeholder="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
                      value={accountSid}
                      onChange={(e) => setAccountSid(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="swApiToken">API Token</Label>
                    <div className="relative">
                      <Input
                        id="swApiToken"
                        type={showAuthToken ? 'text' : 'password'}
                        placeholder="••••••••••••••••"
                        value={authToken}
                        onChange={(e) => setAuthToken(e.target.value)}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowAuthToken(!showAuthToken)}
                      >
                        {showAuthToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {selectedProvider === 'telnyx' && (
                <div className="space-y-2">
                  <Label htmlFor="telnyxApiKey">API Key</Label>
                  <div className="relative">
                    <Input
                      id="telnyxApiKey"
                      type={showAuthToken ? 'text' : 'password'}
                      placeholder="KEY..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowAuthToken(!showAuthToken)}
                    >
                      {showAuthToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}

              {selectedProvider === 'livekit_sip' && (
                <div className="space-y-2">
                  <Label htmlFor="sipUri">SIP URI</Label>
                  <Input
                    id="sipUri"
                    placeholder="sip:trunk@provider.com"
                    value={sipUri}
                    onChange={(e) => setSipUri(e.target.value)}
                  />
                </div>
              )}

              {selectedProvider === 'vogent' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="vogentApiKey">API Key</Label>
                    <div className="relative">
                      <Input
                        id="vogentApiKey"
                        type={showAuthToken ? 'text' : 'password'}
                        placeholder="vgnt_..."
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowAuthToken(!showAuthToken)}
                      >
                        {showAuthToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vogentBaseAgentId">Base Agent ID</Label>
                    <Input
                      id="vogentBaseAgentId"
                      placeholder="ag_..."
                      value={vogentBaseAgentId}
                      onChange={(e) => setVogentBaseAgentId(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">The Vogent agent template used for outbound calls</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vogentPhoneNumberId">Phone Number ID</Label>
                    <Input
                      id="vogentPhoneNumberId"
                      placeholder="pn_..."
                      value={vogentPhoneNumberId}
                      onChange={(e) => setVogentPhoneNumberId(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">The Vogent phone number resource ID for outbound caller ID</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vogentDefaultModelId">Default Model ID (optional)</Label>
                    <Input
                      id="vogentDefaultModelId"
                      placeholder="model_..."
                      value={vogentDefaultModelId}
                      onChange={(e) => setVogentDefaultModelId(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">AI model for Vogent agents (leave blank for default)</p>
                  </div>
                </>
              )}

              <Button onClick={handleSave} disabled={isSaving || saveMutation.isPending}>
                {isSaving || saveMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Configuration'
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Import Phone Numbers from Provider */}
      {telephonyData?.configured && telephonyData.provider && telephonyData.provider !== 'livekit_sip' && (
        <ProviderPhoneImport token={token} isHydrated={isHydrated} provider={telephonyData.provider} />
      )}

      {/* LiveKit Telephony Management */}
      <LiveKitTelephony token={token} isHydrated={isHydrated} />
    </TabsContent>
  )
}

// Generic Provider Phone Import Component
interface ProviderPhoneNumber {
  id: string
  number: string
  name: string | null
  capabilities: {
    voice: boolean
    sms: boolean
    mms: boolean
    fax: boolean
  }
  e164: string
  formatted: string
}

interface Agent {
  id: string
  name: string
  status: string
}

const PROVIDER_LABELS: Record<string, string> = {
  twilio: 'Twilio',
  vonage: 'Vonage',
  telnyx: 'Telnyx',
  signalwire: 'SignalWire',
  vogent: 'Vogent',
}

function ProviderPhoneImport({ token, isHydrated, provider }: { token: string | null; isHydrated: boolean; provider: string }) {
  const [selectedNumbers, setSelectedNumbers] = useState<string[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string>('')
  const [isImporting, setIsImporting] = useState(false)
  const queryClient = useQueryClient()

  const providerLabel = PROVIDER_LABELS[provider] || provider

  // Fetch phone numbers from the configured provider (generic endpoint)
  const { data: providerData, isLoading: isLoadingNumbers, refetch: refetchNumbers } = useQuery({
    queryKey: ['provider-phone-numbers', provider],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/settings/telephony/phone-numbers`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data as {
        success: boolean
        provider: string
        phoneNumbers: ProviderPhoneNumber[]
        total: number
      }
    },
    enabled: isHydrated && !!token,
    retry: false,
  })

  // Fetch agents for assignment
  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/agents`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data as Agent[]
    },
    enabled: isHydrated && !!token,
  })

  // Import mutation (generic endpoint)
  const importMutation = useMutation({
    mutationFn: async (numbers: ProviderPhoneNumber[]) => {
      const response = await axios.post(
        `${API_URL}/settings/telephony/import-numbers`,
        { numbers, agentId: selectedAgent || null },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      return response.data
    },
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported} phone number(s)`)
      if (data.failed > 0) {
        toast.warning(`${data.failed} number(s) failed to import`)
      }
      setSelectedNumbers([])
      setSelectedAgent('')
      queryClient.invalidateQueries({ queryKey: ['phone-numbers'] })
      refetchNumbers()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to import phone numbers')
    }
  })

  const handleToggleNumber = (numberId: string) => {
    setSelectedNumbers(prev => 
      prev.includes(numberId) 
        ? prev.filter(id => id !== numberId)
        : [...prev, numberId]
    )
  }

  const handleSelectAll = () => {
    if (providerData?.phoneNumbers) {
      if (selectedNumbers.length === providerData.phoneNumbers.length) {
        setSelectedNumbers([])
      } else {
        setSelectedNumbers(providerData.phoneNumbers.map(n => n.id))
      }
    }
  }

  const handleImport = async () => {
    if (selectedNumbers.length === 0) {
      toast.error('Please select at least one phone number')
      return
    }

    const numbersToImport = providerData?.phoneNumbers.filter(n => 
      selectedNumbers.includes(n.id)
    ) || []

    setIsImporting(true)
    try {
      await importMutation.mutateAsync(numbersToImport)
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Import from {providerLabel}
            </CardTitle>
            <CardDescription>
              Import phone numbers from your {providerLabel} account
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetchNumbers()}
            disabled={isLoadingNumbers}
          >
            {isLoadingNumbers ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Refresh'
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoadingNumbers ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Fetching numbers from {providerLabel}...</span>
          </div>
        ) : providerData?.phoneNumbers && providerData.phoneNumbers.length > 0 ? (
          <div className="space-y-4">
            {/* Select All & Agent Assignment */}
            <div className="flex items-center justify-between gap-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="selectAll"
                  checked={selectedNumbers.length === providerData.phoneNumbers.length}
                  onCheckedChange={handleSelectAll}
                />
                <Label htmlFor="selectAll" className="text-sm font-medium">
                  Select All ({providerData.phoneNumbers.length} numbers)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Assign to Agent:</Label>
                <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select agent (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No agent</SelectItem>
                    {agents?.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Phone Numbers List */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {providerData.phoneNumbers.map((num) => (
                <div 
                  key={num.id} 
                  className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedNumbers.includes(num.id) ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => handleToggleNumber(num.id)}
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedNumbers.includes(num.id)}
                      onCheckedChange={() => handleToggleNumber(num.id)}
                    />
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium font-mono">{num.formatted || num.number}</p>
                      {num.name && (
                        <p className="text-xs text-muted-foreground">{num.name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {num.capabilities.voice && (
                      <Badge variant="outline" className="text-xs">Voice</Badge>
                    )}
                    {num.capabilities.sms && (
                      <Badge variant="outline" className="text-xs">SMS</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Import Button */}
            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-sm text-muted-foreground">
                {selectedNumbers.length} number(s) selected
                {selectedAgent && agents && (
                  <span> → will be assigned to <strong>{agents.find(a => a.id === selectedAgent)?.name}</strong></span>
                )}
              </p>
              <Button 
                onClick={handleImport}
                disabled={selectedNumbers.length === 0 || isImporting}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Import Selected
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No phone numbers found in your {providerLabel} account</p>
            <p className="text-xs mt-1">Purchase or configure numbers in your {providerLabel} dashboard first</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// LiveKit Telephony Management Component
interface LiveKitStatus {
  configured: boolean
  url?: string
  inboundTrunks?: number
  outboundTrunks?: number
  message?: string
}

interface SipTrunk {
  sipTrunkId: string
  name: string
  address?: string
  numbers: string[]
  transport?: string
  authUsername?: string
  metadata?: string
}

interface DispatchRule {
  sipDispatchRuleId: string
  name: string
  trunkIds: string[]
  rule: any
  roomConfig?: any
}

interface LiveKitPhoneNumber {
  id?: string
  number: string
  e164_format?: string
  type: string
  trunkId?: string
  trunkName?: string
  area_code?: string
  number_type?: string
  locality?: string
  region?: string
  status?: string
  capabilities?: string[]
  sip_dispatch_rule_ids?: string[]
}

function LiveKitTelephony({ token, isHydrated }: { token: string | null; isHydrated: boolean }) {
  const [searchCountry, setSearchCountry] = useState('US')
  const [searchArea, setSearchArea] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const queryClient = useQueryClient()

  // Fetch LiveKit status
  const { data: lkStatus, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['livekit-status'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/livekit/status`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data as LiveKitStatus
    },
    enabled: isHydrated && !!token,
    retry: false,
  })

  // Fetch inbound trunks
  const { data: inboundData } = useQuery({
    queryKey: ['livekit-trunks-inbound'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/livekit/trunks/inbound`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data.trunks as SipTrunk[]
    },
    enabled: isHydrated && !!token && !!lkStatus?.configured,
  })

  // Fetch outbound trunks
  const { data: outboundData } = useQuery({
    queryKey: ['livekit-trunks-outbound'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/livekit/trunks/outbound`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data.trunks as SipTrunk[]
    },
    enabled: isHydrated && !!token && !!lkStatus?.configured,
  })

  // Fetch phone numbers
  const { data: phoneData, isLoading: isLoadingNumbers } = useQuery({
    queryKey: ['livekit-phone-numbers'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/livekit/phone-numbers`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data
    },
    enabled: isHydrated && !!token && !!lkStatus?.configured,
  })

  // Fetch dispatch rules
  const { data: dispatchData } = useQuery({
    queryKey: ['livekit-dispatch-rules'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/livekit/dispatch-rules`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data.rules as DispatchRule[]
    },
    enabled: isHydrated && !!token && !!lkStatus?.configured,
  })

  // Normalize phone numbers from either API format (items) or trunk fallback (numbers)
  const phoneNumbers: LiveKitPhoneNumber[] = (phoneData?.items || phoneData?.numbers || []).map((n: any) => ({
    id: n.id || undefined,
    number: n.e164_format || n.number,
    e164_format: n.e164_format,
    type: n.type || (n.number_type?.includes('TOLL_FREE') ? 'toll-free' : 'local'),
    trunkId: n.trunkId,
    trunkName: n.trunkName,
    area_code: n.area_code,
    number_type: n.number_type,
    locality: n.locality,
    region: n.region,
    status: n.status?.replace('PHONE_NUMBER_STATUS_', '').toLowerCase(),
    capabilities: n.capabilities,
    sip_dispatch_rule_ids: n.sip_dispatch_rule_ids,
  }))

  const handleSearchNumbers = async () => {
    setIsSearching(true)
    try {
      const params = new URLSearchParams({ countryCode: searchCountry })
      if (searchArea) params.append('areaCode', searchArea)
      const response = await axios.get(`${API_URL}/livekit/phone-numbers/search?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setSearchResults(response.data.items || response.data.numbers || [])
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to search phone numbers')
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const handleBuyNumber = async (phoneNumber: string) => {
    try {
      await axios.post(`${API_URL}/livekit/phone-numbers/purchase`, 
        { phoneNumber },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      toast.success(`Purchased ${phoneNumber}`)
      queryClient.invalidateQueries({ queryKey: ['livekit-phone-numbers'] })
      queryClient.invalidateQueries({ queryKey: ['livekit-trunks-inbound'] })
      setSearchResults(prev => prev.filter(n => n.phoneNumber !== phoneNumber))
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to purchase number')
    }
  }

  if (isLoadingStatus) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Checking LiveKit connection...</span>
        </CardContent>
      </Card>
    )
  }

  if (!lkStatus?.configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            LiveKit Telephony
          </CardTitle>
          <CardDescription>LiveKit is not configured. Add LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET to your environment.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <>
      {/* LiveKit Connection Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                LiveKit Telephony
              </CardTitle>
              <CardDescription>
                Connected to {lkStatus.url?.replace('wss://', '')}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{lkStatus.inboundTrunks} inbound</Badge>
              <Badge variant="outline">{lkStatus.outboundTrunks} outbound</Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Phone Numbers */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Phone Numbers</CardTitle>
              <CardDescription>Numbers configured across your SIP trunks</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowSearch(!showSearch)}>
              <Plus className="mr-2 h-4 w-4" />
              Buy Number
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search & Buy Numbers */}
          {showSearch && (
            <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
              <p className="text-sm font-medium">Search Available Numbers</p>
              <div className="flex items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Country</Label>
                  <Select value={searchCountry} onValueChange={setSearchCountry}>
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="US">US</SelectItem>
                      <SelectItem value="CA">CA</SelectItem>
                      <SelectItem value="GB">GB</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Area Code (optional)</Label>
                  <Input
                    placeholder="e.g. 415"
                    value={searchArea}
                    onChange={(e) => setSearchArea(e.target.value)}
                    className="max-w-[150px]"
                  />
                </div>
                <Button onClick={handleSearchNumbers} disabled={isSearching} size="sm">
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {searchResults.map((num: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 border rounded text-sm">
                      <span className="font-mono">{num.e164_format || num.phoneNumber || num.number}</span>
                      <Button size="sm" variant="outline" onClick={() => handleBuyNumber(num.e164_format || num.phoneNumber || num.number)}>
                        Buy
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Current Phone Numbers */}
          {isLoadingNumbers ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : phoneNumbers.length > 0 ? (
            <div className="space-y-2">
              {phoneNumbers.map((phone, i) => (
                <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium font-mono">{phone.number}</p>
                      <p className="text-xs text-muted-foreground">
                        {phone.locality && phone.region ? `${phone.locality}, ${phone.region}` : ''}
                        {phone.area_code ? ` (${phone.area_code})` : ''}
                        {phone.trunkName ? `Trunk: ${phone.trunkName}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {phone.status && (
                      <Badge variant={phone.status === 'active' ? 'default' : 'secondary'}>
                        {phone.status}
                      </Badge>
                    )}
                    <Badge variant="outline">{phone.type}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No phone numbers found</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SIP Trunks */}
      <Card>
        <CardHeader>
          <CardTitle>SIP Trunks</CardTitle>
          <CardDescription>Inbound and outbound trunk configurations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Inbound Trunks */}
          {inboundData && inboundData.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Inbound</p>
              {inboundData.map((trunk) => (
                <div key={trunk.sipTrunkId} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{trunk.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{trunk.sipTrunkId}</p>
                    </div>
                    <Badge variant="outline">Inbound</Badge>
                  </div>
                  {trunk.numbers.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {trunk.numbers.map((num, i) => (
                        <Badge key={i} variant="secondary" className="font-mono text-xs">{num}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Outbound Trunks */}
          {outboundData && outboundData.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Outbound</p>
              {outboundData.map((trunk) => (
                <div key={trunk.sipTrunkId} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{trunk.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-muted-foreground font-mono">{trunk.sipTrunkId}</p>
                        {trunk.address && trunk.address !== '0.0.0.0/0' && (
                          <span className="text-xs text-muted-foreground">→ {trunk.address}</span>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline">Outbound</Badge>
                  </div>
                  {trunk.numbers.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {trunk.numbers.map((num, i) => (
                        <Badge key={i} variant="secondary" className="font-mono text-xs">{num}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dispatch Rules */}
      {dispatchData && dispatchData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dispatch Rules</CardTitle>
            <CardDescription>Rules that route incoming calls to agents</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {dispatchData.map((rule) => (
              <div key={rule.sipDispatchRuleId} className="p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{rule.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{rule.sipDispatchRuleId}</p>
                  </div>
                  <Badge variant="outline">{rule.trunkIds.length} trunk(s)</Badge>
                </div>
                {rule.roomConfig?.agents?.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground">
                      Agent: {rule.roomConfig.agents[0].agentName || 'Default'}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}
