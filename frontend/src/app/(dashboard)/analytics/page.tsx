"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Phone,
  Clock,
  DollarSign,
  Users,
  Bot,
  Calendar,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { useAuthStore } from "@/stores/auth-store"
import axios from "axios"
import { toast } from "sonner"

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`

// Mock chart component (replace with recharts in production)
function SimpleChart({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length === 0) return <div className="flex items-end gap-1 h-16" />
  const max = Math.max(...data) || 1
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((value, i) => (
        <div
          key={i}
          className={`flex-1 rounded-t ${color}`}
          style={{ height: `${(value / max) * 100}%`, minHeight: '4px' }}
        />
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("7d")
  const { token } = useAuthStore()

  // Fetch dashboard stats
  const { data: statsData, isLoading: isLoadingStats } = useQuery({
    queryKey: ["analytics-dashboard", period],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/analytics/dashboard?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data.stats as {
        totalCalls: number
        totalCallsChange: number
        avgDurationSeconds: number
        avgDurationChange: number
        successRate: number
        successRateChange: number
        totalCostCents: number
        costPerCall: number
        activeCampaigns: number
        activeAgents: number
      }
    },
    enabled: !!token,
  })

  // Fetch call volume
  const { data: volumeData } = useQuery({
    queryKey: ["analytics-volume", period],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/analytics/call-volume?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data.data as Array<{
        date: string
        calls: number
        connected: number
        voicemail: number
        failed: number
      }>
    },
    enabled: !!token,
  })

  // Fetch outcomes
  const { data: outcomesData } = useQuery({
    queryKey: ["analytics-outcomes", period],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/analytics/outcomes?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data.outcomes as Array<{
        outcome: string
        count: number
        percentage: number
      }>
    },
    enabled: !!token,
  })

  // Fetch agent performance
  const { data: agentsData } = useQuery({
    queryKey: ["analytics-agents", period],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/analytics/agents?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data.agents as Array<{
        id: string
        name: string
        calls: number
        successRate: number
        avgDuration: number
        revenue: number
      }>
    },
    enabled: !!token,
  })

  const stats = statsData || { totalCalls: 0, avgDurationSeconds: 0, successRate: 0, totalCostCents: 0, totalCallsChange: 0, avgDurationChange: 0, successRateChange: 0, costPerCall: 0, activeCampaigns: 0, activeAgents: 0 }
  const outcomeBreakdown = outcomesData || []
  const topAgents = agentsData || []
  const callVolume = volumeData || []

  const handleExport = async () => {
    try {
      const response = await axios.get(`${API_URL}/analytics/export?period=${period}&format=csv`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      toast.success("Report export started")
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to export report")
    }
  }

  if (isLoadingStats) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            Insights and performance metrics for your voice agents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Calls
            </CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCalls.toLocaleString()}</div>
            <div className={`flex items-center text-xs mt-1 ${stats.totalCallsChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {stats.totalCallsChange >= 0 ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
              <span>{stats.totalCallsChange >= 0 ? '+' : ''}{stats.totalCallsChange.toFixed(1)}% from last period</span>
            </div>
            <SimpleChart data={callVolume.slice(-7).map((d: any) => d.calls || 0)} color="bg-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Duration
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.floor(stats.avgDurationSeconds / 60)}:{(stats.avgDurationSeconds % 60).toString().padStart(2, '0')}</div>
            <div className={`flex items-center text-xs mt-1 ${stats.avgDurationChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {stats.avgDurationChange >= 0 ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
              <span>{stats.avgDurationChange >= 0 ? '+' : ''}{stats.avgDurationChange.toFixed(1)}% from last period</span>
            </div>
            <SimpleChart data={callVolume.slice(-7).map((d: any) => d.calls || 0)} color="bg-blue-500" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Success Rate
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.successRate.toFixed(1)}%</div>
            <div className={`flex items-center text-xs mt-1 ${stats.successRateChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {stats.successRateChange >= 0 ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
              <span>{stats.successRateChange >= 0 ? '+' : ''}{stats.successRateChange.toFixed(1)}% from last period</span>
            </div>
            <SimpleChart data={callVolume.slice(-7).map((d: any) => d.connected || 0)} color="bg-green-500" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Cost
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(stats.totalCostCents / 100).toFixed(2)}</div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              <span>${(stats.costPerCall / 100).toFixed(2)} per call avg</span>
            </div>
            <SimpleChart data={callVolume.slice(-7).map((d: any) => d.calls || 0)} color="bg-yellow-500" />
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-7">
        {/* Call Volume Chart */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Call Volume</CardTitle>
            <CardDescription>Daily call volume over the past month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end gap-1">
              {callVolume.length > 0 ? (
                callVolume.map((day: any, i: number) => {
                  const maxCalls = Math.max(...callVolume.map((d: any) => d.calls || 0))
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full bg-primary rounded-t"
                        style={{ height: `${((day.calls || 0) / maxCalls) * 200}px`, minHeight: '4px' }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {new Date(day.date).getDate()}
                      </span>
                    </div>
                  )
                })
              ) : (
                <div className="flex items-center justify-center w-full h-full text-muted-foreground">
                  No data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Outcome Breakdown */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Call Outcomes</CardTitle>
            <CardDescription>Distribution of call results</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {outcomeBreakdown.map((item) => (
                <div key={item.outcome} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{item.outcome}</span>
                    <span className="font-medium">{item.count}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Performance</CardTitle>
          <CardDescription>Performance metrics by agent</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {topAgents.map((agent) => (
              <Card key={agent.name}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {agent.calls.toLocaleString()} calls
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Success Rate</p>
                      <p className="font-medium text-green-500">{agent.successRate}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Revenue</p>
                      <p className="font-medium">{agent.revenue}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Time-based Insights */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Best Call Times</CardTitle>
            <CardDescription>Optimal hours for reaching contacts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { time: "10:00 AM - 11:00 AM", rate: 92, calls: 456 },
                { time: "2:00 PM - 3:00 PM", rate: 88, calls: 398 },
                { time: "11:00 AM - 12:00 PM", rate: 85, calls: 367 },
                { time: "3:00 PM - 4:00 PM", rate: 82, calls: 312 },
                { time: "9:00 AM - 10:00 AM", rate: 78, calls: 289 },
              ].map((slot, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant={i === 0 ? "default" : "outline"}>{i + 1}</Badge>
                    <span>{slot.time}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium text-green-500">{slot.rate}%</span>
                    <span className="text-muted-foreground text-sm ml-2">
                      ({slot.calls} calls)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sentiment Analysis</CardTitle>
            <CardDescription>Call sentiment distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Positive</span>
                    <span className="text-sm font-medium text-green-500">72%</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: '72%' }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Neutral</span>
                    <span className="text-sm font-medium">20%</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-gray-400 rounded-full" style={{ width: '20%' }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Negative</span>
                    <span className="text-sm font-medium text-red-500">8%</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full" style={{ width: '8%' }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-2">Key Insights</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Positive sentiment increased 5% this week</li>
                <li>• Longer calls tend to have higher positive sentiment</li>
                <li>• Morning calls show 8% higher satisfaction</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
