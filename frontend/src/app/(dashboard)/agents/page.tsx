"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Bot,
  Plus,
  Search,
  MoreVertical,
  Play,
  Pause,
  Copy,
  Trash2,
  Settings,
  Phone,
} from "lucide-react"
import { useAgents, useDeleteAgent, useUpdateAgentStatus } from "@/hooks/use-agents"
import { AgentBuilderWizard } from "@/components/agents/agent-builder-wizard"

export default function AgentsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [editAgent, setEditAgent] = useState<any>(null)

  // Fetch agents from API
  const { data, isLoading, error } = useAgents()
  const deleteAgent = useDeleteAgent()
  const updateStatus = useUpdateAgentStatus()

  const agents = data?.agents || []
  
  const filteredAgents = agents.filter(
    (agent) =>
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (agent.description || "").toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleDeleteAgent = async (id: string) => {
    if (confirm("Are you sure you want to delete this agent?")) {
      await deleteAgent.mutateAsync(id)
    }
  }

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "paused" : "active"
    await updateStatus.mutateAsync({ id, status: newStatus as "active" | "paused" | "draft" })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
          <p className="text-muted-foreground">
            Create and manage your AI voice agents
          </p>
        </div>
        <Button onClick={() => setIsWizardOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Agent
        </Button>
      </div>

      {/* Agent Builder Wizard */}
      <AgentBuilderWizard 
        open={isWizardOpen} 
        onOpenChange={(open) => {
          setIsWizardOpen(open)
          if (!open) setEditAgent(null)
        }} 
        agent={editAgent} 
      />

      {/* Search and Filter */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredAgents.length === 0 && searchQuery === "" && (
        <EmptyState
          icon={Bot}
          title="No agents yet"
          description="Create your first AI voice agent to start making calls"
          action={{
            label: "Create Agent",
            onClick: () => setIsWizardOpen(true),
          }}
        />
      )}

      {/* No Search Results */}
      {!isLoading && filteredAgents.length === 0 && searchQuery !== "" && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No agents found matching &quot;{searchQuery}&quot;</p>
        </div>
      )}

      {/* Agents Grid */}
      {!isLoading && filteredAgents.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAgents.map((agent) => (
            <Card key={agent.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{agent.name}</CardTitle>
                      <Badge
                        variant={agent.status === "active" ? "default" : agent.status === "draft" ? "outline" : "secondary"}
                        className="mt-1"
                      >
                        {agent.status}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => {
                        setEditAgent(agent)
                        setIsWizardOpen(true)
                      }}>
                        <Settings className="mr-2 h-4 w-4" />
                        Configure
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Phone className="mr-2 h-4 w-4" />
                        Test Call
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={() => handleDeleteAgent(agent.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <CardDescription className="mt-2">{agent.description || "No description"}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Voice</span>
                    <span className="font-medium">{agent.voiceProvider || "Not set"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">LLM</span>
                    <span className="font-medium">{agent.llmModel || "Not set"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total Calls</span>
                    <span className="font-medium">{(agent.totalCalls || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Success Rate</span>
                    <span className="font-medium text-green-500">
                      {agent.totalCalls && agent.totalCalls > 0 
                        ? Math.round(((agent.successfulCalls || 0) / agent.totalCalls) * 100) 
                        : 0}%
                    </span>
                  </div>
                  <div className="pt-3 flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      <Phone className="mr-2 h-4 w-4" />
                      Test
                    </Button>
                    {agent.status === "active" ? (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => handleToggleStatus(agent.id, agent.status)}
                      >
                        <Pause className="mr-2 h-4 w-4" />
                        Pause
                      </Button>
                    ) : (
                      <Button 
                        size="sm" 
                        className="flex-1"
                        onClick={() => handleToggleStatus(agent.id, agent.status)}
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Activate
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Create Agent Card */}
          <Card className="border-dashed flex items-center justify-center min-h-[300px]">
            <Button
              variant="ghost"
              className="h-auto flex-col gap-3 p-6"
              onClick={() => setIsWizardOpen(true)}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed">
                <Plus className="h-6 w-6" />
              </div>
              <span className="text-lg font-medium">Create New Agent</span>
              <span className="text-sm text-muted-foreground">
                Build a custom AI voice agent
              </span>
            </Button>
          </Card>
        </div>
      )}
    </div>
  )
}
