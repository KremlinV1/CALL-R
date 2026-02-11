'use client';

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Phone, Loader2, Star, Globe, Wifi } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/stores/auth-store';

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`;

interface VogentPhoneNumber {
  id: string;
  number: string;
  type: 'PSTN' | 'SIP_USERNAME';
  agentId: string | null;
}

export default function PhoneNumbersPage() {
  const { token } = useAuthStore();

  // Fetch Vogent phone numbers
  const { data, isLoading, error } = useQuery({
    queryKey: ['vogent-phone-numbers'],
    queryFn: async () => {
      if (!token) throw new Error('No token');
      const response = await axios.get(`${API_URL}/vogent/phone-numbers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data as { phoneNumbers: VogentPhoneNumber[]; primaryNumberId: string | null };
    },
    enabled: !!token,
  });

  const phoneNumbers = data?.phoneNumbers || [];
  const primaryNumberId = data?.primaryNumberId || null;

  const formatPhoneNumber = (number: string) => {
    // Handle e.164 format like +18882689561
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
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Phone Numbers</h1>
        <p className="text-muted-foreground">Your phone numbers configured in Vogent for making and receiving calls</p>
      </div>

      {/* Phone Numbers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Your Phone Numbers
          </CardTitle>
          <CardDescription>
            Numbers available for outbound campaigns and calls. The primary number is used by default.
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
                {(error as any)?.response?.data?.error || 'Make sure Vogent is configured in Settings.'}
              </p>
            </div>
          ) : phoneNumbers.length === 0 ? (
            <div className="text-center py-8 border rounded-lg border-dashed">
              <Phone className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <h3 className="text-lg font-semibold mb-2">No phone numbers</h3>
              <p className="text-sm text-muted-foreground">
                No phone numbers are configured in your Vogent account. Add numbers in the Vogent dashboard or via the API.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {phoneNumbers.map((num) => {
                const isPrimary = num.id === primaryNumberId;
                const isSip = num.type === 'SIP_USERNAME';

                return (
                  <div
                    key={num.id}
                    className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${
                      isPrimary
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                        isPrimary ? 'bg-primary/10' : 'bg-muted'
                      }`}>
                        {isSip ? (
                          <Wifi className={`h-5 w-5 ${isPrimary ? 'text-primary' : 'text-muted-foreground'}`} />
                        ) : (
                          <Phone className={`h-5 w-5 ${isPrimary ? 'text-primary' : 'text-muted-foreground'}`} />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium font-mono text-lg">
                            {isSip ? num.number : formatPhoneNumber(num.number)}
                          </p>
                          {isPrimary && (
                            <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
                              <Star className="h-3 w-3 mr-1 fill-current" />
                              Primary
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-xs">
                            {isSip ? 'SIP' : 'PSTN'}
                          </Badge>
                          {num.agentId && (
                            <span className="text-xs text-muted-foreground">
                              Linked to agent
                            </span>
                          )}
                          {isPrimary && (
                            <span className="text-xs text-muted-foreground">
                              Used for outbound calls
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {num.id.slice(0, 8)}...
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
