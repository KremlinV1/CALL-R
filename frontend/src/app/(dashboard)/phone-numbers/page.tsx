'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Phone, Loader2, Trash2, Plus, Search, Edit, Download, ShoppingCart,
  Check, X, Tag, Bot, Globe, PhoneCall, MessageSquare, Shield,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`;

interface CallerIdProfile {
  id: string;
  name: string;
  displayNumber: string;
  displayName: string | null;
  mode: string;
  isDefault: boolean;
}

interface PhoneNumber {
  id: string;
  number: string;
  provider: string | null;
  providerSid: string | null;
  label: string | null;
  type: string;
  status: string;
  agentId: string | null;
  callerIdProfileId: string | null;
  capabilities: {
    voice?: boolean;
    sms?: boolean;
    mms?: boolean;
    fax?: boolean;
  } | null;
  createdAt: string;
}

interface TelnyxNumber {
  number: string;
  region: string;
  type: string;
  monthlyRate?: string;
  upfrontCost?: string;
  features: string[];
}

interface TelnyxOwnedNumber {
  id: string;
  number: string;
  status: string;
  type: string;
  connectionId: string;
  capabilities: { voice: boolean; sms: boolean };
}

const formatPhoneNumber = (number: string) => {
  const cleaned = number.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+1') && cleaned.length === 12) {
    return `${cleaned.slice(0, 2)} (${cleaned.slice(2, 5)}) ${cleaned.slice(5, 8)}-${cleaned.slice(8)}`;
  }
  return cleaned.startsWith('+') && cleaned.length > 5 ? cleaned : number;
};

export default function PhoneNumbersPage() {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingNumber, setEditingNumber] = useState<PhoneNumber | null>(null);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [didwwImportOpen, setDidwwImportOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');

  // ─── Data Queries ───────────────────────────────────────────────────

  const { data, isLoading, error } = useQuery({
    queryKey: ['phone-numbers'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/phone-numbers/db`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data as { numbers: PhoneNumber[]; total: number };
    },
    enabled: !!token,
  });

  const { data: agentsData } = useQuery({
    queryKey: ['phone-number-agents'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/phone-numbers/agents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    },
    enabled: !!token,
  });

  const { data: callerIdData } = useQuery({
    queryKey: ['caller-id-profiles'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/caller-id`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    },
    enabled: !!token,
  });

  const agentsList: { id: string; name: string }[] = agentsData?.agents || [];
  const callerIdProfiles: CallerIdProfile[] = callerIdData?.profiles || [];
  const phoneNumbers = data?.numbers || [];
  const filtered = phoneNumbers.filter(
    (n) =>
      n.number.includes(filterQuery) ||
      (n.label || '').toLowerCase().includes(filterQuery.toLowerCase()) ||
      (n.provider || '').toLowerCase().includes(filterQuery.toLowerCase())
  );

  // ─── Mutations ──────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`${API_URL}/phone-numbers/db/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      toast.success('Phone number removed');
      queryClient.invalidateQueries({ queryKey: ['phone-numbers'] });
    },
    onError: () => toast.error('Failed to remove phone number'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; label?: string; agentId?: string | null; callerIdProfileId?: string | null; status?: string }) => {
      const res = await axios.put(`${API_URL}/phone-numbers/db/${id}`, data, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Phone number updated');
      queryClient.invalidateQueries({ queryKey: ['phone-numbers'] });
      setEditingNumber(null);
    },
    onError: () => toast.error('Failed to update phone number'),
  });

  // ─── Stats ──────────────────────────────────────────────────────────

  const activeCount = phoneNumbers.filter((n) => n.status === 'active').length;
  const voiceCount = phoneNumbers.filter((n) => (n.capabilities as any)?.voice).length;
  const smsCount = phoneNumbers.filter((n) => (n.capabilities as any)?.sms).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Phone Numbers</h1>
          <p className="text-muted-foreground">
            Manage your phone number pool for calls and campaigns
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDidwwImportOpen(true)}>
            <Download className="mr-2 h-4 w-4" />
            Import from DIDWW
          </Button>
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Download className="mr-2 h-4 w-4" />
            Import from Telnyx
          </Button>
          <Button variant="outline" onClick={() => setSearchDialogOpen(true)}>
            <ShoppingCart className="mr-2 h-4 w-4" />
            Buy Number
          </Button>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Number
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total</span>
            </div>
            <p className="text-2xl font-bold mt-1">{phoneNumbers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Active</span>
            </div>
            <p className="text-2xl font-bold mt-1">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Voice</span>
            </div>
            <p className="text-2xl font-bold mt-1">{voiceCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">SMS</span>
            </div>
            <p className="text-2xl font-bold mt-1">{smsCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter by number, label, provider..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Numbers List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Your Phone Numbers
          </CardTitle>
          <CardDescription>
            Numbers in your pool for outbound campaigns, IVR, and calls
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">Loading your numbers...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 border rounded-lg border-dashed">
              <Phone className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <h3 className="text-lg font-semibold mb-2">Could not load phone numbers</h3>
              <p className="text-sm text-muted-foreground">
                {(error as any)?.response?.data?.error || 'Something went wrong.'}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 border rounded-lg border-dashed">
              <Phone className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <h3 className="text-lg font-semibold mb-2">
                {phoneNumbers.length === 0 ? 'No phone numbers' : 'No matches'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {phoneNumbers.length === 0
                  ? 'Add a number manually, buy from Telnyx, or import existing ones.'
                  : 'Try a different search.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((num) => {
                const agent = agentsList.find((a) => a.id === num.agentId);
                return (
                  <div
                    key={num.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                        <Phone className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium font-mono text-lg">
                            {formatPhoneNumber(num.number)}
                          </p>
                          {num.label && (
                            <Badge variant="secondary" className="text-xs">
                              <Tag className="h-3 w-3 mr-1" />
                              {num.label}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {num.provider && (
                            <Badge variant="outline" className="text-xs capitalize">{num.provider}</Badge>
                          )}
                          <Badge variant="outline" className="text-xs">{num.type}</Badge>
                          {(num.capabilities as any)?.voice && <Badge variant="secondary" className="text-xs">Voice</Badge>}
                          {(num.capabilities as any)?.sms && <Badge variant="secondary" className="text-xs">SMS</Badge>}
                          {num.status === 'active' ? (
                            <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">{num.status}</Badge>
                          )}
                          {agent && (
                            <Badge variant="outline" className="text-xs">
                              <Bot className="h-3 w-3 mr-1" />{agent.name}
                            </Badge>
                          )}
                          {(() => {
                            const cid = callerIdProfiles.find((p) => p.id === num.callerIdProfileId);
                            return cid ? (
                              <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/20">
                                <Shield className="h-3 w-3 mr-1" />{cid.name} ({cid.displayNumber})
                              </Badge>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingNumber(num)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (confirm('Remove this phone number?')) deleteMutation.mutate(num.id);
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Number Dialog */}
      <AddNumberDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        token={token}
        agents={agentsList}
        callerIdProfiles={callerIdProfiles}
      />

      {/* Edit Number Dialog */}
      <EditNumberDialog
        open={!!editingNumber}
        onOpenChange={(v) => !v && setEditingNumber(null)}
        phoneNumber={editingNumber}
        agents={agentsList}
        callerIdProfiles={callerIdProfiles}
        onSave={(data) => editingNumber && updateMutation.mutate({ id: editingNumber.id, ...data })}
        isSaving={updateMutation.isPending}
      />

      {/* Search & Buy Dialog */}
      <SearchBuyDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
        token={token}
      />

      {/* Import from Telnyx Dialog */}
      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        token={token}
      />

      {/* Import from DIDWW Dialog */}
      <DIDWWImportDialog
        open={didwwImportOpen}
        onOpenChange={setDidwwImportOpen}
        token={token}
      />
    </div>
  );
}

// ─── Add Number Dialog ──────────────────────────────────────────────────────

function AddNumberDialog({
  open, onOpenChange, token, agents, callerIdProfiles,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  token: string | null;
  agents: { id: string; name: string }[];
  callerIdProfiles: CallerIdProfile[];
}) {
  const queryClient = useQueryClient();
  const [number, setNumber] = useState('');
  const [label, setLabel] = useState('');
  const [provider, setProvider] = useState('telnyx');
  const [agentId, setAgentId] = useState('');
  const [callerIdProfileId, setCallerIdProfileId] = useState('');
  const [type, setType] = useState('local');

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await axios.post(
        `${API_URL}/phone-numbers/db`,
        { number, label: label || undefined, provider, agentId: agentId || undefined, callerIdProfileId: callerIdProfileId || undefined, type },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return res.data;
    },
    onSuccess: () => {
      toast.success('Phone number added');
      queryClient.invalidateQueries({ queryKey: ['phone-numbers'] });
      onOpenChange(false);
      setNumber(''); setLabel(''); setAgentId(''); setCallerIdProfileId('');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to add number'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Phone Number</DialogTitle>
          <DialogDescription>Manually add a phone number to your pool</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Phone Number *</Label>
            <Input placeholder="+12125551234" value={number} onChange={(e) => setNumber(e.target.value)} />
            <p className="text-xs text-muted-foreground">E.164 format preferred (e.g. +12125551234)</p>
          </div>
          <div className="space-y-2">
            <Label>Label</Label>
            <Input placeholder="Sales Line, Support, etc." value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="telnyx">Telnyx</SelectItem>
                  <SelectItem value="twilio">Twilio</SelectItem>
                  <SelectItem value="signalwire">SignalWire</SelectItem>
                  <SelectItem value="vonage">Vonage</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="toll_free">Toll-Free</SelectItem>
                  <SelectItem value="mobile">Mobile</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {agents.length > 0 && (
            <div className="space-y-2">
              <Label>Assign to Agent</Label>
              <Select value={agentId || 'none'} onValueChange={(v) => setAgentId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {callerIdProfiles.length > 0 && (
            <div className="space-y-2">
              <Label>Caller ID Profile</Label>
              <Select value={callerIdProfileId || 'none'} onValueChange={(v) => setCallerIdProfileId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (use default)</SelectItem>
                  {callerIdProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <Shield className="h-3 w-3" />
                        {p.name} — {p.displayNumber}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Outbound calls from this number will show the selected caller ID</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => addMutation.mutate()} disabled={!number.trim() || addMutation.isPending}>
            {addMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add Number
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Number Dialog ─────────────────────────────────────────────────────

function EditNumberDialog({
  open, onOpenChange, phoneNumber, agents, callerIdProfiles, onSave, isSaving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  phoneNumber: PhoneNumber | null;
  agents: { id: string; name: string }[];
  callerIdProfiles: CallerIdProfile[];
  onSave: (data: { label?: string; agentId?: string | null; callerIdProfileId?: string | null; status?: string }) => void;
  isSaving: boolean;
}) {
  const [label, setLabel] = useState('');
  const [agentId, setAgentId] = useState('');
  const [callerIdProfileId, setCallerIdProfileId] = useState('');
  const [status, setStatus] = useState('active');

  // Sync state when phone number changes
  useState(() => {
    if (phoneNumber) {
      setLabel(phoneNumber.label || '');
      setAgentId(phoneNumber.agentId || '');
      setCallerIdProfileId(phoneNumber.callerIdProfileId || '');
      setStatus(phoneNumber.status || 'active');
    }
  });

  if (!phoneNumber) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Phone Number</DialogTitle>
          <DialogDescription>Update metadata for {formatPhoneNumber(phoneNumber.number)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Sales, Support" />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {agents.length > 0 && (
            <div className="space-y-2">
              <Label>Assign to Agent</Label>
              <Select value={agentId || 'none'} onValueChange={(v) => setAgentId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {callerIdProfiles.length > 0 && (
            <div className="space-y-2">
              <Label>Caller ID Profile</Label>
              <Select value={callerIdProfileId || 'none'} onValueChange={(v) => setCallerIdProfileId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (use default)</SelectItem>
                  {callerIdProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <Shield className="h-3 w-3" />
                        {p.name} — {p.displayNumber}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Outbound calls from this number will show the selected caller ID</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => onSave({ label, agentId: agentId || null, callerIdProfileId: callerIdProfileId || null, status })}
            disabled={isSaving}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Search & Buy Dialog ────────────────────────────────────────────────────

function SearchBuyDialog({
  open, onOpenChange, token,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  token: string | null;
}) {
  const queryClient = useQueryClient();
  const [areaCode, setAreaCode] = useState('');
  const [contains, setContains] = useState('');
  const [buyingNumber, setBuyingNumber] = useState<string | null>(null);

  const searchQuery = useQuery({
    queryKey: ['telnyx-search', areaCode, contains],
    queryFn: async () => {
      const params = new URLSearchParams({ countryCode: 'US', limit: '20' });
      if (areaCode) params.set('areaCode', areaCode);
      if (contains) params.set('contains', contains);
      const res = await axios.get(`${API_URL}/phone-numbers/telnyx/search?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    },
    enabled: !!token && open && (!!areaCode || !!contains),
  });

  const buyMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      setBuyingNumber(phoneNumber);
      const res = await axios.post(
        `${API_URL}/phone-numbers/telnyx/buy`,
        { phoneNumber },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Purchased ${data.number} and added to your pool`);
      queryClient.invalidateQueries({ queryKey: ['phone-numbers'] });
      setBuyingNumber(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to purchase number');
      setBuyingNumber(null);
    },
  });

  const results: TelnyxNumber[] = searchQuery.data?.numbers || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buy Phone Number from Telnyx</DialogTitle>
          <DialogDescription>Search and purchase numbers — they're auto-imported to your pool</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Area Code</Label>
              <Input placeholder="212, 310, 415..." value={areaCode} onChange={(e) => setAreaCode(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Contains</Label>
              <Input placeholder="Digits to match..." value={contains} onChange={(e) => setContains(e.target.value)} />
            </div>
          </div>

          {searchQuery.isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-2">Searching...</p>
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {results.map((num) => (
                <div key={num.number} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-mono font-medium">{formatPhoneNumber(num.number)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {num.region && <Badge variant="outline" className="text-xs">{num.region}</Badge>}
                      <Badge variant="outline" className="text-xs">{num.type}</Badge>
                      {num.monthlyRate && <span className="text-xs text-muted-foreground">${num.monthlyRate}/mo</span>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => buyMutation.mutate(num.number)}
                    disabled={buyMutation.isPending}
                  >
                    {buyingNumber === num.number ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <ShoppingCart className="mr-1 h-3 w-3" /> Buy
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          ) : (areaCode || contains) ? (
            <p className="text-center text-sm text-muted-foreground py-6">No numbers found. Try a different search.</p>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-6">Enter an area code or pattern to search.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Import from Telnyx Dialog ──────────────────────────────────────────────

function ImportDialog({
  open, onOpenChange, token,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  token: string | null;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const ownedQuery = useQuery({
    queryKey: ['telnyx-owned'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/phone-numbers/telnyx/owned`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    },
    enabled: !!token && open,
  });

  const importMutation = useMutation({
    mutationFn: async (numbers: { number: string; id: string; type: string; capabilities: any }[]) => {
      const res = await axios.post(
        `${API_URL}/phone-numbers/telnyx/import`,
        { numbers },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported} number(s)${data.skipped ? `, ${data.skipped} already existed` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['phone-numbers'] });
      setSelected(new Set());
      onOpenChange(false);
    },
    onError: () => toast.error('Failed to import numbers'),
  });

  const owned: TelnyxOwnedNumber[] = ownedQuery.data?.numbers || [];

  const toggleSelect = (num: string) => {
    const next = new Set(selected);
    next.has(num) ? next.delete(num) : next.add(num);
    setSelected(next);
  };

  const handleImport = () => {
    const nums = owned
      .filter((n) => selected.has(n.number))
      .map((n) => ({ number: n.number, id: n.id, type: n.type, capabilities: n.capabilities }));
    importMutation.mutate(nums);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import from Telnyx Account</DialogTitle>
          <DialogDescription>Select numbers from your Telnyx account to import into the pool</DialogDescription>
        </DialogHeader>

        {ownedQuery.isLoading ? (
          <div className="text-center py-8">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground mt-2">Loading Telnyx numbers...</p>
          </div>
        ) : ownedQuery.error ? (
          <div className="text-center py-8">
            <X className="mx-auto h-8 w-8 text-destructive mb-2" />
            <p className="text-sm text-muted-foreground">
              {(ownedQuery.error as any)?.response?.data?.error || 'Failed to load Telnyx numbers'}
            </p>
          </div>
        ) : owned.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">No numbers found in your Telnyx account.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{owned.length} numbers found, {selected.size} selected</p>
              <Button variant="ghost" size="sm" onClick={() => setSelected(selected.size === owned.length ? new Set() : new Set(owned.map((n) => n.number)))}>
                {selected.size === owned.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {owned.map((num) => (
                <label
                  key={num.id}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors ${
                    selected.has(num.number) ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(num.number)}
                    onChange={() => toggleSelect(num.number)}
                    className="h-4 w-4"
                  />
                  <div className="flex-1">
                    <p className="font-mono font-medium">{formatPhoneNumber(num.number)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">{num.type}</Badge>
                      <Badge variant={num.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                        {num.status}
                      </Badge>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleImport} disabled={selected.size === 0 || importMutation.isPending}>
            {importMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Import {selected.size} Number{selected.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── DIDWW Import Dialog ─────────────────────────────────────────────────────

interface DIDWWNumber {
  id: string;
  number: string;
  status: string;
  type: string;
  trunkId: string | null;
}

function DIDWWImportDialog({
  open, onOpenChange, token,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  token: string | null;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const didwwQuery = useQuery({
    queryKey: ['didww-dids'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/didww/dids`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    },
    enabled: !!token && open,
  });

  const balanceQuery = useQuery({
    queryKey: ['didww-balance'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/didww/balance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    },
    enabled: !!token && open,
  });

  const importMutation = useMutation({
    mutationFn: async (numbers: { number: string; id: string; type: string }[]) => {
      const res = await axios.post(
        `${API_URL}/didww/dids/import`,
        { numbers },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported} number(s)${data.skipped ? `, ${data.skipped} already existed` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['phone-numbers'] });
      setSelected(new Set());
      onOpenChange(false);
    },
    onError: () => toast.error('Failed to import numbers'),
  });

  const owned: DIDWWNumber[] = didwwQuery.data?.numbers || [];

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const handleImport = () => {
    const nums = owned
      .filter((n) => selected.has(n.id))
      .map((n) => ({ number: n.number, id: n.id, type: n.type }));
    importMutation.mutate(nums);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import from DIDWW Account</DialogTitle>
          <DialogDescription>
            Select DID numbers from your DIDWW account to import into the pool
            {balanceQuery.data && (
              <span className="ml-2 font-medium text-foreground">
                • Balance: ${balanceQuery.data.balance} {balanceQuery.data.currency}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {didwwQuery.isLoading ? (
          <div className="text-center py-8">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground mt-2">Loading DIDWW numbers...</p>
          </div>
        ) : didwwQuery.error ? (
          <div className="text-center py-8">
            <X className="mx-auto h-8 w-8 text-destructive mb-2" />
            <p className="text-sm text-muted-foreground">
              {(didwwQuery.error as any)?.response?.data?.error || 'Failed to load DIDWW numbers'}
            </p>
          </div>
        ) : owned.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">No DID numbers found in your DIDWW account.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{owned.length} DIDs found, {selected.size} selected</p>
              <Button variant="ghost" size="sm" onClick={() => setSelected(selected.size === owned.length ? new Set() : new Set(owned.map((n) => n.id)))}>
                {selected.size === owned.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {owned.map((num) => (
                <label
                  key={num.id}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors ${
                    selected.has(num.id) ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(num.id)}
                    onChange={() => toggleSelect(num.id)}
                    className="h-4 w-4"
                  />
                  <div className="flex-1">
                    <p className="font-mono font-medium">{formatPhoneNumber(num.number)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">DIDWW</Badge>
                      <Badge variant="outline" className="text-xs">{num.type}</Badge>
                      <Badge variant={num.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                        {num.status}
                      </Badge>
                      {num.trunkId && (
                        <Badge variant="secondary" className="text-xs">Trunk assigned</Badge>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleImport} disabled={selected.size === 0 || importMutation.isPending}>
            {importMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Import {selected.size} Number{selected.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
