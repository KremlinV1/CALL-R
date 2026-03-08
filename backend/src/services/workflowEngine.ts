import { db } from '../db/index.js';
import { workflows, workflowNodes, workflowEdges, workflowExecutions } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

// ─── Types ──────────────────────────────────────────────────────────

interface WorkflowContext {
  [key: string]: any;
  callId?: string;
  agentId?: string;
  contactPhone?: string;
  contactName?: string;
  sentiment?: string;
  outcome?: string;
  lastInput?: string;
  transcript?: string;
}

interface NodeResult {
  success: boolean;
  nextNodeId?: string | null;
  output?: any;
  error?: string;
  contextUpdates?: Record<string, any>;
}

interface TraceEntry {
  nodeId: string;
  nodeType: string;
  label: string;
  enteredAt: string;
  exitedAt?: string;
  result?: any;
  error?: string;
}

type NodeConfig = Record<string, any>;

// ─── Workflow Engine ────────────────────────────────────────────────

export class WorkflowEngine {
  private workflowId: string;
  private organizationId: string;
  private executionId: string | null = null;
  private context: WorkflowContext = {};
  private trace: TraceEntry[] = [];
  private nodesCache: Map<string, any> = new Map();
  private edgesCache: any[] = [];

  constructor(workflowId: string, organizationId: string) {
    this.workflowId = workflowId;
    this.organizationId = organizationId;
  }

  /**
   * Start executing a workflow from its start node.
   */
  async start(initialContext: WorkflowContext = {}): Promise<string> {
    // Load workflow
    const [workflow] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, this.workflowId), eq(workflows.organizationId, this.organizationId)))
      .limit(1);

    if (!workflow) throw new Error('Workflow not found');
    if (workflow.status !== 'active') throw new Error('Workflow is not active');

    // Merge default context with initial
    this.context = {
      ...(workflow.defaultContext as object || {}),
      ...initialContext,
    };

    // Load all nodes and edges
    const nodes = await db
      .select()
      .from(workflowNodes)
      .where(eq(workflowNodes.workflowId, this.workflowId));

    this.edgesCache = await db
      .select()
      .from(workflowEdges)
      .where(eq(workflowEdges.workflowId, this.workflowId));

    for (const node of nodes) {
      this.nodesCache.set(node.id, node);
    }

    // Find start node
    const startNode = nodes.find(n => n.nodeType === 'start');
    if (!startNode) throw new Error('Workflow has no start node');

    // Create execution record
    const [execution] = await db.insert(workflowExecutions).values({
      workflowId: this.workflowId,
      organizationId: this.organizationId,
      callId: initialContext.callId || null,
      status: 'running',
      currentNodeId: startNode.id,
      context: this.context,
      trace: [],
    }).returning();

    this.executionId = execution.id;

    // Increment workflow execution count
    await db
      .update(workflows)
      .set({
        totalExecutions: (workflow.totalExecutions || 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, this.workflowId));

    // Execute from start node
    await this.executeNode(startNode.id);

    return this.executionId;
  }

  /**
   * Resume execution from a specific node (e.g. after external event).
   */
  async resume(executionId: string, nodeId: string, eventData: Record<string, any> = {}) {
    this.executionId = executionId;

    // Load execution
    const [execution] = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, executionId))
      .limit(1);

    if (!execution) throw new Error('Execution not found');
    if (execution.status !== 'running') throw new Error('Execution is not running');

    this.context = { ...(execution.context as WorkflowContext), ...eventData };
    this.trace = (execution.trace as TraceEntry[]) || [];

    // Load nodes and edges
    const nodes = await db
      .select()
      .from(workflowNodes)
      .where(eq(workflowNodes.workflowId, execution.workflowId));

    this.edgesCache = await db
      .select()
      .from(workflowEdges)
      .where(eq(workflowEdges.workflowId, execution.workflowId));

    for (const node of nodes) {
      this.nodesCache.set(node.id, node);
    }

    await this.executeNode(nodeId);
  }

  /**
   * Execute a single node and follow edges to the next.
   */
  private async executeNode(nodeId: string, depth = 0): Promise<void> {
    if (depth > 50) {
      await this.failExecution('Maximum execution depth exceeded (possible loop)');
      return;
    }

    const node = this.nodesCache.get(nodeId);
    if (!node) {
      await this.failExecution(`Node ${nodeId} not found`);
      return;
    }

    const traceEntry: TraceEntry = {
      nodeId: node.id,
      nodeType: node.nodeType,
      label: node.label,
      enteredAt: new Date().toISOString(),
    };

    try {
      // Execute based on node type
      const result = await this.processNode(node);

      traceEntry.exitedAt = new Date().toISOString();
      traceEntry.result = result.output;
      if (result.error) traceEntry.error = result.error;
      this.trace.push(traceEntry);

      // Apply context updates
      if (result.contextUpdates) {
        this.context = { ...this.context, ...result.contextUpdates };
      }

      // Save progress
      await this.saveProgress(nodeId);

      if (!result.success) {
        await this.failExecution(result.error || 'Node execution failed');
        return;
      }

      // Determine next node
      let nextNodeId = result.nextNodeId;

      if (nextNodeId === undefined) {
        // Follow the default edge
        nextNodeId = this.getNextNodeId(nodeId);
      }

      if (nextNodeId === null) {
        // Explicit end
        await this.completeExecution();
        return;
      }

      if (!nextNodeId) {
        // No more edges — workflow ends
        await this.completeExecution();
        return;
      }

      // Continue to next node
      await this.executeNode(nextNodeId, depth + 1);

    } catch (err: any) {
      traceEntry.exitedAt = new Date().toISOString();
      traceEntry.error = err.message;
      this.trace.push(traceEntry);
      await this.failExecution(err.message);
    }
  }

  /**
   * Process a node based on its type. Returns the result.
   */
  private async processNode(node: any): Promise<NodeResult> {
    const config: NodeConfig = (node.config as NodeConfig) || {};

    switch (node.nodeType) {
      case 'start':
        return { success: true, output: { message: 'Workflow started' } };

      case 'agent': {
        // Agent node: hand off to an AI agent
        // In production this would initiate the agent session
        const agentId = config.agentId;
        if (!agentId) return { success: false, error: 'No agentId configured' };

        this.context.currentAgentId = agentId;
        return {
          success: true,
          output: { agentId, handoff: true },
          contextUpdates: { currentAgentId: agentId },
        };
      }

      case 'condition': {
        // Evaluate a condition and pick the right edge
        const field = config.field; // e.g. 'sentiment', 'outcome', 'lastInput'
        const operator = config.operator; // eq, neq, contains, gt, lt, in
        const value = config.value;
        const actualValue = this.context[field];

        const conditionMet = this.evaluateCondition(actualValue, operator, value);
        const branchLabel = conditionMet ? 'true' : 'false';

        // Find the edge matching this branch
        const edge = this.edgesCache.find(
          e => e.sourceNodeId === node.id && e.conditionLabel === branchLabel
        );

        return {
          success: true,
          nextNodeId: edge?.targetNodeId || null,
          output: { field, operator, value, actualValue, conditionMet, branch: branchLabel },
        };
      }

      case 'transfer': {
        // Transfer call to a destination
        const destination = config.destination;
        const transferType = config.type || 'cold';
        return {
          success: true,
          output: { action: 'transfer', destination, transferType },
          contextUpdates: { transferred: true, transferDestination: destination },
        };
      }

      case 'hangup':
        return {
          success: true,
          nextNodeId: null, // End execution
          output: { action: 'hangup' },
        };

      case 'wait': {
        // Pause execution — would be resumed by external event
        const waitSeconds = config.seconds || 5;
        return {
          success: true,
          output: { action: 'wait', seconds: waitSeconds, paused: true },
        };
      }

      case 'play_message': {
        const text = config.text || '';
        const voice = config.voice || 'female';
        const language = config.language || 'en-US';
        return {
          success: true,
          output: { action: 'play_message', text, voice, language },
        };
      }

      case 'collect_input': {
        const prompt = config.prompt || 'Please enter your response.';
        const inputType = config.inputType || 'dtmf';
        const maxDigits = config.maxDigits || 1;
        return {
          success: true,
          output: { action: 'collect_input', prompt, inputType, maxDigits, awaitingInput: true },
        };
      }

      case 'webhook': {
        const url = config.url;
        if (!url) return { success: false, error: 'No webhook URL configured' };

        try {
          const method = (config.method || 'POST').toUpperCase();
          const headers = config.headers || { 'Content-Type': 'application/json' };
          const body = config.body
            ? this.interpolateTemplate(JSON.stringify(config.body))
            : JSON.stringify(this.context);

          // Dynamic import to avoid circular deps
          const axios = (await import('axios')).default;
          const response = await axios({ method, url, headers, data: body, timeout: 10000 });

          return {
            success: true,
            output: { status: response.status, data: response.data },
            contextUpdates: { webhookResponse: response.data },
          };
        } catch (err: any) {
          return {
            success: true, // Don't fail workflow on webhook error
            output: { error: err.message },
            contextUpdates: { webhookError: err.message },
          };
        }
      }

      case 'set_variable': {
        const key = config.key;
        const value = config.value;
        if (!key) return { success: false, error: 'No variable key configured' };
        return {
          success: true,
          output: { key, value },
          contextUpdates: { [key]: value },
        };
      }

      case 'escalate': {
        const reason = config.reason || 'Escalated by workflow';
        const notifyChannels = config.notifyChannels || [];
        return {
          success: true,
          output: { action: 'escalate', reason, notifyChannels },
          contextUpdates: { escalated: true, escalationReason: reason },
        };
      }

      default:
        return { success: false, error: `Unknown node type: ${node.nodeType}` };
    }
  }

  /**
   * Evaluate a condition.
   */
  private evaluateCondition(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'eq': return actual == expected;
      case 'neq': return actual != expected;
      case 'gt': return Number(actual) > Number(expected);
      case 'lt': return Number(actual) < Number(expected);
      case 'gte': return Number(actual) >= Number(expected);
      case 'lte': return Number(actual) <= Number(expected);
      case 'contains': return String(actual || '').toLowerCase().includes(String(expected).toLowerCase());
      case 'not_contains': return !String(actual || '').toLowerCase().includes(String(expected).toLowerCase());
      case 'in': return Array.isArray(expected) ? expected.includes(actual) : String(expected).split(',').map(s => s.trim()).includes(String(actual));
      case 'exists': return actual !== undefined && actual !== null && actual !== '';
      case 'not_exists': return actual === undefined || actual === null || actual === '';
      default: return false;
    }
  }

  /**
   * Find the next node via edges (default/first edge from source).
   */
  private getNextNodeId(sourceNodeId: string): string | null {
    const edges = this.edgesCache
      .filter(e => e.sourceNodeId === sourceNodeId)
      .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));

    if (edges.length === 0) return null;

    // For non-condition nodes, take the first edge
    return edges[0].targetNodeId;
  }

  /**
   * Simple template interpolation: replace {{key}} with context values.
   */
  private interpolateTemplate(template: string): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return this.context[key] !== undefined ? String(this.context[key]) : '';
    });
  }

  /**
   * Save current progress to the database.
   */
  private async saveProgress(currentNodeId: string) {
    if (!this.executionId) return;
    await db
      .update(workflowExecutions)
      .set({
        currentNodeId,
        context: this.context,
        trace: this.trace,
      })
      .where(eq(workflowExecutions.id, this.executionId));
  }

  /**
   * Mark execution as completed.
   */
  private async completeExecution() {
    if (!this.executionId) return;
    await db
      .update(workflowExecutions)
      .set({
        status: 'completed',
        context: this.context,
        trace: this.trace,
        completedAt: new Date(),
      })
      .where(eq(workflowExecutions.id, this.executionId));

    // Update workflow success count
    await db
      .update(workflows)
      .set({
        successfulExecutions: (await this.getWorkflowSuccessCount()) + 1,
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, this.workflowId));

    console.log(`[WorkflowEngine] ✅ Execution ${this.executionId} completed`);
  }

  /**
   * Mark execution as failed.
   */
  private async failExecution(error: string) {
    if (!this.executionId) return;
    await db
      .update(workflowExecutions)
      .set({
        status: 'failed',
        error,
        context: this.context,
        trace: this.trace,
        completedAt: new Date(),
      })
      .where(eq(workflowExecutions.id, this.executionId));

    console.error(`[WorkflowEngine] ❌ Execution ${this.executionId} failed: ${error}`);
  }

  private async getWorkflowSuccessCount(): Promise<number> {
    const [w] = await db.select({ successfulExecutions: workflows.successfulExecutions })
      .from(workflows)
      .where(eq(workflows.id, this.workflowId))
      .limit(1);
    return w?.successfulExecutions || 0;
  }
}

// ─── Helper: Create a workflow from template ────────────────────────

export async function createWorkflowFromTemplate(
  organizationId: string,
  templateId: string,
  name: string,
): Promise<string> {
  // Load template
  const [template] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, templateId), eq(workflows.isTemplate, true)))
    .limit(1);

  if (!template) throw new Error('Template not found');

  // Clone workflow
  const [newWorkflow] = await db.insert(workflows).values({
    organizationId,
    name,
    description: template.description,
    status: 'draft',
    triggerType: template.triggerType,
    triggerConfig: template.triggerConfig,
    canvasData: template.canvasData,
    defaultContext: template.defaultContext,
    isTemplate: false,
  }).returning();

  // Clone nodes with ID mapping
  const templateNodes = await db
    .select()
    .from(workflowNodes)
    .where(eq(workflowNodes.workflowId, templateId));

  const nodeIdMap = new Map<string, string>(); // old ID -> new ID

  for (const node of templateNodes) {
    const [newNode] = await db.insert(workflowNodes).values({
      workflowId: newWorkflow.id,
      nodeType: node.nodeType,
      label: node.label,
      config: node.config,
      positionX: node.positionX,
      positionY: node.positionY,
      preserveContext: node.preserveContext,
      timeoutSeconds: node.timeoutSeconds,
    }).returning();
    nodeIdMap.set(node.id, newNode.id);
  }

  // Clone edges with remapped node IDs
  const templateEdges = await db
    .select()
    .from(workflowEdges)
    .where(eq(workflowEdges.workflowId, templateId));

  for (const edge of templateEdges) {
    const newSourceId = nodeIdMap.get(edge.sourceNodeId);
    const newTargetId = nodeIdMap.get(edge.targetNodeId);
    if (newSourceId && newTargetId) {
      await db.insert(workflowEdges).values({
        workflowId: newWorkflow.id,
        sourceNodeId: newSourceId,
        targetNodeId: newTargetId,
        conditionLabel: edge.conditionLabel,
        conditionValue: edge.conditionValue,
        sortOrder: edge.sortOrder,
      });
    }
  }

  return newWorkflow.id;
}
