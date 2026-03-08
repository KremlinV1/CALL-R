"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Plus,
  Loader2,
  Play,
  Pause,
  GitBranch,
  Bot,
  PhoneForwarded,
  PhoneOff,
  MessageSquare,
  Webhook,
  AlertTriangle,
  Variable,
  Clock,
  Keyboard,
  MoreVertical,
  Pencil,
  Trash2,
  Copy,
  Eye,
  ArrowRight,
  CircleDot,
  CheckCircle2,
  XCircle,
  BarChart3,
} from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useAuthStore } from "@/stores/auth-store"
import axios from "axios"
import { format } from "date-fns"

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`

interface Workflow {
  id: string
  name: string
  description: string | null
  status: string
  version: number
  triggerType: string
  triggerConfig: any
  totalExecutions: number
  successfulExecutions: number
  isTemplate: boolean
  createdAt: string
  updatedAt: string
}

interface WorkflowNode {
  id: string
  workflowId: string
  nodeType: string
  label: string
  config: any
  positionX: number
  positionY: number
  preserveContext: string[]
  timeoutSeconds: number | null
}

interface WorkflowEdge {
  id: string
  workflowId: string
  sourceNodeId: string
  targetNodeId: string
  conditionLabel: string | null
  conditionValue: string | null
}

interface WorkflowExecution {
  id: string
  workflowId: string
  status: string
  currentNodeId: string | null
  context: any
  trace: any[]
  error: string | null
  startedAt: string
  completedAt: string | null
}

const nodeTypeConfig: Record<string, { label: string; icon: any; color: string; description: string }> = {
  start:         { label: "Start",          icon: CircleDot,       color: "bg-green-500/10 text-green-600 border-green-500/30",   description: "Entry point of the workflow" },
  agent:         { label: "AI Agent",       icon: Bot,             color: "bg-blue-500/10 text-blue-600 border-blue-500/30",      description: "Hand off to an AI agent" },
  condition:     { label: "Condition",      icon: GitBranch,       color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30", description: "Branch based on a condition" },
  transfer:      { label: "Transfer",       icon: PhoneForwarded,  color: "bg-purple-500/10 text-purple-600 border-purple-500/30", description: "Transfer to phone/agent" },
  hangup:        { label: "Hang Up",        icon: PhoneOff,        color: "bg-red-500/10 text-red-600 border-red-500/30",         description: "End the call" },
  wait:          { label: "Wait",           icon: Clock,           color: "bg-gray-500/10 text-gray-600 border-gray-500/30",      description: "Pause execution" },
  play_message:  { label: "Play Message",   icon: MessageSquare,   color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/30",     description: "Play TTS or audio" },
  collect_input: { label: "Collect Input",  icon: Keyboard,        color: "bg-indigo-500/10 text-indigo-600 border-indigo-500/30", description: "Gather DTMF or speech" },
  webhook:       { label: "Webhook",        icon: Webhook,         color: "bg-orange-500/10 text-orange-600 border-orange-500/30", description: "Fire external webhook" },
  set_variable:  { label: "Set Variable",   icon: Variable,        color: "bg-teal-500/10 text-teal-600 border-teal-500/30",     description: "Set context variable" },
  escalate:      { label: "Escalate",       icon: AlertTriangle,   color: "bg-rose-500/10 text-rose-600 border-rose-500/30",     description: "Escalate to supervisor" },
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-600",
  active: "bg-green-500/10 text-green-600",
  paused: "bg-yellow-500/10 text-yellow-600",
  archived: "bg-red-500/10 text-red-600",
}

export default function WorkflowsPage() {
  const { token } = useAuthStore()
  const queryClient = useQueryClient()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"list" | "detail">("list")

  const { data, isLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/workflows`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data
    },
    enabled: !!token,
  })

  const workflows: Workflow[] = data?.workflows || []

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`${API_URL}/workflows/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
      toast.success("Workflow archived")
    },
    onError: () => toast.error("Failed to archive workflow"),
  })

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await axios.put(`${API_URL}/workflows/${id}`, { status }, {
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
      toast.success("Workflow status updated")
    },
    onError: () => toast.error("Failed to update status"),
  })

  if (viewMode === "detail" && selectedWorkflow) {
    return (
      <WorkflowDetail
        workflowId={selectedWorkflow}
        token={token}
        onBack={() => { setViewMode("list"); setSelectedWorkflow(null) }}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
          <p className="text-muted-foreground">
            Build multi-agent workflows with conditional routing and escalation paths
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Workflow
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && workflows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No workflows yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first workflow to orchestrate multi-agent call flows</p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Workflow
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Workflow list */}
      {workflows.length > 0 && (
        <div className="grid gap-4">
          {workflows.map((wf) => (
            <Card key={wf.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <GitBranch className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{wf.name}</h3>
                        <Badge variant="outline" className={statusColors[wf.status] || ""}>
                          {wf.status}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          v{wf.version}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {wf.description || "No description"}
                        {" · "}
                        Trigger: {wf.triggerType.replace(/_/g, " ")}
                        {" · "}
                        Updated {format(new Date(wf.updatedAt), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Stats */}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mr-4">
                      <div className="flex items-center gap-1" title="Total executions">
                        <BarChart3 className="h-3.5 w-3.5" />
                        {wf.totalExecutions}
                      </div>
                      <div className="flex items-center gap-1" title="Success rate">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        {wf.totalExecutions > 0
                          ? Math.round((wf.successfulExecutions / wf.totalExecutions) * 100)
                          : 0}%
                      </div>
                    </div>

                    {/* Quick actions */}
                    {wf.status === "draft" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatusMutation.mutate({ id: wf.id, status: "active" })}
                      >
                        <Play className="mr-1 h-3.5 w-3.5" /> Activate
                      </Button>
                    )}
                    {wf.status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatusMutation.mutate({ id: wf.id, status: "paused" })}
                      >
                        <Pause className="mr-1 h-3.5 w-3.5" /> Pause
                      </Button>
                    )}
                    {wf.status === "paused" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatusMutation.mutate({ id: wf.id, status: "active" })}
                      >
                        <Play className="mr-1 h-3.5 w-3.5" /> Resume
                      </Button>
                    )}

                    <Button
                      size="sm"
                      onClick={() => { setSelectedWorkflow(wf.id); setViewMode("detail") }}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" /> Open
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setSelectedWorkflow(wf.id); setViewMode("detail") }}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => {
                            if (confirm("Archive this workflow?")) deleteMutation.mutate(wf.id)
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Archive
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Workflow Dialog */}
      <CreateWorkflowDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        token={token}
        onCreated={(id) => {
          queryClient.invalidateQueries({ queryKey: ["workflows"] })
          setSelectedWorkflow(id)
          setViewMode("detail")
        }}
      />
    </div>
  )
}

// ─── Create Workflow Dialog ──────────────────────────────────────────

function CreateWorkflowDialog({ open, onOpenChange, token, onCreated }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string | null
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [triggerType, setTriggerType] = useState("inbound_call")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!token || !name) return
    setSubmitting(true)
    try {
      const res = await axios.post(`${API_URL}/workflows`, {
        name,
        description,
        triggerType,
      }, { headers: { Authorization: `Bearer ${token}` } })
      toast.success("Workflow created!")
      onOpenChange(false)
      setName(""); setDescription(""); setTriggerType("inbound_call")
      onCreated(res.data.workflow.id)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to create workflow")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Workflow</DialogTitle>
          <DialogDescription>Create a multi-agent call workflow</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Inbound Sales Routing" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this workflow do?" rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Trigger</Label>
            <Select value={triggerType} onValueChange={setTriggerType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inbound_call">Inbound Call</SelectItem>
                <SelectItem value="outbound_call">Outbound Call</SelectItem>
                <SelectItem value="manual">Manual Trigger</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !name}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Workflow Detail / Builder ──────────────────────────────────────

function WorkflowDetail({ workflowId, token, onBack }: {
  workflowId: string
  token: string | null
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const [isAddNodeOpen, setIsAddNodeOpen] = useState(false)
  const [isAddEdgeOpen, setIsAddEdgeOpen] = useState(false)
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null)
  const [executionsOpen, setExecutionsOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/workflows/${workflowId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data
    },
    enabled: !!token,
  })

  const workflow: Workflow | null = data?.workflow || null
  const nodes: WorkflowNode[] = data?.nodes || []
  const edges: WorkflowEdge[] = data?.edges || []

  const deleteNodeMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      await axios.delete(`${API_URL}/workflows/${workflowId}/nodes/${nodeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] })
      toast.success("Node removed")
      setSelectedNode(null)
    },
    onError: () => toast.error("Failed to remove node"),
  })

  const deleteEdgeMutation = useMutation({
    mutationFn: async (edgeId: string) => {
      await axios.delete(`${API_URL}/workflows/${workflowId}/edges/${edgeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] })
      toast.success("Connection removed")
    },
    onError: () => toast.error("Failed to remove connection"),
  })

  const executeMutation = useMutation({
    mutationFn: async () => {
      const res = await axios.post(`${API_URL}/workflows/${workflowId}/execute`, { context: {} }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data
    },
    onSuccess: (data) => {
      toast.success(`Execution started: ${data.executionId}`)
      queryClient.invalidateQueries({ queryKey: ["workflows"] })
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || "Failed to execute"),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!workflow) {
    return <p className="text-muted-foreground">Workflow not found</p>
  }

  // Build adjacency for visual flow
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
            <h1 className="text-2xl font-bold">{workflow.name}</h1>
            <Badge variant="outline" className={statusColors[workflow.status] || ""}>{workflow.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {workflow.description || "No description"} · Trigger: {workflow.triggerType.replace(/_/g, " ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setExecutionsOpen(true)}>
            <BarChart3 className="mr-1 h-3.5 w-3.5" /> Executions
          </Button>
          <Button
            size="sm"
            onClick={() => executeMutation.mutate()}
            disabled={executeMutation.isPending || workflow.status !== 'active'}
          >
            {executeMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
            Test Run
          </Button>
        </div>
      </div>

      {/* Flow Builder */}
      <div className="grid grid-cols-3 gap-6">
        {/* Left panel: Node list / flow visualization */}
        <div className="col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Workflow Nodes</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setIsAddEdgeOpen(true)}>
                    <ArrowRight className="mr-1 h-3.5 w-3.5" /> Connect
                  </Button>
                  <Button size="sm" onClick={() => setIsAddNodeOpen(true)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add Node
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {nodes.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No nodes yet. Add a start node to begin.</p>
              )}

              <div className="space-y-3">
                {nodes.map((node) => {
                  const cfg = nodeTypeConfig[node.nodeType] || { label: node.nodeType, icon: CircleDot, color: "", description: "" }
                  const Icon = cfg.icon
                  const outEdges = edges.filter(e => e.sourceNodeId === node.id)
                  const inEdges = edges.filter(e => e.targetNodeId === node.id)

                  return (
                    <div
                      key={node.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors hover:border-primary/50 ${
                        selectedNode?.id === node.id ? "border-primary ring-1 ring-primary/30" : ""
                      }`}
                      onClick={() => setSelectedNode(node)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cfg.color}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{node.label}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5">{cfg.label}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {inEdges.length > 0 && `${inEdges.length} input${inEdges.length > 1 ? "s" : ""}`}
                              {inEdges.length > 0 && outEdges.length > 0 && " · "}
                              {outEdges.length > 0 && `${outEdges.length} output${outEdges.length > 1 ? "s" : ""}`}
                              {inEdges.length === 0 && outEdges.length === 0 && "No connections"}
                            </p>
                          </div>
                        </div>
                        {node.nodeType !== "start" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirm(`Remove "${node.label}"?`)) deleteNodeMutation.mutate(node.id)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </div>

                      {/* Show outgoing edges */}
                      {outEdges.length > 0 && (
                        <div className="mt-2 pl-12 space-y-1">
                          {outEdges.map(edge => {
                            const target = nodeMap.get(edge.targetNodeId)
                            return (
                              <div key={edge.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                                <ArrowRight className="h-3 w-3" />
                                <span>
                                  {edge.conditionLabel && <Badge variant="outline" className="text-[10px] mr-1">{edge.conditionLabel}</Badge>}
                                  {target?.label || "Unknown"}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 ml-auto"
                                  onClick={(e) => { e.stopPropagation(); deleteEdgeMutation.mutate(edge.id) }}
                                >
                                  <XCircle className="h-3 w-3" />
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right panel: Node details */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {selectedNode ? "Node Details" : "Select a Node"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedNode && (
                <p className="text-sm text-muted-foreground">Click a node to view its configuration</p>
              )}
              {selectedNode && (
                <NodeDetailPanel
                  node={selectedNode}
                  workflowId={workflowId}
                  token={token}
                  onUpdated={() => {
                    queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] })
                  }}
                />
              )}
            </CardContent>
          </Card>

          {/* Workflow info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nodes</span>
                <span>{nodes.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Connections</span>
                <span>{edges.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Executions</span>
                <span>{workflow.totalExecutions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Success Rate</span>
                <span>{workflow.totalExecutions > 0 ? Math.round((workflow.successfulExecutions / workflow.totalExecutions) * 100) : 0}%</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Node Dialog */}
      <AddNodeDialog
        open={isAddNodeOpen}
        onOpenChange={setIsAddNodeOpen}
        workflowId={workflowId}
        token={token}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] })}
      />

      {/* Add Edge Dialog */}
      <AddEdgeDialog
        open={isAddEdgeOpen}
        onOpenChange={setIsAddEdgeOpen}
        workflowId={workflowId}
        nodes={nodes}
        token={token}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] })}
      />

      {/* Executions Dialog */}
      <ExecutionsDialog
        open={executionsOpen}
        onOpenChange={setExecutionsOpen}
        workflowId={workflowId}
        token={token}
      />
    </div>
  )
}

// ─── Node Detail Panel ──────────────────────────────────────────────

function NodeDetailPanel({ node, workflowId, token, onUpdated }: {
  node: WorkflowNode
  workflowId: string
  token: string | null
  onUpdated: () => void
}) {
  const [label, setLabel] = useState(node.label)
  const [config, setConfig] = useState(JSON.stringify(node.config || {}, null, 2))
  const [saving, setSaving] = useState(false)

  // Reset when node changes
  if (label !== node.label && !saving) {
    setLabel(node.label)
    setConfig(JSON.stringify(node.config || {}, null, 2))
  }

  const handleSave = async () => {
    if (!token) return
    setSaving(true)
    try {
      let parsedConfig = {}
      try { parsedConfig = JSON.parse(config) } catch { toast.error("Invalid JSON in config"); setSaving(false); return }

      await axios.put(`${API_URL}/workflows/${workflowId}/nodes/${node.id}`, {
        label,
        config: parsedConfig,
      }, { headers: { Authorization: `Bearer ${token}` } })

      toast.success("Node updated")
      onUpdated()
    } catch {
      toast.error("Failed to update node")
    } finally {
      setSaving(false)
    }
  }

  const cfg = nodeTypeConfig[node.nodeType] || { label: node.nodeType, icon: CircleDot, color: "" }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded flex items-center justify-center ${cfg.color}`}>
          <cfg.icon className="h-4 w-4" />
        </div>
        <Badge variant="outline">{cfg.label}</Badge>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Label</Label>
        <Input value={label} onChange={e => setLabel(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Configuration (JSON)</Label>
        <Textarea
          value={config}
          onChange={e => setConfig(e.target.value)}
          rows={8}
          className="font-mono text-xs"
        />
      </div>

      {node.timeoutSeconds && (
        <div className="text-xs text-muted-foreground">
          Timeout: {node.timeoutSeconds}s
        </div>
      )}

      <Button size="sm" onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
        Save Changes
      </Button>
    </div>
  )
}

// ─── Add Node Dialog ────────────────────────────────────────────────

function AddNodeDialog({ open, onOpenChange, workflowId, token, onCreated }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  token: string | null
  onCreated: () => void
}) {
  const [nodeType, setNodeType] = useState("")
  const [label, setLabel] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!token || !nodeType || !label) return
    setSubmitting(true)
    try {
      await axios.post(`${API_URL}/workflows/${workflowId}/nodes`, {
        nodeType,
        label,
        config: {},
      }, { headers: { Authorization: `Bearer ${token}` } })
      toast.success("Node added")
      onOpenChange(false)
      setNodeType(""); setLabel("")
      onCreated()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to add node")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Node</DialogTitle>
          <DialogDescription>Add a step to your workflow</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Node Type *</Label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(nodeTypeConfig).filter(([k]) => k !== "start").map(([key, cfg]) => {
                const Icon = cfg.icon
                return (
                  <button
                    key={key}
                    type="button"
                    className={`p-2 rounded-lg border text-center transition-colors text-xs ${
                      nodeType === key ? "border-primary bg-primary/5" : "hover:border-primary/50"
                    }`}
                    onClick={() => {
                      setNodeType(key)
                      if (!label) setLabel(cfg.label)
                    }}
                  >
                    <Icon className={`h-4 w-4 mx-auto mb-1 ${cfg.color.includes("text-") ? cfg.color.split(" ").find((c: string) => c.startsWith("text-")) : ""}`} />
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Label *</Label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Check Sentiment" />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !nodeType || !label}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add Node
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Add Edge Dialog ────────────────────────────────────────────────

function AddEdgeDialog({ open, onOpenChange, workflowId, nodes, token, onCreated }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  nodes: WorkflowNode[]
  token: string | null
  onCreated: () => void
}) {
  const [source, setSource] = useState("")
  const [target, setTarget] = useState("")
  const [conditionLabel, setConditionLabel] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!token || !source || !target) return
    setSubmitting(true)
    try {
      await axios.post(`${API_URL}/workflows/${workflowId}/edges`, {
        sourceNodeId: source,
        targetNodeId: target,
        conditionLabel: conditionLabel || null,
      }, { headers: { Authorization: `Bearer ${token}` } })
      toast.success("Connection added")
      onOpenChange(false)
      setSource(""); setTarget(""); setConditionLabel("")
      onCreated()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to add connection")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Connect Nodes</DialogTitle>
          <DialogDescription>Create a connection between two nodes</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>From Node *</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue placeholder="Select source..." /></SelectTrigger>
              <SelectContent>
                {nodes.map(n => (
                  <SelectItem key={n.id} value={n.id}>{n.label} ({nodeTypeConfig[n.nodeType]?.label || n.nodeType})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>To Node *</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger><SelectValue placeholder="Select target..." /></SelectTrigger>
              <SelectContent>
                {nodes.filter(n => n.id !== source).map(n => (
                  <SelectItem key={n.id} value={n.id}>{n.label} ({nodeTypeConfig[n.nodeType]?.label || n.nodeType})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Condition Label <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={conditionLabel} onChange={e => setConditionLabel(e.target.value)} placeholder="e.g. true, false, timeout" />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !source || !target}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Executions Dialog ──────────────────────────────────────────────

function ExecutionsDialog({ open, onOpenChange, workflowId, token }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  token: string | null
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["workflow-executions", workflowId],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/workflows/${workflowId}/executions`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data
    },
    enabled: !!token && open,
  })

  const executions: WorkflowExecution[] = data?.executions || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Workflow Executions</DialogTitle>
          <DialogDescription>History of workflow runs</DialogDescription>
        </DialogHeader>
        {isLoading && (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        )}
        {!isLoading && executions.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No executions yet</p>
        )}
        {executions.length > 0 && (
          <div className="space-y-3 mt-2">
            {executions.map(exec => (
              <div key={exec.id} className="p-3 border rounded-lg text-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {exec.status === "completed" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {exec.status === "failed" && <XCircle className="h-4 w-4 text-red-500" />}
                    {exec.status === "running" && <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />}
                    <Badge variant="outline">{exec.status}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(exec.startedAt), "MMM d, h:mm:ss a")}
                    {exec.completedAt && ` → ${format(new Date(exec.completedAt), "h:mm:ss a")}`}
                  </span>
                </div>
                {exec.error && (
                  <p className="text-xs text-red-600 bg-red-500/10 p-2 rounded mb-2">{exec.error}</p>
                )}
                {Array.isArray(exec.trace) && exec.trace.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Trace ({exec.trace.length} steps):</p>
                    {exec.trace.map((step: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground pl-2">
                        <span className="text-[10px] bg-muted px-1 rounded">{i + 1}</span>
                        <span>{step.label}</span>
                        <Badge variant="outline" className="text-[10px]">{step.nodeType}</Badge>
                        {step.error && <span className="text-red-500">⚠ {step.error}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
