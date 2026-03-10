'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ShieldAlert, Plus, Trash2, Upload, Search, Loader2, Phone, Calendar,
  AlertTriangle, Clock, FileText, Download, X, CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/stores/auth-store';

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api`;

const reasonLabels: Record<string, string> = {
  manual: 'Manual',
  opt_out: 'Opt Out',
  dtmf_opt_out: 'DTMF Opt Out',
  legal: 'Legal',
  complaint: 'Complaint',
  imported: 'Imported',
};

const reasonColors: Record<string, string> = {
  manual: 'bg-blue-500/10 text-blue-600',
  opt_out: 'bg-orange-500/10 text-orange-600',
  dtmf_opt_out: 'bg-orange-500/10 text-orange-600',
  legal: 'bg-red-500/10 text-red-600',
  complaint: 'bg-red-500/10 text-red-600',
  imported: 'bg-gray-500/10 text-gray-600',
};

export default function DNCPage() {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showCheckDialog, setShowCheckDialog] = useState(false);

  // Add form state
  const [addPhone, setAddPhone] = useState('');
  const [addReason, setAddReason] = useState('manual');
  const [addNotes, setAddNotes] = useState('');

  // Import state
  const [importText, setImportText] = useState('');

  // Check state
  const [checkPhone, setCheckPhone] = useState('');
  const [checkResult, setCheckResult] = useState<any>(null);

  // Fetch DNC stats
  const { data: stats } = useQuery({
    queryKey: ['dnc-stats'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/dnc/stats`, { headers });
      return res.data;
    },
    enabled: !!token,
  });

  // Fetch DNC list
  const { data, isLoading } = useQuery({
    queryKey: ['dnc-list', search, reasonFilter, page],
    queryFn: async () => {
      const params: any = { page, limit: 50 };
      if (search) params.search = search;
      if (reasonFilter !== 'all') params.reason = reasonFilter;
      const res = await axios.get(`${API_URL}/dnc`, { headers, params });
      return res.data;
    },
    enabled: !!token,
  });

  // Add mutation
  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await axios.post(`${API_URL}/dnc`, data, { headers });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Number added to DNC list');
      queryClient.invalidateQueries({ queryKey: ['dnc-list'] });
      queryClient.invalidateQueries({ queryKey: ['dnc-stats'] });
      setShowAddDialog(false);
      setAddPhone('');
      setAddNotes('');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to add number');
    },
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (numbers: string[]) => {
      const res = await axios.post(`${API_URL}/dnc/import`, { numbers, reason: 'imported', source: 'csv_import' }, { headers });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported} numbers (${data.skipped} duplicates skipped)`);
      queryClient.invalidateQueries({ queryKey: ['dnc-list'] });
      queryClient.invalidateQueries({ queryKey: ['dnc-stats'] });
      setShowImportDialog(false);
      setImportText('');
    },
    onError: () => toast.error('Failed to import numbers'),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`${API_URL}/dnc/${id}`, { headers });
    },
    onSuccess: () => {
      toast.success('Number removed from DNC list');
      queryClient.invalidateQueries({ queryKey: ['dnc-list'] });
      queryClient.invalidateQueries({ queryKey: ['dnc-stats'] });
    },
    onError: () => toast.error('Failed to remove number'),
  });

  // Check mutation
  const checkMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      const res = await axios.get(`${API_URL}/dnc/check/${encodeURIComponent(phoneNumber)}`, { headers });
      return res.data;
    },
    onSuccess: (data) => setCheckResult(data),
    onError: () => toast.error('Failed to check number'),
  });

  const entries = data?.entries || [];
  const pagination = data?.pagination || { page: 1, total: 0, totalPages: 1 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-7 w-7 text-red-500" />
            Do Not Call List
          </h1>
          <p className="text-muted-foreground">Manage blocked numbers and calling compliance</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCheckDialog(true)}>
            <Search className="mr-2 h-4 w-4" />Check Number
          </Button>
          <Button variant="outline" onClick={() => setShowImportDialog(true)}>
            <Upload className="mr-2 h-4 w-4" />Import
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />Add Number
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-5">
          <StatCard label="Total Blocked" value={Number(stats.total)} icon={<ShieldAlert className="h-4 w-4" />} color="text-red-500" />
          <StatCard label="Manual" value={Number(stats.manual)} icon={<Phone className="h-4 w-4" />} color="text-blue-500" />
          <StatCard label="Opt-Outs" value={Number(stats.optOut) + Number(stats.dtmfOptOut)} icon={<AlertTriangle className="h-4 w-4" />} color="text-orange-500" />
          <StatCard label="Imported" value={Number(stats.imported)} icon={<Upload className="h-4 w-4" />} color="text-gray-500" />
          <StatCard label="Added This Week" value={Number(stats.addedThisWeek)} icon={<Calendar className="h-4 w-4" />} color="text-green-500" />
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search phone numbers..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-10"
              />
            </div>
            <Select value={reasonFilter} onValueChange={(v) => { setReasonFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All reasons" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reasons</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="opt_out">Opt Out</SelectItem>
                <SelectItem value="dtmf_opt_out">DTMF Opt Out</SelectItem>
                <SelectItem value="legal">Legal</SelectItem>
                <SelectItem value="complaint">Complaint</SelectItem>
                <SelectItem value="imported">Imported</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12">
              <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-lg font-semibold">No blocked numbers</h3>
              <p className="text-sm text-muted-foreground mt-1">Add numbers manually or import from a CSV file</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phone Number</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry: any) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono font-medium">{entry.phoneNumber}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${reasonColors[entry.reason] || ''}`}>
                          {reasonLabels[entry.reason] || entry.reason}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{entry.source || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{entry.notes || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.expiresAt ? new Date(entry.expiresAt).toLocaleDateString() : 'Never'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700"
                          onClick={() => deleteMutation.mutate(entry.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Add Number Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Number to DNC List</DialogTitle>
            <DialogDescription>This number will be blocked from all outbound campaigns</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Phone Number</Label>
              <Input placeholder="+12125551234" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} />
            </div>
            <div>
              <Label>Reason</Label>
              <Select value={addReason} onValueChange={setAddReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="opt_out">Opt Out</SelectItem>
                  <SelectItem value="legal">Legal</SelectItem>
                  <SelectItem value="complaint">Complaint</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea placeholder="Reason for blocking..." value={addNotes} onChange={(e) => setAddNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button
              onClick={() => addMutation.mutate({ phoneNumber: addPhone, reason: addReason, notes: addNotes })}
              disabled={!addPhone || addMutation.isPending}
            >
              {addMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add to DNC
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import DNC Numbers</DialogTitle>
            <DialogDescription>Paste phone numbers, one per line. Duplicates will be skipped.</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={10}
            placeholder={"+12125551234\n+13105559876\n+14155551111"}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {importText.split('\n').filter(l => l.trim()).length} numbers detected
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const numbers = importText.split('\n').map(l => l.trim()).filter(Boolean);
                if (numbers.length > 0) importMutation.mutate(numbers);
              }}
              disabled={!importText.trim() || importMutation.isPending}
            >
              {importMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Import {importText.split('\n').filter(l => l.trim()).length} Numbers
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Check Number Dialog */}
      <Dialog open={showCheckDialog} onOpenChange={(open) => { setShowCheckDialog(open); if (!open) setCheckResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check Number</DialogTitle>
            <DialogDescription>Check if a phone number is on the DNC list</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              placeholder="+12125551234"
              value={checkPhone}
              onChange={(e) => setCheckPhone(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && checkPhone) checkMutation.mutate(checkPhone); }}
            />
            <Button onClick={() => checkMutation.mutate(checkPhone)} disabled={!checkPhone || checkMutation.isPending}>
              {checkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {checkResult && (
            <div className={`p-4 rounded-lg border ${checkResult.blocked ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800' : 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'}`}>
              <div className="flex items-center gap-2">
                {checkResult.blocked ? (
                  <>
                    <ShieldAlert className="h-5 w-5 text-red-600" />
                    <span className="font-semibold text-red-700 dark:text-red-400">BLOCKED</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="font-semibold text-green-700 dark:text-green-400">NOT BLOCKED</span>
                  </>
                )}
              </div>
              {checkResult.entry && (
                <div className="mt-2 text-sm space-y-1">
                  <p><span className="text-muted-foreground">Reason:</span> {reasonLabels[checkResult.entry.reason]}</p>
                  <p><span className="text-muted-foreground">Added:</span> {new Date(checkResult.entry.createdAt).toLocaleString()}</p>
                  {checkResult.entry.notes && <p><span className="text-muted-foreground">Notes:</span> {checkResult.entry.notes}</p>}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
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
