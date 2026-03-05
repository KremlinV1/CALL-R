"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Phone,
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Settings,
  Hash,
  ArrowRight,
  MessageSquare,
  PhoneForwarded,
  Voicemail,
  Bot,
  PhoneOff,
  RotateCcw,
  Loader2,
  Star,
  Edit,
} from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { toast } from "sonner"
import { useAuthStore } from "@/stores/auth-store"

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`

// Action type icons and labels
const ACTION_TYPES = [
  { value: "play_message", label: "Play Message", icon: MessageSquare, description: "Play a TTS or audio message" },
  { value: "transfer", label: "Transfer Call", icon: PhoneForwarded, description: "Transfer to a phone number" },
  { value: "voicemail", label: "Voicemail", icon: Voicemail, description: "Send to voicemail" },
  { value: "submenu", label: "Go to Submenu", icon: ArrowRight, description: "Navigate to another menu" },
  { value: "agent", label: "Connect to Agent", icon: Bot, description: "Connect to an AI agent" },
  { value: "hangup", label: "Hang Up", icon: PhoneOff, description: "End the call" },
  { value: "repeat", label: "Repeat Menu", icon: RotateCcw, description: "Repeat current menu options" },
] as const

// DTMF keys
const DTMF_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "*", "#"]

interface IvrMenuOption {
  id?: string
  dtmfKey: string
  label: string
  actionType: string
  actionData: Record<string, any>
  announcementText?: string
}

interface IvrMenu {
  id: string
  name: string
  description?: string
  isActive: boolean
  isDefault: boolean
  greetingType: "tts" | "audio"
  greetingText?: string
  greetingAudioUrl?: string
  voiceProvider: string
  voiceId?: string
  inputTimeoutSeconds: number
  maxRetries: number
  invalidInputMessage?: string
  timeoutMessage?: string
  optionCount?: number
  options?: IvrMenuOption[]
  createdAt: string
}

function useToken() {
  const storeToken = useAuthStore((state) => state.token)
  const [token, setToken] = useState<string | null>(null)
  
  useState(() => {
    const storedToken = typeof window !== "undefined" ? localStorage.getItem("token") : null
    setToken(storedToken || storeToken)
  })
  
  return token || storeToken
}

export default function IvrPage() {
  const token = useToken()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState("")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingMenu, setEditingMenu] = useState<IvrMenu | null>(null)

  // Fetch IVR menus
  const { data, isLoading, error } = useQuery({
    queryKey: ["ivr-menus"],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/ivr/menus`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data
    },
    enabled: !!token,
  })

  // Fetch agents for agent action
  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/agents`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data
    },
    enabled: !!token,
  })

  const menus: IvrMenu[] = data?.menus || []
  const agents = agentsData?.agents || []

  const filteredMenus = menus.filter(
    (menu) =>
      menu.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (menu.description || "").toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`${API_URL}/ivr/menus/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ivr-menus"] })
      toast.success("IVR menu deleted")
    },
    onError: () => {
      toast.error("Failed to delete menu")
    },
  })

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this IVR menu?")) {
      deleteMutation.mutate(id)
    }
  }

  const handleEdit = async (menu: IvrMenu) => {
    // Fetch full menu with options
    try {
      const res = await axios.get(`${API_URL}/ivr/menus/${menu.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setEditingMenu(res.data.menu)
      setIsCreateOpen(true)
    } catch {
      toast.error("Failed to load menu details")
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">IVR Menus</h1>
          <p className="text-muted-foreground">
            Create interactive voice response menus for inbound calls
          </p>
        </div>
        <Button onClick={() => { setEditingMenu(null); setIsCreateOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          Create Menu
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search menus..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">Failed to load IVR menus. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredMenus.length === 0 && (
        <EmptyState
          icon={Phone}
          title="No IVR menus yet"
          description="Create your first IVR menu to handle inbound calls with interactive options."
          action={{
            label: "Create Menu",
            onClick: () => setIsCreateOpen(true),
          }}
        />
      )}

      {/* Menu Grid */}
      {!isLoading && !error && filteredMenus.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredMenus.map((menu) => (
            <Card key={menu.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      {menu.name}
                      {menu.isDefault && (
                        <Badge variant="secondary" className="text-xs">
                          <Star className="mr-1 h-3 w-3" />
                          Default
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>{menu.description || "No description"}</CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(menu)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(menu.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant={menu.isActive ? "default" : "secondary"}>
                      {menu.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Options</span>
                    <span className="font-medium">{menu.optionCount || 0} keys</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Greeting</span>
                    <span className="font-medium capitalize">{menu.greetingType}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Timeout</span>
                    <span className="font-medium">{menu.inputTimeoutSeconds}s</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <IvrMenuDialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open)
          if (!open) setEditingMenu(null)
        }}
        menu={editingMenu}
        menus={menus}
        agents={agents}
        token={token}
      />
    </div>
  )
}

// IVR Menu Create/Edit Dialog
function IvrMenuDialog({
  open,
  onOpenChange,
  menu,
  menus,
  agents,
  token,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  menu: IvrMenu | null
  menus: IvrMenu[]
  agents: any[]
  token: string | null
}) {
  const queryClient = useQueryClient()
  const isEditing = !!menu

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isDefault, setIsDefault] = useState(false)
  const [greetingType, setGreetingType] = useState<"tts" | "audio">("tts")
  const [greetingText, setGreetingText] = useState("")
  const [greetingAudioUrl, setGreetingAudioUrl] = useState("")
  const [inputTimeoutSeconds, setInputTimeoutSeconds] = useState(5)
  const [maxRetries, setMaxRetries] = useState(3)
  const [invalidInputMessage, setInvalidInputMessage] = useState("Sorry, I didn't understand that. Please try again.")
  const [timeoutMessage, setTimeoutMessage] = useState("I didn't receive any input. Goodbye.")
  const [options, setOptions] = useState<IvrMenuOption[]>([])
  const [isSaving, setIsSaving] = useState(false)

  // Reset form when menu changes
  useState(() => {
    if (menu) {
      setName(menu.name)
      setDescription(menu.description || "")
      setIsDefault(menu.isDefault)
      setGreetingType(menu.greetingType)
      setGreetingText(menu.greetingText || "")
      setGreetingAudioUrl(menu.greetingAudioUrl || "")
      setInputTimeoutSeconds(menu.inputTimeoutSeconds)
      setMaxRetries(menu.maxRetries)
      setInvalidInputMessage(menu.invalidInputMessage || "")
      setTimeoutMessage(menu.timeoutMessage || "")
      setOptions(menu.options || [])
    } else {
      setName("")
      setDescription("")
      setIsDefault(false)
      setGreetingType("tts")
      setGreetingText("Thank you for calling. Please listen to the following options.")
      setGreetingAudioUrl("")
      setInputTimeoutSeconds(5)
      setMaxRetries(3)
      setInvalidInputMessage("Sorry, I didn't understand that. Please try again.")
      setTimeoutMessage("I didn't receive any input. Goodbye.")
      setOptions([])
    }
  })

  const addOption = () => {
    const usedKeys = options.map((o) => o.dtmfKey)
    const nextKey = DTMF_KEYS.find((k) => !usedKeys.includes(k)) || "1"
    setOptions([
      ...options,
      {
        dtmfKey: nextKey,
        label: "",
        actionType: "play_message",
        actionData: {},
      },
    ])
  }

  const updateOption = (index: number, updates: Partial<IvrMenuOption>) => {
    const newOptions = [...options]
    newOptions[index] = { ...newOptions[index], ...updates }
    setOptions(newOptions)
  }

  const removeOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter a menu name")
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        name,
        description,
        isDefault,
        greetingType,
        greetingText,
        greetingAudioUrl,
        inputTimeoutSeconds,
        maxRetries,
        invalidInputMessage,
        timeoutMessage,
        options: options.map((opt) => ({
          dtmfKey: opt.dtmfKey,
          label: opt.label,
          actionType: opt.actionType,
          actionData: opt.actionData,
          announcementText: opt.announcementText,
        })),
      }

      if (isEditing && menu) {
        await axios.put(`${API_URL}/ivr/menus/${menu.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        })
        toast.success("IVR menu updated")
      } else {
        await axios.post(`${API_URL}/ivr/menus`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        })
        toast.success("IVR menu created")
      }

      queryClient.invalidateQueries({ queryKey: ["ivr-menus"] })
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to save menu")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit IVR Menu" : "Create IVR Menu"}</DialogTitle>
          <DialogDescription>
            Configure your interactive voice response menu with DTMF key options.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Menu Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Main Menu"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Primary inbound call menu"
              />
            </div>
          </div>

          {/* Default Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label>Default Menu</Label>
              <p className="text-sm text-muted-foreground">
                Use this menu for all inbound calls
              </p>
            </div>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>

          {/* Greeting */}
          <div className="space-y-4">
            <Label>Greeting</Label>
            <div className="flex gap-4">
              <Button
                type="button"
                variant={greetingType === "tts" ? "default" : "outline"}
                onClick={() => setGreetingType("tts")}
                className="flex-1"
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Text-to-Speech
              </Button>
              <Button
                type="button"
                variant={greetingType === "audio" ? "default" : "outline"}
                onClick={() => setGreetingType("audio")}
                className="flex-1"
              >
                <Phone className="mr-2 h-4 w-4" />
                Audio URL
              </Button>
            </div>
            {greetingType === "tts" ? (
              <Textarea
                value={greetingText}
                onChange={(e) => setGreetingText(e.target.value)}
                placeholder="Thank you for calling. Please listen to the following options."
                rows={3}
              />
            ) : (
              <Input
                value={greetingAudioUrl}
                onChange={(e) => setGreetingAudioUrl(e.target.value)}
                placeholder="https://example.com/greeting.mp3"
              />
            )}
          </div>

          {/* Timeout Settings */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Input Timeout (seconds)</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={inputTimeoutSeconds}
                onChange={(e) => setInputTimeoutSeconds(parseInt(e.target.value) || 5)}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Retries</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={maxRetries}
                onChange={(e) => setMaxRetries(parseInt(e.target.value) || 3)}
              />
            </div>
          </div>

          {/* Error Messages */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Invalid Input Message</Label>
              <Input
                value={invalidInputMessage}
                onChange={(e) => setInvalidInputMessage(e.target.value)}
                placeholder="Sorry, I didn't understand that."
              />
            </div>
            <div className="space-y-2">
              <Label>Timeout Message</Label>
              <Input
                value={timeoutMessage}
                onChange={(e) => setTimeoutMessage(e.target.value)}
                placeholder="I didn't receive any input. Goodbye."
              />
            </div>
          </div>

          {/* Menu Options */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Menu Options</Label>
              <Button type="button" variant="outline" size="sm" onClick={addOption}>
                <Plus className="mr-2 h-4 w-4" />
                Add Option
              </Button>
            </div>

            {options.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <Hash className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No options configured. Add DTMF key mappings for callers.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {options.map((option, index) => (
                  <OptionRow
                    key={index}
                    option={option}
                    index={index}
                    usedKeys={options.map((o) => o.dtmfKey)}
                    menus={menus.filter((m) => m.id !== menu?.id)}
                    agents={agents}
                    onUpdate={(updates) => updateOption(index, updates)}
                    onRemove={() => removeOption(index)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Save Changes" : "Create Menu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Single Option Row
function OptionRow({
  option,
  index,
  usedKeys,
  menus,
  agents,
  onUpdate,
  onRemove,
}: {
  option: IvrMenuOption
  index: number
  usedKeys: string[]
  menus: IvrMenu[]
  agents: any[]
  onUpdate: (updates: Partial<IvrMenuOption>) => void
  onRemove: () => void
}) {
  const actionType = ACTION_TYPES.find((a) => a.value === option.actionType)
  const ActionIcon = actionType?.icon || Hash

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-3">
        {/* DTMF Key */}
        <Select
          value={option.dtmfKey}
          onValueChange={(value) => onUpdate({ dtmfKey: value })}
        >
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DTMF_KEYS.map((key) => (
              <SelectItem
                key={key}
                value={key}
                disabled={usedKeys.includes(key) && key !== option.dtmfKey}
              >
                {key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Label */}
        <Input
          value={option.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="Option label (e.g., Sales)"
          className="flex-1"
        />

        {/* Action Type */}
        <Select
          value={option.actionType}
          onValueChange={(value) => onUpdate({ actionType: value, actionData: {} })}
        >
          <SelectTrigger className="w-48">
            <div className="flex items-center gap-2">
              <ActionIcon className="h-4 w-4" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map((action) => (
              <SelectItem key={action.value} value={action.value}>
                <div className="flex items-center gap-2">
                  <action.icon className="h-4 w-4" />
                  {action.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Remove */}
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {/* Action-specific fields */}
      {option.actionType === "transfer" && (
        <Input
          value={option.actionData.phoneNumber || ""}
          onChange={(e) => onUpdate({ actionData: { phoneNumber: e.target.value } })}
          placeholder="Transfer to phone number (e.g., +15551234567)"
        />
      )}

      {option.actionType === "submenu" && (
        <Select
          value={option.actionData.menuId || ""}
          onValueChange={(value) => onUpdate({ actionData: { menuId: value } })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select submenu..." />
          </SelectTrigger>
          <SelectContent>
            {menus.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {option.actionType === "agent" && (
        <Select
          value={option.actionData.agentId || ""}
          onValueChange={(value) => onUpdate({ actionData: { agentId: value } })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select AI agent..." />
          </SelectTrigger>
          <SelectContent>
            {agents.map((a: any) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {option.actionType === "play_message" && (
        <Textarea
          value={option.actionData.message || ""}
          onChange={(e) => onUpdate({ actionData: { message: e.target.value, tts: true } })}
          placeholder="Message to play..."
          rows={2}
        />
      )}

      {/* Announcement before action */}
      <div className="pt-2 border-t">
        <Label className="text-xs text-muted-foreground">Announcement (optional)</Label>
        <Input
          value={option.announcementText || ""}
          onChange={(e) => onUpdate({ announcementText: e.target.value })}
          placeholder="e.g., Transferring you to sales..."
          className="mt-1"
        />
      </div>
    </div>
  )
}
