'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneOff, Loader2, Activity, Radio,
  Bot, Users, Megaphone, Clock, Zap, TrendingUp, Pause, Play, RefreshCw,
  Volume2, AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAuthStore } from '@/stores/auth-store';
import { io as socketIO, Socket } from 'socket.io-client';

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api`;
const WS_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface ActiveCall {
  id: string;
  agentId: string;
  campaignId: string | null;
  contactId: string | null;
  externalId: string | null;
  direction: 'inbound' | 'outbound';
  status: 'queued' | 'ringing' | 'in_progress';
  fromNumber: string;
  toNumber: string;
  startedAt: string | null;
  answeredAt: string | null;
  durationSeconds: number | null;
  provider: string | null;
  metadata: any;
  createdAt: string;
  agentName: string | null;
  campaignName: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactCompany: string | null;
}

interface RunningCampaign {
  id: string;
  name: string;
  status: string;
  totalContacts: number;
  completedCalls: number;
  connectedCalls: number;
  failedCalls: number;
  voicemailCalls: number;
  callsPerMinute: number;
  maxConcurrentCalls: number;
  startedAt: string | null;
  agentName: string | null;
}

interface LiveStats {
  activeCalls: number;
  queued: number;
  ringing: number;
  inProgress: number;
  runningCampaigns: number;
}

const formatPhone = (n: string) => {
  const c = n.replace(/[^\d+]/g, '');
  if (c.startsWith('+1') && c.length === 12) return `(${c.slice(2, 5)}) ${c.slice(5, 8)}-${c.slice(8)}`;
  return c;
};

const formatDuration = (startedAt: string | null) => {
  if (!startedAt) return '0:00';
  const diffSec = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (diffSec < 0) return '0:00';
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const statusColor: Record<string, string> = {
  queued: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  ringing: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  in_progress: 'bg-green-500/10 text-green-600 border-green-500/20',
};

const statusIcon: Record<string, React.ReactNode> = {
  queued: <Clock className="h-3 w-3" />,
  ringing: <Volume2 className="h-3 w-3" />,
  in_progress: <Activity className="h-3 w-3" />,
};

export default function MonitorPage() {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [tick, setTick] = useState(0);

  // Refresh durations every second
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Socket.IO for real-time updates
  useEffect(() => {
    if (!token) return;

    const socket = socketIO(WS_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      // Join org room - the server will validate the token and get orgId
      const orgId = getOrgIdFromToken(token);
      if (orgId) socket.emit('join-room', orgId);
    });

    // Refetch on any call status change
    socket.on('call:status', () => {
      queryClient.invalidateQueries({ queryKey: ['monitor-active'] });
    });
    socket.on('call:initiated', () => {
      queryClient.invalidateQueries({ queryKey: ['monitor-active'] });
    });
    socket.on('call:ended', () => {
      queryClient.invalidateQueries({ queryKey: ['monitor-active'] });
    });
    socket.on('call:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['monitor-active'] });
    });
    socket.on('campaign:started', () => {
      queryClient.invalidateQueries({ queryKey: ['monitor-active'] });
    });
    socket.on('campaign:completed', () => {
      queryClient.invalidateQueries({ queryKey: ['monitor-active'] });
    });
    socket.on('campaign:paused', () => {
      queryClient.invalidateQueries({ queryKey: ['monitor-active'] });
    });
    socket.on('campaign:resumed', () => {
      queryClient.invalidateQueries({ queryKey: ['monitor-active'] });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, queryClient]);

  // Poll active calls every 5s as fallback
  const { data, isLoading } = useQuery({
    queryKey: ['monitor-active'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/calls/monitor/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data as { calls: ActiveCall[]; campaigns: RunningCampaign[]; stats: LiveStats };
    },
    enabled: !!token,
    refetchInterval: 5000,
  });

  const activeCalls = data?.calls || [];
  const runningCampaigns = data?.campaigns || [];
  const stats = data?.stats || { activeCalls: 0, queued: 0, ringing: 0, inProgress: 0, runningCampaigns: 0 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Radio className="h-6 w-6 text-red-500" />
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-red-500 rounded-full animate-pulse" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Live Monitor</h1>
            <p className="text-muted-foreground">Real-time view of all active calls and campaigns</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['monitor-active'] })}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Live Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <StatCard
          label="Active Calls"
          value={stats.activeCalls}
          icon={<Phone className="h-4 w-4" />}
          color="text-green-500"
          pulse={stats.activeCalls > 0}
        />
        <StatCard
          label="Queued"
          value={stats.queued}
          icon={<Clock className="h-4 w-4" />}
          color="text-yellow-500"
        />
        <StatCard
          label="Ringing"
          value={stats.ringing}
          icon={<Volume2 className="h-4 w-4" />}
          color="text-blue-500"
          pulse={stats.ringing > 0}
        />
        <StatCard
          label="Connected"
          value={stats.inProgress}
          icon={<Activity className="h-4 w-4" />}
          color="text-emerald-500"
        />
        <StatCard
          label="Campaigns"
          value={stats.runningCampaigns}
          icon={<Megaphone className="h-4 w-4" />}
          color="text-purple-500"
        />
      </div>

      {/* Active Calls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-green-500" />
            Active Calls
            {stats.activeCalls > 0 && (
              <Badge variant="secondary" className="ml-2">{stats.activeCalls}</Badge>
            )}
          </CardTitle>
          <CardDescription>All calls currently in progress, ringing, or queued</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">Connecting to live feed...</p>
            </div>
          ) : activeCalls.length === 0 ? (
            <div className="text-center py-12 border rounded-lg border-dashed">
              <PhoneOff className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-lg font-semibold mb-1">No active calls</h3>
              <p className="text-sm text-muted-foreground">
                Calls will appear here in real-time when they start
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {activeCalls.map((call) => (
                <CallTile key={call.id} call={call} tick={tick} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Running Campaigns */}
      {runningCampaigns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-purple-500" />
              Running Campaigns
              <Badge variant="secondary" className="ml-2">{runningCampaigns.length}</Badge>
            </CardTitle>
            <CardDescription>Campaign progress and throughput</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {runningCampaigns.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Components ──────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, color, pulse,
}: {
  label: string; value: number; icon: React.ReactNode; color: string; pulse?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={color}>{icon}</span>
            <span className="text-sm text-muted-foreground">{label}</span>
          </div>
          {pulse && (
            <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
          )}
        </div>
        <p className="text-3xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}

function CallTile({ call, tick }: { call: ActiveCall; tick: number }) {
  const contactName = [call.contactFirstName, call.contactLastName].filter(Boolean).join(' ');
  const elapsed = formatDuration(call.answeredAt || call.startedAt);

  return (
    <div className="border rounded-lg p-4 space-y-3 hover:bg-muted/30 transition-colors">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {call.direction === 'outbound' ? (
            <PhoneOutgoing className="h-4 w-4 text-blue-500" />
          ) : (
            <PhoneIncoming className="h-4 w-4 text-green-500" />
          )}
          <Badge className={`text-xs ${statusColor[call.status] || ''}`}>
            <span className="mr-1">{statusIcon[call.status]}</span>
            {call.status.replace('_', ' ')}
          </Badge>
        </div>
        <span className="font-mono text-sm font-semibold tabular-nums">{elapsed}</span>
      </div>

      {/* Phone numbers */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">From</span>
          <span className="font-mono text-sm">{formatPhone(call.fromNumber)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">To</span>
          <span className="font-mono text-sm font-medium">{formatPhone(call.toNumber)}</span>
        </div>
      </div>

      {/* Contact & Agent */}
      <div className="flex items-center gap-2 flex-wrap">
        {call.agentName && (
          <Badge variant="outline" className="text-xs">
            <Bot className="h-3 w-3 mr-1" />{call.agentName}
          </Badge>
        )}
        {contactName && (
          <Badge variant="outline" className="text-xs">
            <Users className="h-3 w-3 mr-1" />{contactName}
          </Badge>
        )}
        {call.contactCompany && (
          <Badge variant="secondary" className="text-xs">{call.contactCompany}</Badge>
        )}
        {call.campaignName && (
          <Badge variant="secondary" className="text-xs">
            <Megaphone className="h-3 w-3 mr-1" />{call.campaignName}
          </Badge>
        )}
      </div>
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: RunningCampaign }) {
  const totalProcessed = campaign.completedCalls + campaign.failedCalls + campaign.voicemailCalls;
  const progress = campaign.totalContacts > 0
    ? Math.round((totalProcessed / campaign.totalContacts) * 100)
    : 0;
  const connectRate = totalProcessed > 0
    ? Math.round((campaign.connectedCalls / totalProcessed) * 100)
    : 0;

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold">{campaign.name}</h4>
          <div className="flex items-center gap-2 mt-0.5">
            {campaign.agentName && (
              <Badge variant="outline" className="text-xs">
                <Bot className="h-3 w-3 mr-1" />{campaign.agentName}
              </Badge>
            )}
            <Badge className={campaign.status === 'running'
              ? 'text-xs bg-green-500/10 text-green-600 border-green-500/20'
              : 'text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
            }>
              {campaign.status === 'running' ? <Play className="h-3 w-3 mr-1" /> : <Pause className="h-3 w-3 mr-1" />}
              {campaign.status}
            </Badge>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{progress}%</p>
          <p className="text-xs text-muted-foreground">{totalProcessed}/{campaign.totalContacts}</p>
        </div>
      </div>

      <Progress value={progress} className="h-2" />

      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <p className="text-sm font-semibold text-green-600">{campaign.connectedCalls}</p>
          <p className="text-xs text-muted-foreground">Connected</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-yellow-600">{campaign.voicemailCalls}</p>
          <p className="text-xs text-muted-foreground">Voicemail</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-red-600">{campaign.failedCalls}</p>
          <p className="text-xs text-muted-foreground">Failed</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-blue-600">{connectRate}%</p>
          <p className="text-xs text-muted-foreground">Connect Rate</p>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOrgIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.organizationId || null;
  } catch {
    return null;
  }
}
