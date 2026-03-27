"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Edit,
  DollarSign,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Download,
  Upload,
  Eye,
  EyeOff,
  Copy,
  Landmark,
} from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { toast } from "sonner"
import { useAuthStore } from "@/stores/auth-store"
import { format } from "date-fns"

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`

interface EscrowClaim {
  id: string
  claimCode: string
  pin: string
  firstName: string
  lastName: string
  phone?: string
  email?: string
  ssn4?: string
  dateOfBirth?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  escrowAmount: number
  escrowType: string
  escrowDescription?: string
  originatingEntity?: string
  status: 'pending' | 'verified' | 'processing' | 'approved' | 'disbursed' | 'rejected' | 'expired'
  disbursementMethod?: string
  lastCallAt?: string
  totalCalls: number
  failedVerificationAttempts: number
  isLocked: boolean
  notes?: string
  expiresAt?: string
  createdAt: string
  updatedAt: string
}

interface EscrowClaimStats {
  total: number
  pending: number
  verified: number
  processing: number
  approved: number
  disbursed: number
  rejected: number
  expired: number
  totalAmountCents: number
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  verified: "bg-blue-100 text-blue-800",
  processing: "bg-purple-100 text-purple-800",
  approved: "bg-green-100 text-green-800",
  disbursed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-gray-100 text-gray-800",
}

const ESCROW_TYPES = [
  { value: "federal_reserve", label: "Federal Reserve" },
  { value: "treasury", label: "US Treasury" },
  { value: "tax_refund", label: "Tax Refund" },
  { value: "settlement", label: "Legal Settlement" },
  { value: "inheritance", label: "Inheritance" },
  { value: "insurance", label: "Insurance Payout" },
]

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
]

export default function EscrowClaimsPage() {
  const { token } = useAuthStore()
  const queryClient = useQueryClient()
  
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedClaim, setSelectedClaim] = useState<EscrowClaim | null>(null)
  const [showPin, setShowPin] = useState<Record<string, boolean>>({})
  
  const [formData, setFormData] = useState({
    claimCode: "",
    pin: "",
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    ssn4: "",
    dateOfBirth: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    escrowAmount: "",
    escrowType: "federal_reserve",
    escrowDescription: "",
    originatingEntity: "Federal Reserve Bank",
    status: "pending" as 'pending' | 'verified' | 'processing' | 'approved' | 'disbursed' | 'rejected' | 'expired',
    disbursementMethod: "",
    expiresAt: "",
    notes: "",
  })

  const axiosConfig = {
    headers: { Authorization: `Bearer ${token}` }
  }

  // Fetch claims
  const { data: claimsData, isLoading: isLoadingClaims } = useQuery({
    queryKey: ["escrow-claims", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.append("search", search)
      if (statusFilter !== "all") params.append("status", statusFilter)
      params.append("limit", "100")
      const { data } = await axios.get(`${API_URL}/escrow-claims?${params}`, axiosConfig)
      return data
    },
    enabled: !!token,
  })

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ["escrow-claims-stats"],
    queryFn: async () => {
      const { data } = await axios.get(`${API_URL}/escrow-claims/stats`, axiosConfig)
      return data as EscrowClaimStats
    },
    enabled: !!token,
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload = {
        ...data,
        escrowAmount: parseFloat(data.escrowAmount) || 0,
      }
      const { data: result } = await axios.post(`${API_URL}/escrow-claims`, payload, axiosConfig)
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escrow-claims"] })
      queryClient.invalidateQueries({ queryKey: ["escrow-claims-stats"] })
      setIsCreateDialogOpen(false)
      resetForm()
      toast.success("Escrow claim created successfully")
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to create claim")
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const payload = {
        ...data,
        escrowAmount: parseFloat(data.escrowAmount) || 0,
      }
      const { data: result } = await axios.put(`${API_URL}/escrow-claims/${id}`, payload, axiosConfig)
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escrow-claims"] })
      queryClient.invalidateQueries({ queryKey: ["escrow-claims-stats"] })
      setIsEditDialogOpen(false)
      setSelectedClaim(null)
      resetForm()
      toast.success("Escrow claim updated successfully")
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to update claim")
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`${API_URL}/escrow-claims/${id}`, axiosConfig)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escrow-claims"] })
      queryClient.invalidateQueries({ queryKey: ["escrow-claims-stats"] })
      setIsDeleteDialogOpen(false)
      setSelectedClaim(null)
      toast.success("Escrow claim deleted successfully")
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to delete claim")
    },
  })

  const resetForm = () => {
    setFormData({
      claimCode: "",
      pin: "",
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      ssn4: "",
      dateOfBirth: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      escrowAmount: "",
      escrowType: "federal_reserve",
      escrowDescription: "",
      originatingEntity: "Federal Reserve Bank",
      status: "pending",
      disbursementMethod: "",
      expiresAt: "",
      notes: "",
    })
  }

  const generateClaimCode = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    setFormData(prev => ({ ...prev, claimCode: code }))
  }

  const generatePin = () => {
    const pin = Math.floor(1000 + Math.random() * 9000).toString()
    setFormData(prev => ({ ...prev, pin }))
  }

  const openEditDialog = (claim: EscrowClaim) => {
    setSelectedClaim(claim)
    setFormData({
      claimCode: claim.claimCode,
      pin: claim.pin,
      firstName: claim.firstName,
      lastName: claim.lastName,
      phone: claim.phone || "",
      email: claim.email || "",
      ssn4: claim.ssn4 || "",
      dateOfBirth: claim.dateOfBirth || "",
      address: claim.address || "",
      city: claim.city || "",
      state: claim.state || "",
      zipCode: claim.zipCode || "",
      escrowAmount: (claim.escrowAmount / 100).toString(),
      escrowType: claim.escrowType,
      escrowDescription: claim.escrowDescription || "",
      originatingEntity: claim.originatingEntity || "",
      status: claim.status as 'pending' | 'verified' | 'processing' | 'approved' | 'disbursed' | 'rejected' | 'expired',
      disbursementMethod: claim.disbursementMethod || "",
      expiresAt: claim.expiresAt ? claim.expiresAt.split("T")[0] : "",
      notes: claim.notes || "",
    })
    setIsEditDialogOpen(true)
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard`)
  }

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100)
  }

  const claims = claimsData?.claims || []

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Landmark className="h-8 w-8" />
            Escrow Claims Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage Federal Reserve escrow account claims for IVR verification
          </p>
        </div>
        <Button onClick={() => { resetForm(); setIsCreateDialogOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Claim
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Claims</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats?.totalAmountCents || 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats?.pending || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.approved || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Disbursed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{stats?.disbursed || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by claim code, name, phone, or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="disbursed">Disbursed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["escrow-claims"] })}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Claims Table */}
      <Card>
        <CardContent className="p-0">
          {isLoadingClaims ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : claims.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="No escrow claims"
              description="Create your first escrow claim to get started"
              action={{
                label: "Add Claim",
                onClick: () => { resetForm(); setIsCreateDialogOpen(true) }
              }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim Code</TableHead>
                  <TableHead>PIN</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((claim: EscrowClaim) => (
                  <TableRow key={claim.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                          {claim.claimCode}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(claim.claimCode, "Claim code")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                          {showPin[claim.id] ? claim.pin : "••••"}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setShowPin(prev => ({ ...prev, [claim.id]: !prev[claim.id] }))}
                        >
                          {showPin[claim.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{claim.firstName} {claim.lastName}</div>
                        {claim.phone && (
                          <div className="text-sm text-muted-foreground">{claim.phone}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-green-600">
                        {formatCurrency(claim.escrowAmount)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[claim.status]}>
                        {claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}
                      </Badge>
                      {claim.isLocked && (
                        <Badge variant="destructive" className="ml-2">Locked</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{claim.totalCalls}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(claim.createdAt), "MMM d, yyyy")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(claim)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              setSelectedClaim(claim)
                              setIsDeleteDialogOpen(true)
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen || isEditDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCreateDialogOpen(false)
          setIsEditDialogOpen(false)
          setSelectedClaim(null)
          resetForm()
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditDialogOpen ? "Edit Escrow Claim" : "Create New Escrow Claim"}
            </DialogTitle>
            <DialogDescription>
              {isEditDialogOpen
                ? "Update the escrow claim details"
                : "Add a new escrow claim for IVR verification"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Claim Code & PIN */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Claim Code *</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.claimCode}
                    onChange={(e) => setFormData(prev => ({ ...prev, claimCode: e.target.value }))}
                    placeholder="6-digit code"
                    maxLength={20}
                  />
                  <Button type="button" variant="outline" onClick={generateClaimCode}>
                    Generate
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>PIN *</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.pin}
                    onChange={(e) => setFormData(prev => ({ ...prev, pin: e.target.value }))}
                    placeholder="4-digit PIN"
                    maxLength={10}
                  />
                  <Button type="button" variant="outline" onClick={generatePin}>
                    Generate
                  </Button>
                </div>
              </div>
            </div>

            {/* Name */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name *</Label>
                <Input
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Doe"
                />
              </div>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="john@example.com"
                />
              </div>
            </div>

            {/* Identity Verification */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>SSN Last 4 Digits</Label>
                <Input
                  value={formData.ssn4}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 4)
                    setFormData(prev => ({ ...prev, ssn4: value }))
                  }}
                  placeholder="1234"
                  maxLength={4}
                />
                <p className="text-xs text-muted-foreground">Used for IVR identity verification</p>
              </div>
              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Used for IVR identity verification</p>
              </div>
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                placeholder="123 Main St"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="New York"
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Select
                  value={formData.state}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, state: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map(state => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>ZIP Code</Label>
                <Input
                  value={formData.zipCode}
                  onChange={(e) => setFormData(prev => ({ ...prev, zipCode: e.target.value }))}
                  placeholder="10001"
                />
              </div>
            </div>

            {/* Escrow Details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Escrow Amount ($) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.escrowAmount}
                  onChange={(e) => setFormData(prev => ({ ...prev, escrowAmount: e.target.value }))}
                  placeholder="10000.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Escrow Type</Label>
                <Select
                  value={formData.escrowType}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, escrowType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESCROW_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Originating Entity</Label>
                <Input
                  value={formData.originatingEntity}
                  onChange={(e) => setFormData(prev => ({ ...prev, originatingEntity: e.target.value }))}
                  placeholder="Federal Reserve Bank"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: any) => setFormData(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="disbursed">Disbursed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Disbursement */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Disbursement Method</Label>
                <Select
                  value={formData.disbursementMethod}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, disbursementMethod: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct_deposit">Direct Deposit</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="wire">Wire Transfer</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">How funds will be disbursed</p>
              </div>
              <div className="space-y-2">
                <Label>Expiration Date</Label>
                <Input
                  type="date"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData(prev => ({ ...prev, expiresAt: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">When the claim expires</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.escrowDescription}
                onChange={(e) => setFormData(prev => ({ ...prev, escrowDescription: e.target.value }))}
                placeholder="Escrow account details..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Internal notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false)
                setIsEditDialogOpen(false)
                setSelectedClaim(null)
                resetForm()
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (isEditDialogOpen && selectedClaim) {
                  updateMutation.mutate({ id: selectedClaim.id, data: formData })
                } else {
                  createMutation.mutate(formData)
                }
              }}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {isEditDialogOpen ? "Update Claim" : "Create Claim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Escrow Claim</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the claim for{" "}
              <strong>{selectedClaim?.firstName} {selectedClaim?.lastName}</strong>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => selectedClaim && deleteMutation.mutate(selectedClaim.id)}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
