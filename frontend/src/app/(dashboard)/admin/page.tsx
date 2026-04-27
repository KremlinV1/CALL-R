"use client"

import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  Users,
  Building2,
  Shield,
  BarChart3,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserPlus,
  Mail,
  Phone,
  Calendar,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Download,
  Upload,
  Key,
  Crown,
  UserCog,
  User,
  ClipboardCopy,
  ShieldCheck,
  Link2,
} from "lucide-react"
import { useAuthStore } from "@/stores/auth-store"
import { format } from "date-fns"

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`

interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  role: "owner" | "admin" | "member"
  emailVerified: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
  organizationId: string
  organization?: Organization
}

interface Organization {
  id: string
  name: string
  slug: string
  website: string | null
  timezone: string
  createdAt: string
  updatedAt: string
  _count?: {
    users: number
  }
}

interface AdminStats {
  totalUsers: number
  totalOrganizations: number
  activeUsers: number
  newUsersThisMonth: number
  usersByRole: {
    owner: number
    admin: number
    member: number
  }
}

function useToken() {
  const storeToken = useAuthStore((state) => state.token)
  const [isHydrated, setIsHydrated] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  
  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    setToken(storedToken || storeToken)
    setIsHydrated(true)
  }, [storeToken])
  
  return { token, isHydrated }
}

export default function AdminDashboard() {
  const { token, isHydrated } = useToken()
  const { user: currentUser } = useAuthStore()
  const queryClient = useQueryClient()
  
  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<string>("all")
  const [orgFilter, setOrgFilter] = useState<string>("all")
  
  // User management state
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [userFormData, setUserFormData] = useState({
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    role: "member" as "owner" | "admin" | "member",
    password: "",
    organizationId: "",
  })
  
  // Organization management state
  const [isOrgDialogOpen, setIsOrgDialogOpen] = useState(false)
  const [isDeleteOrgDialogOpen, setIsDeleteOrgDialogOpen] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null)
  const [orgFormData, setOrgFormData] = useState({
    name: "",
    slug: "",
    website: "",
    timezone: "America/New_York",
  })

  // Fetch admin stats
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data as AdminStats
    },
    enabled: isHydrated && !!token,
  })

  // Fetch all users
  const { data: usersData, isLoading: isLoadingUsers, refetch: refetchUsers } = useQuery({
    queryKey: ['admin-users', searchQuery, roleFilter, orgFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (searchQuery) params.append('search', searchQuery)
      if (roleFilter !== 'all') params.append('role', roleFilter)
      if (orgFilter !== 'all') params.append('organizationId', orgFilter)
      
      const response = await axios.get(`${API_URL}/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data
    },
    enabled: isHydrated && !!token,
  })

  // Fetch all organizations
  const { data: orgsData, isLoading: isLoadingOrgs, refetch: refetchOrgs } = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/admin/organizations`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data
    },
    enabled: isHydrated && !!token,
  })

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: typeof userFormData) => {
      const response = await axios.post(`${API_URL}/admin/users`, data, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data
    },
    onSuccess: () => {
      toast.success("User created successfully")
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
      setIsUserDialogOpen(false)
      resetUserForm()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to create user")
    }
  })

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: Partial<typeof userFormData> }) => {
      const response = await axios.put(`${API_URL}/admin/users/${id}`, data, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data
    },
    onSuccess: () => {
      toast.success("User updated successfully")
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setIsUserDialogOpen(false)
      resetUserForm()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to update user")
    }
  })

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await axios.delete(`${API_URL}/admin/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data
    },
    onSuccess: () => {
      toast.success("User deleted successfully")
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
      setIsDeleteDialogOpen(false)
      setSelectedUser(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to delete user")
    }
  })

  // Verify user mutation (admin action)
  const verifyUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await axios.post(`${API_URL}/admin/users/${id}/verify`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data
    },
    onSuccess: () => {
      toast.success("User verified successfully")
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to verify user")
    }
  })

  // Copy verification link
  const handleCopyVerificationLink = async (userId: string) => {
    try {
      const response = await axios.get(`${API_URL}/admin/users/${userId}/verification-link`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.data.verified) {
        toast.info("User is already verified")
        return
      }
      await navigator.clipboard.writeText(response.data.verificationLink)
      toast.success("Verification link copied to clipboard")
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to get verification link")
    }
  }

  // Create organization mutation
  const createOrgMutation = useMutation({
    mutationFn: async (data: typeof orgFormData) => {
      const response = await axios.post(`${API_URL}/admin/organizations`, data, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data
    },
    onSuccess: () => {
      toast.success("Organization created successfully")
      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
      setIsOrgDialogOpen(false)
      resetOrgForm()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to create organization")
    }
  })

  // Update organization mutation
  const updateOrgMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: Partial<typeof orgFormData> }) => {
      const response = await axios.put(`${API_URL}/admin/organizations/${id}`, data, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data
    },
    onSuccess: () => {
      toast.success("Organization updated successfully")
      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] })
      setIsOrgDialogOpen(false)
      resetOrgForm()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to update organization")
    }
  })

  // Delete organization mutation
  const deleteOrgMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await axios.delete(`${API_URL}/admin/organizations/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data
    },
    onSuccess: () => {
      toast.success("Organization deleted successfully")
      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
      setIsDeleteOrgDialogOpen(false)
      setSelectedOrg(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to delete organization")
    }
  })

  const resetUserForm = () => {
    setUserFormData({
      email: "",
      firstName: "",
      lastName: "",
      phone: "",
      role: "member",
      password: "",
      organizationId: "",
    })
    setSelectedUser(null)
  }

  const resetOrgForm = () => {
    setOrgFormData({
      name: "",
      slug: "",
      website: "",
      timezone: "America/New_York",
    })
    setSelectedOrg(null)
  }

  const openEditUser = (user: User) => {
    setSelectedUser(user)
    setUserFormData({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone || "",
      role: user.role,
      password: "",
      organizationId: user.organizationId,
    })
    setIsUserDialogOpen(true)
  }

  const openEditOrg = (org: Organization) => {
    setSelectedOrg(org)
    setOrgFormData({
      name: org.name,
      slug: org.slug,
      website: org.website || "",
      timezone: org.timezone,
    })
    setIsOrgDialogOpen(true)
  }

  const handleUserSubmit = () => {
    if (selectedUser) {
      const updateData: any = { ...userFormData }
      if (!updateData.password) delete updateData.password
      updateUserMutation.mutate({ id: selectedUser.id, data: updateData })
    } else {
      createUserMutation.mutate(userFormData)
    }
  }

  const handleOrgSubmit = () => {
    if (selectedOrg) {
      updateOrgMutation.mutate({ id: selectedOrg.id, data: orgFormData })
    } else {
      createOrgMutation.mutate(orgFormData)
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="h-4 w-4 text-yellow-500" />
      case 'admin': return <Shield className="h-4 w-4 text-blue-500" />
      default: return <User className="h-4 w-4 text-gray-500" />
    }
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner': return 'default'
      case 'admin': return 'secondary'
      default: return 'outline'
    }
  }

  if (!isHydrated) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!token) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Please log in to access admin dashboard.</p>
        <a href="/login" className="text-primary underline">Go to Login</a>
      </div>
    )
  }

  const users = usersData?.users || []
  const organizations = orgsData?.organizations || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Manage users, organizations, and system settings
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { refetchUsers(); refetchOrgs(); }}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
            <p className="text-xs text-muted-foreground">
              +{stats?.newUsersThisMonth || 0} this month
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Organizations</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalOrganizations || 0}</div>
            <p className="text-xs text-muted-foreground">Active accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeUsers || 0}</div>
            <p className="text-xs text-muted-foreground">Logged in last 30 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Admins</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(stats?.usersByRole?.owner || 0) + (stats?.usersByRole?.admin || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.usersByRole?.owner || 0} owners, {stats?.usersByRole?.admin || 0} admins
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="organizations" className="gap-2">
            <Building2 className="h-4 w-4" />
            Organizations
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>User Management</CardTitle>
                  <CardDescription>View and manage all users across organizations</CardDescription>
                </div>
                <Button onClick={() => { resetUserForm(); setIsUserDialogOpen(true); }}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add User
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={orgFilter} onValueChange={setOrgFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Organization" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Organizations</SelectItem>
                    {organizations.map((org: Organization) => (
                      <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Users Table */}
              {isLoadingUsers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Organization</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Login</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No users found
                          </TableCell>
                        </TableRow>
                      ) : (
                        users.map((user: User) => (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                  <span className="text-sm font-medium">
                                    {user.firstName?.[0]}{user.lastName?.[0]}
                                  </span>
                                </div>
                                <div>
                                  <p className="font-medium">{user.firstName} {user.lastName}</p>
                                  <p className="text-sm text-muted-foreground">{user.email}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={getRoleBadgeVariant(user.role) as any} className="gap-1">
                                {getRoleIcon(user.role)}
                                {user.role}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{user.organization?.name || '-'}</span>
                            </TableCell>
                            <TableCell>
                              {user.emailVerified ? (
                                <Badge variant="outline" className="text-green-600 border-green-600">
                                  <CheckCircle className="mr-1 h-3 w-3" />
                                  Verified
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                                  <XCircle className="mr-1 h-3 w-3" />
                                  Unverified
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {user.lastLoginAt 
                                  ? format(new Date(user.lastLoginAt), 'MMM d, yyyy')
                                  : 'Never'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {format(new Date(user.createdAt), 'MMM d, yyyy')}
                              </span>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => openEditUser(user)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem>
                                    <Key className="mr-2 h-4 w-4" />
                                    Reset Password
                                  </DropdownMenuItem>
                                  {!user.emailVerified && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onClick={() => verifyUserMutation.mutate(user.id)}>
                                        <ShieldCheck className="mr-2 h-4 w-4 text-green-600" />
                                        Verify User
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleCopyVerificationLink(user.id)}>
                                        <Link2 className="mr-2 h-4 w-4" />
                                        Copy Verification Link
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    className="text-destructive"
                                    onClick={() => { setSelectedUser(user); setIsDeleteDialogOpen(true); }}
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
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Organizations Tab */}
        <TabsContent value="organizations" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Organization Management</CardTitle>
                  <CardDescription>View and manage all organizations</CardDescription>
                </div>
                <Button onClick={() => { resetOrgForm(); setIsOrgDialogOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Organization
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingOrgs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Organization</TableHead>
                        <TableHead>Slug</TableHead>
                        <TableHead>Users</TableHead>
                        <TableHead>Timezone</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {organizations.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No organizations found
                          </TableCell>
                        </TableRow>
                      ) : (
                        organizations.map((org: Organization) => (
                          <TableRow key={org.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                  <Building2 className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                  <p className="font-medium">{org.name}</p>
                                  {org.website && (
                                    <p className="text-sm text-muted-foreground">{org.website}</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <code className="text-sm bg-muted px-2 py-1 rounded">{org.slug}</code>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{org._count?.users || 0} users</Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{org.timezone}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {format(new Date(org.createdAt), 'MMM d, yyyy')}
                              </span>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => openEditOrg(org)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    className="text-destructive"
                                    onClick={() => { setSelectedOrg(org); setIsDeleteOrgDialogOpen(true); }}
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
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* User Dialog */}
      <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{selectedUser ? 'Edit User' : 'Add New User'}</DialogTitle>
            <DialogDescription>
              {selectedUser ? 'Update user information and permissions.' : 'Create a new user account.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={userFormData.firstName}
                  onChange={(e) => setUserFormData({ ...userFormData, firstName: e.target.value })}
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={userFormData.lastName}
                  onChange={(e) => setUserFormData({ ...userFormData, lastName: e.target.value })}
                  placeholder="Doe"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={userFormData.email}
                onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                placeholder="john@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={userFormData.phone}
                onChange={(e) => setUserFormData({ ...userFormData, phone: e.target.value })}
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <Select 
                  value={userFormData.role} 
                  onValueChange={(value: "owner" | "admin" | "member") => 
                    setUserFormData({ ...userFormData, role: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="organization">Organization *</Label>
                <Select 
                  value={userFormData.organizationId} 
                  onValueChange={(value) => setUserFormData({ ...userFormData, organizationId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org: Organization) => (
                      <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">
                {selectedUser ? 'New Password (leave blank to keep current)' : 'Password *'}
              </Label>
              <Input
                id="password"
                type="password"
                value={userFormData.password}
                onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                placeholder="••••••••"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUserDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUserSubmit}
              disabled={createUserMutation.isPending || updateUserMutation.isPending}
            >
              {(createUserMutation.isPending || updateUserMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {selectedUser ? 'Update User' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Organization Dialog */}
      <Dialog open={isOrgDialogOpen} onOpenChange={setIsOrgDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{selectedOrg ? 'Edit Organization' : 'Add New Organization'}</DialogTitle>
            <DialogDescription>
              {selectedOrg ? 'Update organization details.' : 'Create a new organization.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name *</Label>
              <Input
                id="orgName"
                value={orgFormData.name}
                onChange={(e) => setOrgFormData({ ...orgFormData, name: e.target.value })}
                placeholder="Acme Inc."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug *</Label>
              <Input
                id="slug"
                value={orgFormData.slug}
                onChange={(e) => setOrgFormData({ ...orgFormData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                placeholder="acme-inc"
              />
              <p className="text-xs text-muted-foreground">URL-friendly identifier (lowercase, no spaces)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                value={orgFormData.website}
                onChange={(e) => setOrgFormData({ ...orgFormData, website: e.target.value })}
                placeholder="https://acme.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select 
                value={orgFormData.timezone} 
                onValueChange={(value) => setOrgFormData({ ...orgFormData, timezone: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                  <SelectItem value="America/Chicago">America/Chicago (CST)</SelectItem>
                  <SelectItem value="America/Denver">America/Denver (MST)</SelectItem>
                  <SelectItem value="America/Los_Angeles">America/Los_Angeles (PST)</SelectItem>
                  <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                  <SelectItem value="Europe/Paris">Europe/Paris (CET)</SelectItem>
                  <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOrgDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleOrgSubmit}
              disabled={createOrgMutation.isPending || updateOrgMutation.isPending}
            >
              {(createOrgMutation.isPending || updateOrgMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {selectedOrg ? 'Update Organization' : 'Create Organization'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedUser?.firstName} {selectedUser?.lastName}? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => selectedUser && deleteUserMutation.mutate(selectedUser.id)}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Organization Confirmation */}
      <AlertDialog open={isDeleteOrgDialogOpen} onOpenChange={setIsDeleteOrgDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedOrg?.name}? 
              This will also delete all users and data associated with this organization.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => selectedOrg && deleteOrgMutation.mutate(selectedOrg.id)}
              disabled={deleteOrgMutation.isPending}
            >
              {deleteOrgMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
