'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Plus, Phone, Settings, TrendingUp, AlertCircle, RefreshCw, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`;

interface Pool {
  id: string;
  name: string;
  description: string;
  rotationStrategy: 'round_robin' | 'random' | 'least_used' | 'weighted';
  rotationIntervalMinutes: number;
  maxCallsPerNumber: number;
  cooldownMinutes: number;
  isActive: boolean;
  totalCalls: number;
  activeNumbers: number;
  createdAt: string;
  updatedAt: string;
}

interface PhoneNumber {
  id: string;
  phoneNumberId: string;
  number: string;
  provider: string;
  callsMade: number;
  lastUsedAt: string | null;
  isHealthy: boolean;
  spamScore: number;
  cooldownUntil: string | null;
  weight: number;
  isActive: boolean;
}

export default function PhonePoolsPage() {
  const router = useRouter();
  const { token, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [addNumbersDialogOpen, setAddNumbersDialogOpen] = useState(false);
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);

  const [newPool, setNewPool] = useState({
    name: '',
    description: '',
    rotationStrategy: 'round_robin' as const,
    rotationIntervalMinutes: 60,
    maxCallsPerNumber: 100,
    cooldownMinutes: 30,
  });

  const [selectedNumbers, setSelectedNumbers] = useState<string[]>([]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Fetch pools
  const { data: poolsData, isLoading: isLoadingPools } = useQuery({
    queryKey: ['phone-pools'],
    queryFn: async () => {
      if (!token) {
        throw new Error('No authentication token available');
      }
      const response = await axios.get(`${API_URL}/phone-pools`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    },
    enabled: !authLoading && !!token && isAuthenticated,
  });

  // Fetch available phone numbers
  const { data: phoneNumbersData } = useQuery({
    queryKey: ['phone-numbers'],
    queryFn: async () => {
      if (!token) throw new Error('No token');
      const response = await axios.get(`${API_URL}/settings/phone-numbers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    },
    enabled: !authLoading && !!token && addNumbersDialogOpen,
  });

  // Fetch pool details
  const { data: poolDetailsData } = useQuery({
    queryKey: ['phone-pool', selectedPool?.id],
    queryFn: async () => {
      if (!token) throw new Error('No token');
      const response = await axios.get(`${API_URL}/phone-pools/${selectedPool?.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    },
    enabled: !authLoading && !!token && !!selectedPool && detailsDialogOpen,
  });

  // Create pool mutation
  const createPoolMutation = useMutation({
    mutationFn: async (data: typeof newPool) => {
      const response = await axios.post(`${API_URL}/phone-pools`, data, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-pools'] });
      setCreateDialogOpen(false);
      setNewPool({
        name: '',
        description: '',
        rotationStrategy: 'round_robin',
        rotationIntervalMinutes: 60,
        maxCallsPerNumber: 100,
        cooldownMinutes: 30,
      });
      toast.success('Phone number pool has been created successfully.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create pool');
    },
  });

  // Add numbers to pool mutation
  const addNumbersMutation = useMutation({
    mutationFn: async ({ poolId, phoneNumberIds }: { poolId: string; phoneNumberIds: string[] }) => {
      const response = await axios.post(
        `${API_URL}/phone-pools/${poolId}/numbers`,
        { phoneNumberIds },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-pools'] });
      queryClient.invalidateQueries({ queryKey: ['phone-pool', selectedPool?.id] });
      setAddNumbersDialogOpen(false);
      setSelectedNumbers([]);
      toast.success('Phone numbers have been added to the pool.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to add numbers');
    },
  });

  // Remove number from pool mutation
  const removeNumberMutation = useMutation({
    mutationFn: async ({ poolId, phoneNumberId }: { poolId: string; phoneNumberId: string }) => {
      await axios.delete(`${API_URL}/phone-pools/${poolId}/numbers/${phoneNumberId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-pools'] });
      queryClient.invalidateQueries({ queryKey: ['phone-pool', selectedPool?.id] });
      toast.success('Phone number has been removed from the pool.');
    },
  });

  // Delete pool mutation
  const deletePoolMutation = useMutation({
    mutationFn: async (poolId: string) => {
      await axios.delete(`${API_URL}/phone-pools/${poolId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-pools'] });
      toast.success('Phone number pool has been deleted.');
    },
  });

  // Reset cooldowns mutation
  const resetCooldownsMutation = useMutation({
    mutationFn: async (poolId: string) => {
      await axios.post(`${API_URL}/phone-pools/${poolId}/reset-cooldowns`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-pool', selectedPool?.id] });
      toast.success('All cooldowns have been reset for this pool.');
    },
  });

  const getStrategyLabel = (strategy: string) => {
    const labels = {
      round_robin: 'Round Robin',
      random: 'Random',
      least_used: 'Least Used',
      weighted: 'Weighted',
    };
    return labels[strategy as keyof typeof labels] || strategy;
  };

  const getHealthBadge = (spamScore: number) => {
    if (spamScore < 30) return <Badge className="bg-green-500">Healthy</Badge>;
    if (spamScore < 70) return <Badge className="bg-yellow-500">Warning</Badge>;
    return <Badge className="bg-red-500">Unhealthy</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Phone Number Pools</h1>
          <p className="text-muted-foreground">
            Manage phone number rotation to prevent spam flagging
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Pool
        </Button>
      </div>

      {/* Pools List */}
      {authLoading || isLoadingPools ? (
        <div className="text-center py-12">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-2 text-muted-foreground">Loading pools...</p>
        </div>
      ) : poolsData?.pools?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Phone className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No phone pools yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create a pool to manage multiple phone numbers and prevent spam flagging
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Pool
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {poolsData?.pools?.map((pool: Pool) => (
            <Card key={pool.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      {pool.name}
                      {pool.isActive ? (
                        <Badge className="bg-green-500">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {pool.description || 'No description'}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Numbers</p>
                    <p className="text-2xl font-bold">{pool.activeNumbers}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Calls</p>
                    <p className="text-2xl font-bold">{pool.totalCalls}</p>
                  </div>
                </div>

                {/* Strategy */}
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Strategy</p>
                  <Badge variant="outline">{getStrategyLabel(pool.rotationStrategy)}</Badge>
                </div>

                {/* Settings */}
                <div className="text-sm space-y-1">
                  <p className="text-muted-foreground">
                    Max calls: <span className="font-medium text-foreground">{pool.maxCallsPerNumber}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Cooldown: <span className="font-medium text-foreground">{pool.cooldownMinutes} min</span>
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setSelectedPool(pool);
                      setDetailsDialogOpen(true);
                    }}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Manage
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deletePoolMutation.mutate(pool.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Pool Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Phone Number Pool</DialogTitle>
            <DialogDescription>
              Set up a new pool for rotating phone numbers across campaigns
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Pool Name</Label>
              <Input
                id="name"
                placeholder="e.g., Sales Pool - West Coast"
                value={newPool.name}
                onChange={(e) => setNewPool({ ...newPool, name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Describe the purpose of this pool..."
                value={newPool.description}
                onChange={(e) => setNewPool({ ...newPool, description: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="strategy">Rotation Strategy</Label>
              <Select
                value={newPool.rotationStrategy}
                onValueChange={(value: any) =>
                  setNewPool({ ...newPool, rotationStrategy: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="round_robin">
                    <div>
                      <p className="font-medium">Round Robin</p>
                      <p className="text-xs text-muted-foreground">Even distribution, fair usage</p>
                    </div>
                  </SelectItem>
                  <SelectItem value="random">
                    <div>
                      <p className="font-medium">Random</p>
                      <p className="text-xs text-muted-foreground">Unpredictable pattern</p>
                    </div>
                  </SelectItem>
                  <SelectItem value="least_used">
                    <div>
                      <p className="font-medium">Least Used</p>
                      <p className="text-xs text-muted-foreground">Balance usage over time</p>
                    </div>
                  </SelectItem>
                  <SelectItem value="weighted">
                    <div>
                      <p className="font-medium">Weighted</p>
                      <p className="text-xs text-muted-foreground">Priority-based selection</p>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="maxCalls">Max Calls Per Number</Label>
                <Input
                  id="maxCalls"
                  type="number"
                  min="1"
                  value={newPool.maxCallsPerNumber}
                  onChange={(e) =>
                    setNewPool({ ...newPool, maxCallsPerNumber: parseInt(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Number goes into cooldown after this many calls
                </p>
              </div>

              <div>
                <Label htmlFor="cooldown">Cooldown (Minutes)</Label>
                <Input
                  id="cooldown"
                  type="number"
                  min="0"
                  value={newPool.cooldownMinutes}
                  onChange={(e) =>
                    setNewPool({ ...newPool, cooldownMinutes: parseInt(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Rest time after reaching max calls
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createPoolMutation.mutate(newPool)}
              disabled={!newPool.name || createPoolMutation.isPending}
            >
              {createPoolMutation.isPending ? 'Creating...' : 'Create Pool'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pool Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedPool?.name}</DialogTitle>
            <DialogDescription>
              Manage phone numbers and view pool statistics
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{poolDetailsData?.numbers?.length || 0}</div>
                  <p className="text-xs text-muted-foreground">Total Numbers</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{selectedPool?.totalCalls || 0}</div>
                  <p className="text-xs text-muted-foreground">Total Calls</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {poolDetailsData?.numbers?.filter((n: PhoneNumber) => n.isHealthy).length || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Healthy Numbers</p>
                </CardContent>
              </Card>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setAddNumbersDialogOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Numbers
              </Button>
              <Button
                variant="outline"
                onClick={() => selectedPool && resetCooldownsMutation.mutate(selectedPool.id)}
                disabled={resetCooldownsMutation.isPending}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Reset Cooldowns
              </Button>
            </div>

            {/* Numbers List */}
            <div>
              <h3 className="font-semibold mb-3">Phone Numbers in Pool</h3>
              {poolDetailsData?.numbers?.length === 0 ? (
                <div className="text-center py-8 border rounded-lg border-dashed">
                  <Phone className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No numbers in this pool yet. Add some to get started.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {poolDetailsData?.numbers?.map((num: PhoneNumber) => (
                    <div
                      key={num.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{num.number}</p>
                          {getHealthBadge(num.spamScore)}
                          {num.cooldownUntil && new Date(num.cooldownUntil) > new Date() && (
                            <Badge variant="secondary">Cooldown</Badge>
                          )}
                        </div>
                        <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                          <span>Calls: {num.callsMade}</span>
                          <span>Spam Score: {num.spamScore}</span>
                          <span>Provider: {num.provider}</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          selectedPool &&
                          removeNumberMutation.mutate({
                            poolId: selectedPool.id,
                            phoneNumberId: num.phoneNumberId,
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Numbers Dialog */}
      <Dialog open={addNumbersDialogOpen} onOpenChange={setAddNumbersDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Phone Numbers</DialogTitle>
            <DialogDescription>
              Select phone numbers to add to {selectedPool?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {phoneNumbersData?.phoneNumbers?.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No phone numbers available. Add some in Settings first.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {phoneNumbersData?.phoneNumbers?.map((num: any) => (
                  <label
                    key={num.id}
                    className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={selectedNumbers.includes(num.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedNumbers([...selectedNumbers, num.id]);
                        } else {
                          setSelectedNumbers(selectedNumbers.filter((id) => id !== num.id));
                        }
                      }}
                      className="h-4 w-4"
                    />
                    <div className="flex-1">
                      <p className="font-medium">{num.number}</p>
                      <p className="text-xs text-muted-foreground">{num.provider}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddNumbersDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                selectedPool &&
                addNumbersMutation.mutate({
                  poolId: selectedPool.id,
                  phoneNumberIds: selectedNumbers,
                })
              }
              disabled={selectedNumbers.length === 0 || addNumbersMutation.isPending}
            >
              Add {selectedNumbers.length} Number{selectedNumbers.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
