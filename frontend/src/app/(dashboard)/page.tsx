"use client"

import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { AnimatedCard, StaggerContainer, StaggerItem, SlideIn } from "@/components/ui/animated-card"
import {
  Phone,
  PhoneOutgoing,
  PhoneIncoming,
  Clock,
  TrendingUp,
  TrendingDown,
  Bot,
  Users,
  Zap,
  ArrowUpRight,
  Activity,
  Loader2,
  Inbox,
} from "lucide-react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { useAuthStore } from "@/stores/auth-store"
import axios from "axios"

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0:00"
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins} min ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function formatChange(value: number): string {
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(1)}%`
}

export default function DashboardPage() {
  const { token } = useAuthStore()

  const headers = token ? { Authorization: `Bearer ${token}` } : {}

  const { data: dashboardData, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/analytics/dashboard?period=7d`, { headers })
      return res.data.stats as {
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
    refetchInterval: 30000,
  })

  const { data: callsData, isLoading: callsLoading } = useQuery({
    queryKey: ["dashboard-recent-calls"],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/calls?limit=5&page=1`, { headers })
      return res.data.calls as Array<{
        id: string
        toNumber: string
        fromNumber: string
        agentName: string | null
        durationSeconds: number | null
        status: string
        outcome: string | null
        createdAt: string
        direction: string
      }>
    },
    enabled: !!token,
    refetchInterval: 15000,
  })

  const { data: campaignsData, isLoading: campaignsLoading } = useQuery({
    queryKey: ["dashboard-campaigns"],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/campaigns`, { headers })
      return (res.data.campaigns as Array<{
        id: string
        name: string
        status: string
        totalContacts: number | null
        completedCalls: number | null
        connectedCalls: number | null
        failedCalls: number | null
        voicemailCalls: number | null
      }>).filter((c) => c.status === "running" || c.status === "scheduled")
    },
    enabled: !!token,
    refetchInterval: 15000,
  })

  const stats = [
    {
      title: "Total Calls (7d)",
      value: statsLoading ? null : (dashboardData?.totalCalls ?? 0).toLocaleString(),
      change: formatChange(dashboardData?.totalCallsChange ?? 0),
      trend: (dashboardData?.totalCallsChange ?? 0) >= 0 ? "up" : "down",
      icon: Phone,
      description: "vs prev period",
    },
    {
      title: "Active Agents",
      value: statsLoading ? null : String(dashboardData?.activeAgents ?? 0),
      change: `${dashboardData?.activeCampaigns ?? 0} campaigns`,
      trend: "neutral" as const,
      icon: Bot,
      description: "running",
    },
    {
      title: "Avg Duration",
      value: statsLoading ? null : formatDuration(dashboardData?.avgDurationSeconds ?? 0),
      change: formatChange(dashboardData?.avgDurationChange ?? 0),
      trend: (dashboardData?.avgDurationChange ?? 0) >= 0 ? "up" : "down",
      icon: Clock,
      description: "vs prev period",
    },
    {
      title: "Success Rate",
      value: statsLoading ? null : `${dashboardData?.successRate ?? 0}%`,
      change: formatChange(dashboardData?.successRateChange ?? 0),
      trend: (dashboardData?.successRateChange ?? 0) >= 0 ? "up" : "down",
      icon: TrendingUp,
      description: "calls completed",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <SlideIn direction="up" className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back! Here&apos;s what&apos;s happening with your voice agents.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link href="/calls">
              <PhoneIncoming className="mr-2 h-4 w-4" />
              Call History
            </Link>
          </Button>
          <Button asChild>
            <Link href="/campaigns">
              <Zap className="mr-2 h-4 w-4" />
              New Campaign
            </Link>
          </Button>
        </div>
      </SlideIn>

      {/* Stats Grid */}
      <StaggerContainer className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <StaggerItem key={stat.title}>
            <AnimatedCard className="h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {stat.value === null ? (
                  <Skeleton className="h-8 w-20 mb-1" />
                ) : (
                  <motion.div 
                    className="text-2xl font-bold"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 + index * 0.1, type: "spring" }}
                  >
                    {stat.value}
                  </motion.div>
                )}
                <div className="flex items-center text-xs text-muted-foreground">
                  {stat.trend === "up" && (
                    <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
                  )}
                  {stat.trend === "down" && (
                    <TrendingDown className="mr-1 h-3 w-3 text-red-500" />
                  )}
                  <span
                    className={
                      stat.trend === "up"
                        ? "text-green-500"
                        : stat.trend === "down"
                        ? "text-red-500"
                        : ""
                    }
                  >
                    {stat.change}
                  </span>
                  <span className="ml-1">{stat.description}</span>
                </div>
              </CardContent>
            </AnimatedCard>
          </StaggerItem>
        ))}
      </StaggerContainer>

      {/* Main Content Grid */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="grid gap-6 lg:grid-cols-7"
      >
        {/* Recent Calls */}
        <Card className="lg:col-span-4 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Calls</CardTitle>
              <CardDescription>Latest call activity across all agents</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/calls">
                View all
                <ArrowUpRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {callsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 rounded-lg border p-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                ))}
              </div>
            ) : !callsData || callsData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No calls yet</p>
                <p className="text-xs text-muted-foreground mt-1">Place your first call to see activity here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {callsData.map((call, index) => (
                  <motion.div
                    key={call.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + index * 0.1 }}
                    whileHover={{ scale: 1.01, x: 4 }}
                    className="flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        {call.status === "completed" ? (
                          <Phone className="h-4 w-4 text-green-500" />
                        ) : call.status === "no_answer" ? (
                          <PhoneOutgoing className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <Phone className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{call.toNumber || call.fromNumber}</p>
                        <p className="text-sm text-muted-foreground">
                          {call.agentName || "Unknown Agent"} • {formatDuration(call.durationSeconds ?? 0)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={
                          call.status === "completed"
                            ? "default"
                            : call.status === "no_answer"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {call.outcome || call.status}
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground">{timeAgo(call.createdAt)}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Campaigns */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Active Campaigns</CardTitle>
              <CardDescription>Currently running batch campaigns</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campaigns">
                View all
                <ArrowUpRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {campaignsLoading ? (
              <div className="space-y-6">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-2 w-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ))}
              </div>
            ) : !campaignsData || campaignsData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No active campaigns</p>
                <p className="text-xs text-muted-foreground mt-1">Create a campaign to start batch calling</p>
                <Button variant="outline" size="sm" className="mt-3" asChild>
                  <Link href="/campaigns">Create Campaign</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {campaignsData.map((campaign) => {
                  const total = campaign.totalContacts || 0
                  const completed = (campaign.completedCalls || 0) + (campaign.connectedCalls || 0) + (campaign.failedCalls || 0) + (campaign.voicemailCalls || 0)
                  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
                  return (
                    <div key={campaign.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-green-500" />
                          <span className="font-medium">{campaign.name}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {completed.toLocaleString()} / {total.toLocaleString()}
                        </span>
                      </div>
                      <Progress value={progress} className="h-2" />
                      <p className="text-xs text-muted-foreground">
                        {progress}% complete • {(total - completed).toLocaleString()} remaining
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks to get you started</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <Button variant="outline" className="h-auto flex-col gap-2 p-4" asChild>
              <Link href="/agents">
                <Bot className="h-6 w-6" />
                <span>Create Agent</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 p-4" asChild>
              <Link href="/campaigns">
                <PhoneOutgoing className="h-6 w-6" />
                <span>Start Campaign</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 p-4" asChild>
              <Link href="/contacts">
                <Users className="h-6 w-6" />
                <span>Upload Contacts</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 p-4" asChild>
              <Link href="/analytics">
                <TrendingUp className="h-6 w-6" />
                <span>View Reports</span>
              </Link>
            </Button>
          </div>
        </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
