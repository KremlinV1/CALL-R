'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';
import {
  CreditCard, Zap, Clock, BarChart3, ArrowUpRight, CheckCircle2,
  Loader2, TrendingUp, AlertTriangle, Phone, Plus, Crown, Shield,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useAuthStore } from '@/stores/auth-store';

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api`;

const planBadge: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  free: { label: 'Starter', className: 'bg-gray-500/10 text-gray-600', icon: <Zap className="h-3 w-3" /> },
  pro: { label: 'Pro', className: 'bg-blue-500/10 text-blue-600', icon: <Crown className="h-3 w-3" /> },
  enterprise: { label: 'Enterprise', className: 'bg-violet-500/10 text-violet-600', icon: <Shield className="h-3 w-3" /> },
};

export default function SubscriptionPage() {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [showBonusDialog, setShowBonusDialog] = useState(false);

  // Fetch subscription & usage
  const { data, isLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/subscription`, { headers });
      return res.data;
    },
    enabled: !!token,
    refetchInterval: 30000,
  });

  // Fetch usage history
  const { data: usageData } = useQuery({
    queryKey: ['usage-history'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/subscription/usage`, { headers });
      return res.data;
    },
    enabled: !!token,
  });

  // Fetch plans
  const { data: plansData } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/subscription/plans`, { headers });
      return res.data;
    },
    enabled: !!token,
  });

  // Change plan
  const changePlanMutation = useMutation({
    mutationFn: async (plan: string) => {
      const res = await axios.post(`${API_URL}/subscription/change-plan`, { plan }, { headers });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      setShowUpgradeDialog(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to change plan'),
  });

  // Add bonus minutes
  const addMinutesMutation = useMutation({
    mutationFn: async (minutes: number) => {
      const res = await axios.post(`${API_URL}/subscription/add-minutes`, { minutes }, { headers });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      setShowBonusDialog(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to add minutes'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sub = data?.subscription;
  const plan = sub?.plan || 'free';
  const badge = planBadge[plan] || planBadge.free;
  const isUnlimited = data?.isUnlimited;
  const minutesUsed = data?.minutesUsed || 0;
  const minutesTotal = data?.minutesTotal || 0;
  const minutesRemaining = data?.minutesRemaining || 0;
  const percentUsed = data?.percentUsed || 0;
  const daysLeft = data?.daysLeftInPeriod || 0;
  const bonusMinutes = data?.bonusMinutes || 0;
  const bonusUsed = data?.bonusUsed || 0;

  const isLow = !isUnlimited && percentUsed >= 80;
  const isExhausted = !isUnlimited && minutesRemaining <= 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CreditCard className="h-7 w-7 text-blue-500" />
            Subscription & Usage
          </h1>
          <p className="text-muted-foreground">Manage your plan and monitor minute usage</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowBonusDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />Add Minutes
          </Button>
          <Button onClick={() => setShowUpgradeDialog(true)}>
            <ArrowUpRight className="mr-2 h-4 w-4" />Upgrade Plan
          </Button>
        </div>
      </div>

      {/* Exhausted warning */}
      {isExhausted && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <div>
            <p className="font-medium text-red-700 dark:text-red-400">Minutes Exhausted</p>
            <p className="text-sm text-red-600/80 dark:text-red-400/60">
              You've used all your monthly minutes. Upgrade your plan or purchase additional minutes to continue making calls.
            </p>
          </div>
          <Button size="sm" className="ml-auto shrink-0" onClick={() => setShowUpgradeDialog(true)}>
            Upgrade Now
          </Button>
        </div>
      )}

      {/* Low warning */}
      {isLow && !isExhausted && (
        <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
          <div>
            <p className="font-medium text-yellow-700 dark:text-yellow-400">Running Low on Minutes</p>
            <p className="text-sm text-yellow-600/80 dark:text-yellow-400/60">
              You've used {percentUsed}% of your monthly minutes. Consider upgrading or adding bonus minutes.
            </p>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* Current Plan */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <span className="text-blue-500">{badge.icon}</span>
              <span className="text-sm text-muted-foreground">Current Plan</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-3xl font-bold">{badge.label}</p>
              <Badge className={badge.className}>{plan}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Minutes Used */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Minutes Used</span>
            </div>
            <p className="text-3xl font-bold mt-1">
              {minutesUsed.toLocaleString()}
              {!isUnlimited && <span className="text-lg text-muted-foreground font-normal"> / {minutesTotal.toLocaleString()}</span>}
            </p>
            {!isUnlimited && (
              <Progress
                value={percentUsed}
                className={`mt-2 h-2 ${isExhausted ? '[&>div]:bg-red-500' : isLow ? '[&>div]:bg-yellow-500' : ''}`}
              />
            )}
            {isUnlimited && <p className="text-sm text-muted-foreground mt-1">Unlimited plan</p>}
          </CardContent>
        </Card>

        {/* Remaining */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-500" />
              <span className="text-sm text-muted-foreground">Remaining</span>
            </div>
            <p className="text-3xl font-bold mt-1">
              {isUnlimited ? '∞' : minutesRemaining.toLocaleString()}
            </p>
            {bonusMinutes > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Includes {Math.max(0, bonusMinutes - bonusUsed)} bonus minutes
              </p>
            )}
          </CardContent>
        </Card>

        {/* Billing Period */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-violet-500" />
              <span className="text-sm text-muted-foreground">Period Resets In</span>
            </div>
            <p className="text-3xl font-bold mt-1">{daysLeft} <span className="text-lg text-muted-foreground font-normal">days</span></p>
            {sub?.currentPeriodEnd && (
              <p className="text-xs text-muted-foreground mt-1">
                Resets {new Date(sub.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Feature Access */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <FeatureItem label="Live Monitor" enabled={sub?.liveMonitorEnabled} />
            <FeatureItem label="SMS Messaging" enabled={sub?.smsEnabled} />
            <FeatureItem label="DNC Compliance" enabled={sub?.dncEnabled} />
            <FeatureItem label="Analytics" enabled={sub?.analyticsEnabled} />
            <FeatureItem label="Priority Support" enabled={sub?.prioritySupport} />
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
            <LimitItem label="AI Agents" value={sub?.maxAgents} />
            <LimitItem label="Phone Numbers" value={sub?.maxPhoneNumbers} />
            <LimitItem label="Campaigns" value={sub?.maxCampaigns} />
          </div>
        </CardContent>
      </Card>

      {/* Recent Usage */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Usage</CardTitle>
            {usageData?.stats && (
              <Badge variant="outline" className="text-xs">
                {Number(usageData.stats.totalMinutes).toLocaleString()} min total
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!usageData?.records?.length ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <BarChart3 className="mx-auto h-8 w-8 mb-2" />
              No usage records yet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Minutes</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usageData.records.slice(0, 20).map((record: any) => (
                  <TableRow key={record.id}>
                    <TableCell className="text-sm">{record.description || 'Call usage'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{record.source}</Badge>
                    </TableCell>
                    <TableCell className="font-mono font-medium">{record.minutesUsed} min</TableCell>
                    <TableCell>
                      {record.fromBonus ? (
                        <Badge className="text-xs bg-purple-500/10 text-purple-600">Bonus</Badge>
                      ) : (
                        <Badge className="text-xs bg-blue-500/10 text-blue-600">Monthly</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(record.recordedAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Upgrade Dialog */}
      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upgrade Plan</DialogTitle>
            <DialogDescription>Choose the plan that fits your needs</DialogDescription>
          </DialogHeader>
          <div className="grid md:grid-cols-3 gap-4">
            {(plansData?.plans || []).map((p: any) => (
              <div
                key={p.id}
                className={`rounded-xl border p-4 flex flex-col ${
                  p.id === plan ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20' : 'border-border'
                }`}
              >
                <p className="text-sm font-medium text-blue-500">{p.name}</p>
                <p className="text-2xl font-bold mt-1">
                  {p.price === null ? 'Custom' : p.price === 0 ? 'Free' : `$${p.price}`}
                  {p.price > 0 && <span className="text-sm text-muted-foreground font-normal">/mo</span>}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {p.monthlyMinutes === -1 ? 'Unlimited' : `${p.monthlyMinutes.toLocaleString()}`} minutes/mo
                </p>
                <ul className="mt-3 space-y-1.5 flex-1 text-xs">
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    {p.maxAgents === -1 ? 'Unlimited' : p.maxAgents} Agent{p.maxAgents !== 1 ? 's' : ''}
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    {p.maxPhoneNumbers === -1 ? 'Unlimited' : p.maxPhoneNumbers} Phone Number{p.maxPhoneNumbers !== 1 ? 's' : ''}
                  </li>
                  {p.liveMonitorEnabled && <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-green-500" />Live Monitor</li>}
                  {p.smsEnabled && <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-green-500" />SMS Messaging</li>}
                  {p.dncEnabled && <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-green-500" />DNC Compliance</li>}
                </ul>
                <Button
                  size="sm"
                  className="mt-3"
                  variant={p.id === plan ? 'outline' : 'default'}
                  disabled={p.id === plan || changePlanMutation.isPending}
                  onClick={() => changePlanMutation.mutate(p.id)}
                >
                  {p.id === plan ? 'Current' : 'Select'}
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Bonus Minutes Dialog */}
      <Dialog open={showBonusDialog} onOpenChange={setShowBonusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Bonus Minutes</DialogTitle>
            <DialogDescription>Purchase additional minutes that carry over between billing periods</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3">
            {[
              { minutes: 500, price: 75 },
              { minutes: 1000, price: 130 },
              { minutes: 2500, price: 300 },
            ].map((pkg) => (
              <button
                key={pkg.minutes}
                className="rounded-xl border border-border hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 p-4 text-center transition-all"
                onClick={() => addMinutesMutation.mutate(pkg.minutes)}
                disabled={addMinutesMutation.isPending}
              >
                <p className="text-2xl font-bold">{pkg.minutes.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">minutes</p>
                <p className="text-sm font-medium mt-2">${pkg.price}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FeatureItem({ label, enabled }: { label: string; enabled?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {enabled ? (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      ) : (
        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
      )}
      <span className={`text-sm ${enabled ? '' : 'text-muted-foreground'}`}>{label}</span>
    </div>
  );
}

function LimitItem({ label, value }: { label: string; value?: number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold">{value === -1 ? '∞' : value || 0}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
