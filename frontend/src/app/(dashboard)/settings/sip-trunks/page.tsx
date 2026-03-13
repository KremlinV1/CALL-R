'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Phone, Loader2, Trash2, Plus, Server, ArrowDownToLine, ArrowUpFromLine,
  Shield, Globe, Settings2, Check, X, RefreshCw, Wallet,
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
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`;

interface InboundTrunk {
  id: string;
  name: string;
  priority: number;
  weight: number;
  capacityLimit: number;
  cliFormat: string;
  description: string;
  ringingTimeout: number;
  createdAt: string;
  configuration: any;
}

interface OutboundTrunk {
  id: string;
  name: string;
  username: string;
  password: string;
  allowedSipIps: string[];
  allowedRtpIps: string[];
  allowAnyDidAsCli: boolean;
  onCliMismatchAction: string;
  capacityLimit: number;
  status: string;
  thresholdAmount: string;
  thresholdReached: boolean;
  mediaEncryptionMode: string;
  createdAt: string;
}

export default function SipTrunksPage() {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const [createInOpen, setCreateInOpen] = useState(false);
  const [createOutOpen, setCreateOutOpen] = useState(false);

  // ─── Queries ───────────────────────────────────────────────────────

  const { data: balanceData } = useQuery({
    queryKey: ['didww-balance'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/didww/balance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    },
    enabled: !!token,
  });

  const { data: inboundData, isLoading: inLoading } = useQuery({
    queryKey: ['didww-trunks-in'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/didww/trunks/in`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    },
    enabled: !!token,
  });

  const { data: outboundData, isLoading: outLoading } = useQuery({
    queryKey: ['didww-trunks-out'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/didww/trunks/out`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    },
    enabled: !!token,
  });

  const inboundTrunks: InboundTrunk[] = inboundData?.trunks || [];
  const outboundTrunks: OutboundTrunk[] = outboundData?.trunks || [];

  // ─── Delete Mutations ─────────────────────────────────────────────

  const deleteInMutation = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`${API_URL}/didww/trunks/in/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      toast.success('Inbound trunk deleted');
      queryClient.invalidateQueries({ queryKey: ['didww-trunks-in'] });
    },
    onError: () => toast.error('Failed to delete inbound trunk'),
  });

  const deleteOutMutation = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`${API_URL}/didww/trunks/out/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      toast.success('Outbound trunk deleted');
      queryClient.invalidateQueries({ queryKey: ['didww-trunks-out'] });
    },
    onError: () => toast.error('Failed to delete outbound trunk'),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SIP Trunks</h1>
          <p className="text-muted-foreground">
            Manage DIDWW inbound and outbound SIP trunks for voice routing
          </p>
        </div>
        {balanceData && (
          <Card className="px-4 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">DIDWW Balance:</span>
              <span className="font-bold">${balanceData.balance} {balanceData.currency}</span>
            </div>
          </Card>
        )}
      </div>

      {/* Tabs for Inbound / Outbound */}
      <Tabs defaultValue="inbound" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inbound" className="flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4" />
            Inbound Trunks
          </TabsTrigger>
          <TabsTrigger value="outbound" className="flex items-center gap-2">
            <ArrowUpFromLine className="h-4 w-4" />
            Outbound Trunks
          </TabsTrigger>
        </TabsList>

        {/* ─── Inbound Trunks Tab ────────────────────────────────────── */}
        <TabsContent value="inbound" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Inbound trunks receive calls from DIDWW DIDs and route them to your SIP endpoint
            </p>
            <Button onClick={() => setCreateInOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create Inbound Trunk
            </Button>
          </div>

          {inLoading ? (
            <div className="text-center py-8">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : inboundTrunks.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Server className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <h3 className="font-semibold mb-1">No Inbound Trunks</h3>
                <p className="text-sm text-muted-foreground">Create an inbound SIP trunk to start receiving calls from your DIDWW DIDs.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {inboundTrunks.map((trunk) => {
                const sipConf = trunk.configuration?.attributes || {};
                return (
                  <Card key={trunk.id}>
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/10">
                          <ArrowDownToLine className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium">{trunk.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs font-mono">
                              {sipConf.host || 'N/A'}:{sipConf.port || 5060}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              Priority: {trunk.priority}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              Cap: {trunk.capacityLimit || '∞'}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              CLI: {trunk.cliFormat || 'raw'}
                            </Badge>
                            {sipConf.auth_enabled && (
                              <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
                                <Shield className="h-3 w-3 mr-1" /> Auth
                              </Badge>
                            )}
                          </div>
                          {trunk.description && (
                            <p className="text-xs text-muted-foreground mt-1">{trunk.description}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (confirm('Delete this inbound trunk?')) deleteInMutation.mutate(trunk.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Outbound Trunks Tab ───────────────────────────────────── */}
        <TabsContent value="outbound" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Outbound trunks route voice traffic from your server to PSTN through DIDWW
            </p>
            <Button onClick={() => setCreateOutOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create Outbound Trunk
            </Button>
          </div>

          {outLoading ? (
            <div className="text-center py-8">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : outboundTrunks.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Server className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <h3 className="font-semibold mb-1">No Outbound Trunks</h3>
                <p className="text-sm text-muted-foreground">Create an outbound SIP trunk to make calls through DIDWW.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {outboundTrunks.map((trunk) => (
                <Card key={trunk.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-500/10">
                        <ArrowUpFromLine className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium">{trunk.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {trunk.status === 'active' ? (
                            <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">{trunk.status}</Badge>
                          )}
                          <Badge variant="outline" className="text-xs font-mono">
                            SIP User: {trunk.username || 'N/A'}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            Cap: {trunk.capacityLimit || '∞'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Limit: ${trunk.thresholdAmount}/24h
                          </Badge>
                          {trunk.allowAnyDidAsCli && (
                            <Badge variant="secondary" className="text-xs">Any DID as CLI</Badge>
                          )}
                          {trunk.thresholdReached && (
                            <Badge variant="destructive" className="text-xs">Threshold Reached</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            SIP IPs: {trunk.allowedSipIps?.join(', ') || 'none'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm('Delete this outbound trunk?')) deleteOutMutation.mutate(trunk.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Inbound Trunk Dialog */}
      <CreateInboundTrunkDialog
        open={createInOpen}
        onOpenChange={setCreateInOpen}
        token={token}
      />

      {/* Create Outbound Trunk Dialog */}
      <CreateOutboundTrunkDialog
        open={createOutOpen}
        onOpenChange={setCreateOutOpen}
        token={token}
      />
    </div>
  );
}

// ─── Create Inbound Trunk Dialog ─────────────────────────────────────────────

function CreateInboundTrunkDialog({
  open, onOpenChange, token,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  token: string | null;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('5060');
  const [username, setUsername] = useState('{DID}');
  const [capacityLimit, setCapacityLimit] = useState('10');
  const [cliFormat, setCliFormat] = useState('e164');
  const [transportProtocol, setTransportProtocol] = useState('1');
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authUser, setAuthUser] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await axios.post(
        `${API_URL}/didww/trunks/in`,
        {
          name,
          capacityLimit: parseInt(capacityLimit) || 10,
          cliFormat,
          configuration: {
            type: 'sip_configurations',
            attributes: {
              username,
              host,
              port: parseInt(port) || 5060,
              transportProtocolId: parseInt(transportProtocol),
              authEnabled,
              authUser: authEnabled ? authUser : '',
              authPassword: authEnabled ? authPassword : '',
            },
          },
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return res.data;
    },
    onSuccess: () => {
      toast.success('Inbound trunk created');
      queryClient.invalidateQueries({ queryKey: ['didww-trunks-in'] });
      onOpenChange(false);
      setName(''); setHost('');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create trunk'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Inbound SIP Trunk</DialogTitle>
          <DialogDescription>
            Route incoming calls from your DIDWW DIDs to your SIP endpoint
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Trunk Name *</Label>
            <Input placeholder="e.g. Main Office, AI Agents" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Host (IP/Domain) *</Label>
              <Input placeholder="sip.example.com" value={host} onChange={(e) => setHost(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Port</Label>
              <Input placeholder="5060" value={port} onChange={(e) => setPort(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>R-URI Username</Label>
              <Input placeholder="{DID}" value={username} onChange={(e) => setUsername(e.target.value)} />
              <p className="text-xs text-muted-foreground">Use {'{DID}'} for E.164 DID number</p>
            </div>
            <div className="space-y-2">
              <Label>Capacity Limit</Label>
              <Input placeholder="10" value={capacityLimit} onChange={(e) => setCapacityLimit(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>CLI Format</Label>
              <Select value={cliFormat} onValueChange={setCliFormat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="raw">Raw (unchanged)</SelectItem>
                  <SelectItem value="e164">E.164</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Transport Protocol</Label>
              <Select value={transportProtocol} onValueChange={setTransportProtocol}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">UDP</SelectItem>
                  <SelectItem value="2">TCP</SelectItem>
                  <SelectItem value="3">TLS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={authEnabled} onChange={(e) => setAuthEnabled(e.target.checked)} className="h-4 w-4" id="auth-enabled" />
              <Label htmlFor="auth-enabled">Enable SIP Authentication</Label>
            </div>
            {authEnabled && (
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="space-y-2">
                  <Label>Auth Username</Label>
                  <Input value={authUser} onChange={(e) => setAuthUser(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Auth Password</Label>
                  <Input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || !host.trim() || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Create Trunk
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Outbound Trunk Dialog ────────────────────────────────────────────

function CreateOutboundTrunkDialog({
  open, onOpenChange, token,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  token: string | null;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [allowedSipIps, setAllowedSipIps] = useState('');
  const [capacityLimit, setCapacityLimit] = useState('100');
  const [thresholdAmount, setThresholdAmount] = useState('1000.0');
  const [cliAction, setCliAction] = useState('send_original_cli');
  const [allowAnyDid, setAllowAnyDid] = useState(true);

  const createMutation = useMutation({
    mutationFn: async () => {
      const ips = allowedSipIps.split(',').map((ip) => ip.trim()).filter(Boolean);
      const res = await axios.post(
        `${API_URL}/didww/trunks/out`,
        {
          name,
          allowedSipIps: ips.length > 0 ? ips : ['0.0.0.0/0'],
          onCliMismatchAction: cliAction,
          allowAnyDidAsCli: allowAnyDid,
          capacityLimit: parseInt(capacityLimit) || 100,
          thresholdAmount,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return res.data;
    },
    onSuccess: (data) => {
      const trunk = data.trunk?.attributes || {};
      toast.success(`Outbound trunk created! SIP credentials: ${trunk.username || 'see dashboard'}`);
      queryClient.invalidateQueries({ queryKey: ['didww-trunks-out'] });
      onOpenChange(false);
      setName(''); setAllowedSipIps('');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create trunk'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Outbound SIP Trunk</DialogTitle>
          <DialogDescription>
            Route outbound calls through DIDWW to PSTN. You'll receive SIP credentials after creation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Trunk Name *</Label>
            <Input placeholder="e.g. Outbound Main" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Allowed SIP IPs</Label>
            <Input placeholder="1.2.3.4, 5.6.7.8 (comma-separated)" value={allowedSipIps} onChange={(e) => setAllowedSipIps(e.target.value)} />
            <p className="text-xs text-muted-foreground">Your server IPs that will send SIP traffic. Leave empty to allow all (not recommended).</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Capacity Limit</Label>
              <Input placeholder="100" value={capacityLimit} onChange={(e) => setCapacityLimit(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>24h Spend Limit (USD)</Label>
              <Input placeholder="1000.0" value={thresholdAmount} onChange={(e) => setThresholdAmount(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>On CLI Mismatch</Label>
            <Select value={cliAction} onValueChange={setCliAction}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="send_original_cli">Send Original CLI</SelectItem>
                <SelectItem value="reject_call">Reject Call</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">What to do when FROM header doesn't match a DIDWW DID</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={allowAnyDid} onChange={(e) => setAllowAnyDid(e.target.checked)} className="h-4 w-4" id="allow-any-did" />
            <Label htmlFor="allow-any-did">Allow any DID as Caller ID</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Create Trunk
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
