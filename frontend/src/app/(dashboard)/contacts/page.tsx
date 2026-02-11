"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { toast } from "sonner"
import { UploadWizard } from "@/components/contacts/upload-wizard"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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
  Users,
  Plus,
  Search,
  MoreVertical,
  Upload,
  Download,
  Trash2,
  Tag,
  Phone,
  Mail,
  Building,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  PhoneCall,
  PhoneOutgoing,
  Loader2,
  Bot,
  ArrowRight,
  UserPlus,
  FileSpreadsheet,
  AlertCircle,
  List,
  FolderOpen,
  Edit2,
} from "lucide-react"

// API base URL
const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`

interface Agent {
  id: string
  name: string
  status: string
}

interface Contact {
  id: string
  firstName: string | null
  lastName: string | null
  phone: string
  email: string | null
  company: string | null
  status: string
  tags: string[]
  totalCalls: number
  lastCalledAt: string | null
  createdAt: string
}

interface ContactStats {
  total: number
  new: number
  contacted: number
  qualified: number
  converted: number
  unqualified: number
  limit: number
  available: number
}

interface CallContact {
  id: string
  firstName: string
  lastName: string
  phone: string
}

interface ContactList {
  id: string
  name: string
  description: string | null
  color: string
  contactCount: number
  createdAt: string
}

// Parse CSV to array of objects
function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const rows: Record<string, string>[] = []
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = values[index] || ''
    })
    rows.push(row)
  }
  
  return rows
}

// Format phone for display
function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
  }
  if (cleaned.length === 10) {
    return `+1 (${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }
  return phone
}

export default function ContactsPage() {
  const queryClient = useQueryClient()
  
  // State
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  
  // Dialogs
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [isAddContactDialogOpen, setIsAddContactDialogOpen] = useState(false)
  const [isCallDialogOpen, setIsCallDialogOpen] = useState(false)
  const [isCreateListDialogOpen, setIsCreateListDialogOpen] = useState(false)
  
  // List management
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [newList, setNewList] = useState({
    name: "",
    description: "",
    color: "#3b82f6",
  })
  
  // Call dialog state
  const [contactToCall, setContactToCall] = useState<CallContact | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string>("")
  const [callStatus, setCallStatus] = useState<"idle" | "calling" | "connected" | "error">("idle")
  
  // Add contact form state
  const [newContact, setNewContact] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    company: "",
    tags: "",
  })
  

  // Fetch contacts from API
  const { data: contactsData, isLoading: isLoadingContacts } = useQuery({
    queryKey: ["contacts", page, searchQuery, statusFilter, selectedListId],
    queryFn: async () => {
      const token = localStorage.getItem("token")
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "50",
        ...(searchQuery && { search: searchQuery }),
        ...(statusFilter !== "all" && { status: statusFilter }),
        ...(selectedListId && { listId: selectedListId }),
      })
      const response = await axios.get(`${API_URL}/contacts?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data
    },
  })

  // Fetch contact stats
  const { data: statsData } = useQuery({
    queryKey: ["contactStats"],
    queryFn: async () => {
      const token = localStorage.getItem("token")
      const response = await axios.get(`${API_URL}/contacts/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data
    },
  })

  const contacts: Contact[] = contactsData?.contacts || []
  const stats: ContactStats = statsData || { total: 0, new: 0, contacted: 0, qualified: 0, converted: 0, unqualified: 0, limit: 50000, available: 50000 }

  // Fetch agents for the call dialog
  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const token = localStorage.getItem("token")
      const response = await axios.get(`${API_URL}/agents`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data
    },
  })

  const agents: Agent[] = agentsData?.agents || []

  // Fetch primary phone number for caller ID display
  const { data: phoneData } = useQuery({
    queryKey: ["vogent-phone-numbers"],
    queryFn: async () => {
      const token = localStorage.getItem("token")
      const response = await axios.get(`${API_URL}/vogent/phone-numbers`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data
    },
  })
  const primaryNumber = (() => {
    const numbers = phoneData?.phoneNumbers || []
    const primaryId = phoneData?.primaryNumberId
    const primary = numbers.find((n: any) => n.id === primaryId)
    return primary?.number || numbers[0]?.number || null
  })()

  // Fetch contact lists
  const { data: listsData } = useQuery({
    queryKey: ["contact-lists"],
    queryFn: async () => {
      const token = localStorage.getItem("token")
      const response = await axios.get(`${API_URL}/contact-lists`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data
    },
  })

  const lists: ContactList[] = listsData?.lists || []

  // Create single contact mutation
  const createContactMutation = useMutation({
    mutationFn: async (data: typeof newContact) => {
      const token = localStorage.getItem("token")
      const response = await axios.post(`${API_URL}/contacts`, {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email || undefined,
        company: data.company || undefined,
        tags: data.tags ? data.tags.split(",").map(t => t.trim()) : [],
      }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
      queryClient.invalidateQueries({ queryKey: ["contactStats"] })
      setIsAddContactDialogOpen(false)
      setNewContact({ firstName: "", lastName: "", phone: "", email: "", company: "", tags: "" })
    },
  })

  // Bulk upload mutation
  const bulkUploadMutation = useMutation({
    mutationFn: async (data: { contacts: Record<string, string>[]; tags: string[]; skipDuplicates: boolean; listId?: string }) => {
      const token = localStorage.getItem("token")
      console.log('🚀 Sending bulk upload request:', { contactCount: data.contacts.length, listId: data.listId })
      const response = await axios.post(`${API_URL}/contacts/bulk`, data, {
        headers: { Authorization: `Bearer ${token}` },
      })
      console.log('✅ Bulk upload response:', response.data)
      return response.data
    },
    onSuccess: (data, variables) => {
      toast.success(`Successfully uploaded ${data.summary?.created || 0} contacts`)
      setIsUploadDialogOpen(false)
      // Switch to the uploaded list's view so user sees contacts in the correct list
      if (variables.listId) {
        setSelectedListId(variables.listId)
      }
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
      queryClient.invalidateQueries({ queryKey: ["contactStats"] })
      queryClient.invalidateQueries({ queryKey: ["contact-lists"] })
    },
    onError: (error: any) => {
      console.error('❌ Bulk upload error:', error)
      toast.error(error.response?.data?.error || 'Failed to upload contacts')
    },
  })

  // Delete contact mutation
  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem("token")
      await axios.delete(`${API_URL}/contacts/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
      queryClient.invalidateQueries({ queryKey: ["contactStats"] })
    },
  })

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const token = localStorage.getItem("token")
      await axios.post(`${API_URL}/contacts/bulk-delete`, { ids }, {
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    onSuccess: () => {
      setSelectedContacts([])
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
      queryClient.invalidateQueries({ queryKey: ["contactStats"] })
    },
  })

  // Create list mutation
  const createListMutation = useMutation({
    mutationFn: async (data: typeof newList) => {
      const token = localStorage.getItem("token")
      const response = await axios.post(`${API_URL}/contact-lists`, data, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-lists"] })
      setIsCreateListDialogOpen(false)
      setNewList({ name: "", description: "", color: "#3b82f6" })
    },
  })

  // Delete list mutation
  const deleteListMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem("token")
      await axios.delete(`${API_URL}/contact-lists/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    onSuccess: () => {
      if (selectedListId) {
        setSelectedListId(null)
      }
      queryClient.invalidateQueries({ queryKey: ["contact-lists"] })
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
    },
  })

  // Mutation to make outbound call
  const makeCallMutation = useMutation({
    mutationFn: async ({ agentId, toNumber }: { agentId: string; toNumber: string }) => {
      const token = localStorage.getItem("token")
      const response = await axios.post(
        `${API_URL}/calls/outbound`,
        { agentId, toNumber },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      return response.data
    },
    onSuccess: (data) => {
      setCallStatus("connected")
      // Reset after 3 seconds
      setTimeout(() => {
        setCallStatus("idle")
        setIsCallDialogOpen(false)
        setContactToCall(null)
      }, 3000)
    },
    onError: (error) => {
      console.error("Call failed:", error)
      setCallStatus("error")
    },
  })

  const handleOpenCallDialog = (contact: Contact) => {
    setContactToCall({
      id: contact.id,
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      phone: contact.phone,
    })
    setCallStatus("idle")
    setSelectedAgentId(agents[0]?.id || "")
    setIsCallDialogOpen(true)
  }

  const handleMakeCall = () => {
    if (!contactToCall || !selectedAgentId) return
    
    // Clean phone number (remove formatting)
    const cleanPhone = contactToCall.phone.replace(/[\s()-]/g, "")
    
    setCallStatus("calling")
    makeCallMutation.mutate({
      agentId: selectedAgentId,
      toNumber: cleanPhone,
    })
  }

  const formatPhoneDisplay = (phone: string) => {
    // Format for display
    const cleaned = phone.replace(/\D/g, "")
    if (cleaned.length === 11 && cleaned.startsWith("1")) {
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
    }
    return phone
  }

  const handleAddContact = () => {
    if (!newContact.phone) return
    createContactMutation.mutate(newContact)
  }

  const toggleContact = (id: string) => {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  const toggleAll = () => {
    if (selectedContacts.length === contacts.length) {
      setSelectedContacts([])
    } else {
      setSelectedContacts(contacts.map((c) => c.id))
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return <Badge variant="secondary">New</Badge>
      case "contacted":
        return <Badge variant="outline">Contacted</Badge>
      case "qualified":
        return <Badge className="bg-blue-500">Qualified</Badge>
      case "converted":
        return <Badge className="bg-green-500">Converted</Badge>
      case "unqualified":
        return <Badge variant="destructive">Unqualified</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <div className="flex gap-6 h-full">
      {/* Lists Sidebar */}
      <Card className="w-64 flex-shrink-0 h-fit">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span>Contact Lists</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setIsCreateListDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 p-2">
          <Button
            variant={!selectedListId ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => setSelectedListId(null)}
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            All Contacts
            <Badge variant="outline" className="ml-auto">
              {stats.total}
            </Badge>
          </Button>
          {lists.map((list) => (
            <div key={list.id} className="group relative">
              <Button
                variant={selectedListId === list.id ? "secondary" : "ghost"}
                className="w-full justify-start pr-8"
                onClick={() => setSelectedListId(list.id)}
              >
                <div
                  className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
                  style={{ backgroundColor: list.color }}
                />
                <span className="truncate">{list.name}</span>
                <Badge variant="outline" className="ml-auto">
                  {list.contactCount}
                </Badge>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100"
                onClick={() => deleteListMutation.mutate(list.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="flex-1 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
          <p className="text-muted-foreground">
            Manage your leads and contact lists
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" onClick={() => setIsAddContactDialogOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add Contact
          </Button>
          <Button onClick={() => setIsUploadDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Upload Contacts
          </Button>
          <UploadWizard
            open={isUploadDialogOpen}
            onOpenChange={setIsUploadDialogOpen}
            onSubmit={(contacts, tags, skipDuplicates, listId) => {
              bulkUploadMutation.mutate({
                contacts,
                tags,
                skipDuplicates,
                listId,
              })
            }}
            isSubmitting={bulkUploadMutation.isPending}
            contactLists={lists}
            defaultListId={selectedListId}
          />
        </div>
      </div>

      {/* Add Contact Dialog */}
      <Dialog open={isAddContactDialogOpen} onOpenChange={setIsAddContactDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Contact</DialogTitle>
            <DialogDescription>
              Add a single contact to your list
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input 
                  placeholder="John"
                  value={newContact.firstName}
                  onChange={(e) => setNewContact(prev => ({ ...prev, firstName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input 
                  placeholder="Doe"
                  value={newContact.lastName}
                  onChange={(e) => setNewContact(prev => ({ ...prev, lastName: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Phone Number *</Label>
              <Input 
                placeholder="+1 (555) 123-4567"
                value={newContact.phone}
                onChange={(e) => setNewContact(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input 
                type="email"
                placeholder="john@example.com"
                value={newContact.email}
                onChange={(e) => setNewContact(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Company</Label>
              <Input 
                placeholder="Acme Corp"
                value={newContact.company}
                onChange={(e) => setNewContact(prev => ({ ...prev, company: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Tags (comma separated)</Label>
              <Input 
                placeholder="Lead, Enterprise"
                value={newContact.tags}
                onChange={(e) => setNewContact(prev => ({ ...prev, tags: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddContactDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddContact}
              disabled={!newContact.phone || createContactMutation.isPending}
            >
              {createContactMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>Add Contact</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Contacts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
            <div className="mt-2">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{stats.available.toLocaleString()} available</span>
                <span>{stats.limit.toLocaleString()} limit</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${stats.total / stats.limit > 0.9 ? 'bg-red-500' : stats.total / stats.limit > 0.7 ? 'bg-yellow-500' : 'bg-primary'}`}
                  style={{ width: `${Math.min((stats.total / stats.limit) * 100, 100)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              New Leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.new.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Contacted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.contacted.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Qualified
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{stats.qualified.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Converted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats.converted.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setPage(1)
              }}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="qualified">Qualified</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="unqualified">Unqualified</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {selectedContacts.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {selectedContacts.length} selected
            </span>
            <Button variant="outline" size="sm">
              <Tag className="mr-2 h-4 w-4" />
              Add Tags
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="text-destructive"
              onClick={() => bulkDeleteMutation.mutate(selectedContacts)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        )}
      </div>

      {/* Contacts Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedContacts.length === contacts.length && contacts.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Last Called</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingContacts ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : contacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No contacts found
                  </TableCell>
                </TableRow>
              ) : (
                contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedContacts.includes(contact.id)}
                        onCheckedChange={() => toggleContact(contact.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {contact.firstName || ''} {contact.lastName || ''}
                    </TableCell>
                    <TableCell>{formatPhone(contact.phone)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.email || '-'}
                    </TableCell>
                    <TableCell>{contact.company || '-'}</TableCell>
                    <TableCell>{getStatusBadge(contact.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(contact.tags as string[] || []).slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {(contact.tags as string[] || []).length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{(contact.tags as string[]).length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.lastCalledAt ? new Date(contact.lastCalledAt).toLocaleDateString() : "Never"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenCallDialog(contact)}>
                            <Phone className="mr-2 h-4 w-4" />
                            Call Now
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Mail className="mr-2 h-4 w-4" />
                            Send Email
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Tag className="mr-2 h-4 w-4" />
                            Edit Tags
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => deleteContactMutation.mutate(contact.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Make Call Dialog */}
      <Dialog open={isCallDialogOpen} onOpenChange={setIsCallDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneOutgoing className="h-5 w-5" />
              Make Test Call
            </DialogTitle>
            <DialogDescription>
              {contactToCall
                ? `Call ${contactToCall.firstName} ${contactToCall.lastName}`
                : "Initiate an outbound call"}
            </DialogDescription>
          </DialogHeader>

          {contactToCall && (
            <div className="space-y-6 py-4">
              {/* Call Route Display */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">From (Caller ID)</p>
                  <p className="font-mono font-semibold text-primary">
                    {primaryNumber ? formatPhoneDisplay(primaryNumber) : 'Not configured'}
                  </p>
                  <Badge variant="outline" className="mt-1 text-xs">Outbound</Badge>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">To (Destination)</p>
                  <p className="font-mono font-semibold">
                    {contactToCall.phone}
                  </p>
                  <Badge variant="outline" className="mt-1 text-xs">
                    {contactToCall.firstName} {contactToCall.lastName}
                  </Badge>
                </div>
              </div>

              {/* Agent Selection */}
              <div className="space-y-2">
                <Label>Select Agent</Label>
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an agent to handle the call" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No agents available
                      </SelectItem>
                    ) : (
                      agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          <div className="flex items-center gap-2">
                            <Bot className="h-4 w-4" />
                            {agent.name}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Status Messages */}
              {callStatus === "calling" && (
                <div className="flex items-center justify-center gap-2 p-3 bg-blue-500/10 text-blue-600 rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Initiating call...</span>
                </div>
              )}
              {callStatus === "connected" && (
                <div className="flex items-center justify-center gap-2 p-3 bg-green-500/10 text-green-600 rounded-lg">
                  <CheckCircle className="h-4 w-4" />
                  <span>Call connected successfully!</span>
                </div>
              )}
              {callStatus === "error" && (
                <div className="flex items-center justify-center gap-2 p-3 bg-red-500/10 text-red-600 rounded-lg">
                  <XCircle className="h-4 w-4" />
                  <span>Failed to connect call. Please try again.</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsCallDialogOpen(false)
                setContactToCall(null)
                setCallStatus("idle")
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleMakeCall}
              disabled={!selectedAgentId || callStatus === "calling" || callStatus === "connected"}
              className="gap-2"
            >
              {callStatus === "calling" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calling...
                </>
              ) : (
                <>
                  <PhoneCall className="h-4 w-4" />
                  Make Call
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create List Dialog */}
      <Dialog open={isCreateListDialogOpen} onOpenChange={setIsCreateListDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Contact List</DialogTitle>
            <DialogDescription>
              Organize your contacts into separate lists
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>List Name *</Label>
              <Input
                placeholder="e.g., Q4 Prospects"
                value={newList.name}
                onChange={(e) => setNewList((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Optional description"
                value={newList.description}
                onChange={(e) => setNewList((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#6366f1"].map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 ${
                      newList.color === color ? "border-foreground" : "border-transparent"
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewList((prev) => ({ ...prev, color }))}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateListDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createListMutation.mutate(newList)}
              disabled={!newList.name || createListMutation.isPending}
            >
              {createListMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>Create List</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  )
}
