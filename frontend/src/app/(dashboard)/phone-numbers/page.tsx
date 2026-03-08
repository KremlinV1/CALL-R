'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Phone, Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`;

interface PhoneNumber {
  id: string;
  number: string;
  provider: string | null;
  providerSid: string | null;
  label: string | null;
  type: string;
  status: string;
  agentId: string | null;
  capabilities: {
    voice?: boolean;
    sms?: boolean;
    mms?: boolean;
    fax?: boolean;
  } | null;
  createdAt: string;
}

export default function PhoneNumbersPage() {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['phone-numbers'],
    queryFn: async () => {
      if (!token) throw new Error('No token');
      const response = await axios.get(`${API_URL}/phone-numbers/db`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data as { numbers: PhoneNumber[]; total: number };
    },
    enabled: !!token,
  });

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
    onError: () => {
      toast.error('Failed to remove phone number');
    },
  });

  const phoneNumbers = data?.numbers || [];

  const formatPhoneNumber = (number: string) => {
    const cleaned = number.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+1') && cleaned.length === 12) {
      return `${cleaned.slice(0, 2)} (${cleaned.slice(2, 5)}) ${cleaned.slice(5, 8)}-${cleaned.slice(8)}`;
    }
    if (cleaned.startsWith('+') && cleaned.length > 5) {
      return cleaned;
    }
    return number;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Phone Numbers</h1>
        <p className="text-muted-foreground">Your imported phone numbers for making and receiving calls</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Your Phone Numbers
          </CardTitle>
          <CardDescription>
            Numbers available for outbound campaigns and calls. Import numbers from Settings → Telephony.
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
          ) : phoneNumbers.length === 0 ? (
            <div className="text-center py-8 border rounded-lg border-dashed">
              <Phone className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <h3 className="text-lg font-semibold mb-2">No phone numbers</h3>
              <p className="text-sm text-muted-foreground">
                Go to Settings → Telephony to configure a provider and import numbers.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {phoneNumbers.map((num) => (
                <div
                  key={num.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                      <Phone className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium font-mono text-lg">
                        {formatPhoneNumber(num.number)}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {num.provider && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {num.provider}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {num.type}
                        </Badge>
                        {num.capabilities?.voice && (
                          <Badge variant="secondary" className="text-xs">Voice</Badge>
                        )}
                        {num.capabilities?.sms && (
                          <Badge variant="secondary" className="text-xs">SMS</Badge>
                        )}
                        {num.status === 'active' && (
                          <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20">
                            Active
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMutation.mutate(num.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
