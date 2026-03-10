'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';
import {
  MessageSquare, Send, Search, Loader2, Phone, User, ArrowUpRight,
  ArrowDownLeft, CheckCircle2, XCircle, Clock, Inbox, Plus,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/stores/auth-store';

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api`;

const statusBadge: Record<string, { label: string; className: string }> = {
  queued: { label: 'Queued', className: 'bg-yellow-500/10 text-yellow-600' },
  sent: { label: 'Sent', className: 'bg-blue-500/10 text-blue-600' },
  delivered: { label: 'Delivered', className: 'bg-green-500/10 text-green-600' },
  failed: { label: 'Failed', className: 'bg-red-500/10 text-red-600' },
  received: { label: 'Received', className: 'bg-purple-500/10 text-purple-600' },
};

const formatPhone = (n: string) => {
  const c = n.replace(/[^\d+]/g, '');
  if (c.startsWith('+1') && c.length === 12) return `(${c.slice(2, 5)}) ${c.slice(5, 8)}-${c.slice(8)}`;
  return c;
};

export default function MessagesPage() {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);

  // Compose state
  const [composeTo, setComposeTo] = useState('');
  const [composeFrom, setComposeFrom] = useState('');
  const [composeBody, setComposeBody] = useState('');

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['message-stats'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/messages/stats`, { headers });
      return res.data;
    },
    enabled: !!token,
  });

  // Fetch messages
  const { data, isLoading } = useQuery({
    queryKey: ['messages', search, directionFilter, page],
    queryFn: async () => {
      const params: any = { page, limit: 50 };
      if (search) params.search = search;
      if (directionFilter !== 'all') params.direction = directionFilter;
      const res = await axios.get(`${API_URL}/messages`, { headers, params });
      return res.data;
    },
    enabled: !!token,
  });

  // Fetch conversations
  const { data: convData } = useQuery({
    queryKey: ['message-conversations'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/messages/conversations`, { headers });
      return res.data;
    },
    enabled: !!token,
  });

  // Fetch thread
  const { data: threadData } = useQuery({
    queryKey: ['message-thread', selectedThread],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/messages/thread/${selectedThread}`, { headers });
      return res.data;
    },
    enabled: !!token && !!selectedThread,
  });

  // Fetch phone numbers for "from" selector
  const { data: phoneNumbers } = useQuery({
    queryKey: ['phone-numbers-list'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/phone-numbers/db`, { headers });
      return res.data.numbers || [];
    },
    enabled: !!token,
  });

  // Send SMS
  const sendMutation = useMutation({
    mutationFn: async (data: { toNumber: string; fromNumber: string; body: string }) => {
      const res = await axios.post(`${API_URL}/messages/send`, data, { headers });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Message sent');
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['message-stats'] });
      queryClient.invalidateQueries({ queryKey: ['message-conversations'] });
      setShowComposeDialog(false);
      setComposeTo('');
      setComposeBody('');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to send message'),
  });

  const messagesList = data?.messages || [];
  const pagination = data?.pagination || { page: 1, total: 0, totalPages: 1 };
  const conversations = convData?.conversations || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquare className="h-7 w-7 text-blue-500" />
            Messages
          </h1>
          <p className="text-muted-foreground">Send and receive SMS messages via Telnyx</p>
        </div>
        <Button onClick={() => setShowComposeDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />New Message
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-5">
          <StatCard label="Total Messages" value={Number(stats.total)} icon={<MessageSquare className="h-4 w-4" />} color="text-blue-500" />
          <StatCard label="Sent" value={Number(stats.sent)} icon={<ArrowUpRight className="h-4 w-4" />} color="text-green-500" />
          <StatCard label="Delivered" value={Number(stats.delivered)} icon={<CheckCircle2 className="h-4 w-4" />} color="text-emerald-500" />
          <StatCard label="Received" value={Number(stats.received)} icon={<ArrowDownLeft className="h-4 w-4" />} color="text-purple-500" />
          <StatCard label="Failed" value={Number(stats.failed)} icon={<XCircle className="h-4 w-4" />} color="text-red-500" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Conversations sidebar */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Conversations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {conversations.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <Inbox className="mx-auto h-8 w-8 mb-2" />
                No conversations yet
              </div>
            ) : (
              <div className="divide-y max-h-[500px] overflow-y-auto">
                {conversations.map((conv: any) => {
                  const name = [conv.first_name, conv.last_name].filter(Boolean).join(' ') || formatPhone(conv.to_number || conv.from_number);
                  return (
                    <button
                      key={conv.contact_id || conv.id}
                      className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${selectedThread === conv.contact_id ? 'bg-muted' : ''}`}
                      onClick={() => setSelectedThread(conv.contact_id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm truncate">{name}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(conv.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.body}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Messages / Thread view */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {selectedThread ? 'Thread' : 'All Messages'}
              </CardTitle>
              {selectedThread && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedThread(null)}>
                  Show All
                </Button>
              )}
            </div>
            {!selectedThread && (
              <div className="flex gap-2 mt-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search messages..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="pl-10 h-9"
                  />
                </div>
                <Select value={directionFilter} onValueChange={(v) => { setDirectionFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="outbound">Outbound</SelectItem>
                    <SelectItem value="inbound">Inbound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : selectedThread && threadData ? (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {(threadData.messages || []).map((msg: any) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
                {(threadData.messages || []).length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">No messages in this thread</p>
                )}
              </div>
            ) : messagesList.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                <h3 className="text-lg font-semibold">No messages yet</h3>
                <p className="text-sm text-muted-foreground mt-1">Send your first SMS message</p>
              </div>
            ) : (
              <div className="space-y-2">
                {messagesList.map((msg: any) => (
                  <MessageRow key={msg.id} msg={msg} />
                ))}
                {pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-3 border-t">
                    <p className="text-xs text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
                      <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Compose Dialog */}
      <Dialog open={showComposeDialog} onOpenChange={setShowComposeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
            <DialogDescription>Send an SMS message via Telnyx</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>To</Label>
              <Input placeholder="+12125551234" value={composeTo} onChange={(e) => setComposeTo(e.target.value)} />
            </div>
            <div>
              <Label>From</Label>
              <Select value={composeFrom} onValueChange={setComposeFrom}>
                <SelectTrigger><SelectValue placeholder="Select a number..." /></SelectTrigger>
                <SelectContent>
                  {(phoneNumbers || []).map((n: any) => (
                    <SelectItem key={n.id} value={n.number}>
                      {formatPhone(n.number)} {n.label ? `(${n.label})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Message</Label>
              <Textarea
                rows={4}
                placeholder="Type your message..."
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                maxLength={1600}
              />
              <p className="text-xs text-muted-foreground mt-1">{composeBody.length}/1600 characters ({Math.ceil(composeBody.length / 160) || 1} segment{composeBody.length > 160 ? 's' : ''})</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowComposeDialog(false)}>Cancel</Button>
            <Button
              onClick={() => sendMutation.mutate({ toNumber: composeTo, fromNumber: composeFrom, body: composeBody })}
              disabled={!composeTo || !composeBody || sendMutation.isPending}
            >
              {sendMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function MessageBubble({ msg }: { msg: any }) {
  const isOutbound = msg.direction === 'outbound';
  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-lg p-3 ${isOutbound ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
        <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
        <div className={`flex items-center gap-2 mt-1 ${isOutbound ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
          <span className="text-xs">{new Date(msg.createdAt || msg.created_at).toLocaleTimeString()}</span>
          {isOutbound && (
            <Badge className={`text-[10px] px-1 py-0 ${statusBadge[msg.status]?.className || ''}`}>
              {statusBadge[msg.status]?.label || msg.status}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageRow({ msg }: { msg: any }) {
  const isOutbound = msg.direction === 'outbound';
  return (
    <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/30">
      <div className={`mt-0.5 ${isOutbound ? 'text-blue-500' : 'text-green-500'}`}>
        {isOutbound ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium">
            {formatPhone(isOutbound ? msg.toNumber : msg.fromNumber)}
          </span>
          <Badge className={`text-xs ${statusBadge[msg.status]?.className || ''}`}>
            {statusBadge[msg.status]?.label || msg.status}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground truncate mt-0.5">{msg.body}</p>
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {new Date(msg.createdAt).toLocaleString()}
      </span>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2">
          <span className={color}>{icon}</span>
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        <p className="text-3xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
