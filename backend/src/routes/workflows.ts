import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { workflows, workflowNodes, workflowEdges, workflowExecutions } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { WorkflowEngine, createWorkflowFromTemplate } from '../services/workflowEngine.js';

const router = Router();

// ─── Workflows CRUD ─────────────────────────────────────────────────

// GET /api/workflows — list workflows
router.get('/', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { status, isTemplate } = req.query;

    let results = await db
      .select()
      .from(workflows)
      .where(eq(workflows.organizationId, organizationId))
      .orderBy(desc(workflows.updatedAt));

    if (status) results = results.filter(w => w.status === status);
    if (isTemplate !== undefined) results = results.filter(w => w.isTemplate === (isTemplate === 'true'));

    res.json({ workflows: results });
  } catch (error: any) {
    console.error('Error fetching workflows:', error.message);
    res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

// GET /api/workflows/templates — list workflow templates
router.get('/templates', async (req: any, res: Response) => {
  try {
    const results = await db
      .select()
      .from(workflows)
      .where(eq(workflows.isTemplate, true))
      .orderBy(desc(workflows.updatedAt));

    res.json({ templates: results });
  } catch (error: any) {
    console.error('Error fetching templates:', error.message);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// GET /api/workflows/:id — get workflow with nodes & edges
router.get('/:id', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const [workflow] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, req.params.id), eq(workflows.organizationId, organizationId)))
      .limit(1);

    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });

    const nodes = await db
      .select()
      .from(workflowNodes)
      .where(eq(workflowNodes.workflowId, workflow.id));

    const edges = await db
      .select()
      .from(workflowEdges)
      .where(eq(workflowEdges.workflowId, workflow.id));

    res.json({ workflow, nodes, edges });
  } catch (error: any) {
    console.error('Error fetching workflow:', error.message);
    res.status(500).json({ error: 'Failed to fetch workflow' });
  }
});

// POST /api/workflows — create workflow
router.post('/', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { name, description, triggerType, triggerConfig, defaultContext, templateId } = req.body;

    if (!name) return res.status(400).json({ error: 'name is required' });

    // Create from template
    if (templateId) {
      try {
        const workflowId = await createWorkflowFromTemplate(organizationId, templateId, name);
        const [workflow] = await db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
        return res.status(201).json({ workflow });
      } catch (err: any) {
        return res.status(400).json({ error: err.message });
      }
    }

    // Create blank workflow with a start node
    const [workflow] = await db.insert(workflows).values({
      organizationId,
      name,
      description: description || '',
      triggerType: triggerType || 'inbound_call',
      triggerConfig: triggerConfig || {},
      defaultContext: defaultContext || {},
    }).returning();

    // Add default start node
    await db.insert(workflowNodes).values({
      workflowId: workflow.id,
      nodeType: 'start',
      label: 'Start',
      config: {},
      positionX: 250,
      positionY: 50,
    });

    res.status(201).json({ workflow });
  } catch (error: any) {
    console.error('Error creating workflow:', error.message);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

// PUT /api/workflows/:id — update workflow metadata
router.put('/:id', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { name, description, status, triggerType, triggerConfig, defaultContext, canvasData } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (triggerType !== undefined) updateData.triggerType = triggerType;
    if (triggerConfig !== undefined) updateData.triggerConfig = triggerConfig;
    if (defaultContext !== undefined) updateData.defaultContext = defaultContext;
    if (canvasData !== undefined) updateData.canvasData = canvasData;

    const [updated] = await db
      .update(workflows)
      .set(updateData)
      .where(and(eq(workflows.id, req.params.id), eq(workflows.organizationId, organizationId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Workflow not found' });

    res.json({ workflow: updated });
  } catch (error: any) {
    console.error('Error updating workflow:', error.message);
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

// DELETE /api/workflows/:id — archive workflow
router.delete('/:id', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const [updated] = await db
      .update(workflows)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(and(eq(workflows.id, req.params.id), eq(workflows.organizationId, organizationId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Workflow not found' });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting workflow:', error.message);
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

// ─── Workflow Nodes ─────────────────────────────────────────────────

// POST /api/workflows/:id/nodes — add node
router.post('/:id/nodes', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    // Verify workflow ownership
    const [workflow] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, req.params.id), eq(workflows.organizationId, organizationId)))
      .limit(1);

    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });

    const { nodeType, label, config, positionX, positionY, preserveContext, timeoutSeconds } = req.body;

    if (!nodeType || !label) return res.status(400).json({ error: 'nodeType and label are required' });

    const [node] = await db.insert(workflowNodes).values({
      workflowId: workflow.id,
      nodeType,
      label,
      config: config || {},
      positionX: positionX || 0,
      positionY: positionY || 0,
      preserveContext: preserveContext || [],
      timeoutSeconds: timeoutSeconds || null,
    }).returning();

    res.status(201).json({ node });
  } catch (error: any) {
    console.error('Error adding node:', error.message);
    res.status(500).json({ error: 'Failed to add node' });
  }
});

// PUT /api/workflows/:workflowId/nodes/:nodeId — update node
router.put('/:workflowId/nodes/:nodeId', async (req: any, res: Response) => {
  try {
    const { label, config, positionX, positionY, preserveContext, timeoutSeconds } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (label !== undefined) updateData.label = label;
    if (config !== undefined) updateData.config = config;
    if (positionX !== undefined) updateData.positionX = positionX;
    if (positionY !== undefined) updateData.positionY = positionY;
    if (preserveContext !== undefined) updateData.preserveContext = preserveContext;
    if (timeoutSeconds !== undefined) updateData.timeoutSeconds = timeoutSeconds;

    const [updated] = await db
      .update(workflowNodes)
      .set(updateData)
      .where(and(eq(workflowNodes.id, req.params.nodeId), eq(workflowNodes.workflowId, req.params.workflowId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Node not found' });

    res.json({ node: updated });
  } catch (error: any) {
    console.error('Error updating node:', error.message);
    res.status(500).json({ error: 'Failed to update node' });
  }
});

// DELETE /api/workflows/:workflowId/nodes/:nodeId
router.delete('/:workflowId/nodes/:nodeId', async (req: any, res: Response) => {
  try {
    // Cascade delete handles edges
    const [deleted] = await db
      .delete(workflowNodes)
      .where(and(eq(workflowNodes.id, req.params.nodeId), eq(workflowNodes.workflowId, req.params.workflowId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: 'Node not found' });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting node:', error.message);
    res.status(500).json({ error: 'Failed to delete node' });
  }
});

// ─── Workflow Edges ─────────────────────────────────────────────────

// POST /api/workflows/:id/edges — add edge
router.post('/:id/edges', async (req: any, res: Response) => {
  try {
    const { sourceNodeId, targetNodeId, conditionLabel, conditionValue, sortOrder } = req.body;

    if (!sourceNodeId || !targetNodeId) {
      return res.status(400).json({ error: 'sourceNodeId and targetNodeId are required' });
    }

    const [edge] = await db.insert(workflowEdges).values({
      workflowId: req.params.id,
      sourceNodeId,
      targetNodeId,
      conditionLabel: conditionLabel || null,
      conditionValue: conditionValue || null,
      sortOrder: sortOrder || 0,
    }).returning();

    res.status(201).json({ edge });
  } catch (error: any) {
    console.error('Error adding edge:', error.message);
    res.status(500).json({ error: 'Failed to add edge' });
  }
});

// DELETE /api/workflows/:workflowId/edges/:edgeId
router.delete('/:workflowId/edges/:edgeId', async (req: any, res: Response) => {
  try {
    const [deleted] = await db
      .delete(workflowEdges)
      .where(and(eq(workflowEdges.id, req.params.edgeId), eq(workflowEdges.workflowId, req.params.workflowId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: 'Edge not found' });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting edge:', error.message);
    res.status(500).json({ error: 'Failed to delete edge' });
  }
});

// ─── Workflow Execution ─────────────────────────────────────────────

// POST /api/workflows/:id/execute — start a workflow execution
router.post('/:id/execute', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { context } = req.body;

    const engine = new WorkflowEngine(req.params.id, organizationId);
    const executionId = await engine.start(context || {});

    res.json({ executionId });
  } catch (error: any) {
    console.error('Error executing workflow:', error.message);
    res.status(500).json({ error: error.message || 'Failed to execute workflow' });
  }
});

// POST /api/workflows/executions/:executionId/resume — resume from a node
router.post('/executions/:executionId/resume', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { nodeId, eventData } = req.body;

    if (!nodeId) return res.status(400).json({ error: 'nodeId is required' });

    // Load execution to get workflowId
    const [execution] = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, req.params.executionId))
      .limit(1);

    if (!execution) return res.status(404).json({ error: 'Execution not found' });

    const engine = new WorkflowEngine(execution.workflowId, organizationId);
    await engine.resume(req.params.executionId, nodeId, eventData || {});

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error resuming workflow:', error.message);
    res.status(500).json({ error: error.message || 'Failed to resume workflow' });
  }
});

// GET /api/workflows/:id/executions — list executions for a workflow
router.get('/:id/executions', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const executions = await db
      .select()
      .from(workflowExecutions)
      .where(and(
        eq(workflowExecutions.workflowId, req.params.id),
        eq(workflowExecutions.organizationId, organizationId),
      ))
      .orderBy(desc(workflowExecutions.startedAt))
      .limit(50);

    res.json({ executions });
  } catch (error: any) {
    console.error('Error fetching executions:', error.message);
    res.status(500).json({ error: 'Failed to fetch executions' });
  }
});

// GET /api/workflows/executions/:executionId — get single execution detail
router.get('/executions/:executionId', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const [execution] = await db
      .select()
      .from(workflowExecutions)
      .where(and(
        eq(workflowExecutions.id, req.params.executionId),
        eq(workflowExecutions.organizationId, organizationId),
      ))
      .limit(1);

    if (!execution) return res.status(404).json({ error: 'Execution not found' });

    res.json({ execution });
  } catch (error: any) {
    console.error('Error fetching execution:', error.message);
    res.status(500).json({ error: 'Failed to fetch execution' });
  }
});

// ─── Bulk Save (for canvas) ─────────────────────────────────────────

// PUT /api/workflows/:id/canvas — save entire canvas state (nodes + edges + layout)
router.put('/:id/canvas', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { nodes, edges, canvasData } = req.body;

    // Verify ownership
    const [workflow] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, req.params.id), eq(workflows.organizationId, organizationId)))
      .limit(1);

    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });

    // Delete existing nodes & edges (cascade handles edges from deleted nodes)
    await db.delete(workflowEdges).where(eq(workflowEdges.workflowId, workflow.id));
    await db.delete(workflowNodes).where(eq(workflowNodes.workflowId, workflow.id));

    // Insert new nodes
    const nodeIdMap = new Map<string, string>(); // temp ID -> real ID
    if (nodes && Array.isArray(nodes)) {
      for (const node of nodes) {
        const [created] = await db.insert(workflowNodes).values({
          workflowId: workflow.id,
          nodeType: node.nodeType,
          label: node.label,
          config: node.config || {},
          positionX: node.positionX || 0,
          positionY: node.positionY || 0,
          preserveContext: node.preserveContext || [],
          timeoutSeconds: node.timeoutSeconds || null,
        }).returning();
        nodeIdMap.set(node.id || node.tempId, created.id);
      }
    }

    // Insert new edges with remapped IDs
    if (edges && Array.isArray(edges)) {
      for (const edge of edges) {
        const sourceId = nodeIdMap.get(edge.sourceNodeId) || edge.sourceNodeId;
        const targetId = nodeIdMap.get(edge.targetNodeId) || edge.targetNodeId;

        await db.insert(workflowEdges).values({
          workflowId: workflow.id,
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          conditionLabel: edge.conditionLabel || null,
          conditionValue: edge.conditionValue || null,
          sortOrder: edge.sortOrder || 0,
        });
      }
    }

    // Update canvas data
    if (canvasData) {
      await db.update(workflows)
        .set({ canvasData, updatedAt: new Date() })
        .where(eq(workflows.id, workflow.id));
    }

    res.json({ success: true, nodeIdMap: Object.fromEntries(nodeIdMap) });
  } catch (error: any) {
    console.error('Error saving canvas:', error.message);
    res.status(500).json({ error: 'Failed to save canvas' });
  }
});

export default router;
