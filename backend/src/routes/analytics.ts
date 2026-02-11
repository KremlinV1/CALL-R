import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { calls, agents, campaigns, contacts } from '../db/schema.js';
import { eq, and, gte, lte, sql, desc, count } from 'drizzle-orm';

const router = Router();

// Helper function to parse date range
function getDateRange(period: string) {
  const now = new Date();
  const startDate = new Date();
  
  switch (period) {
    case '24h':
      startDate.setHours(now.getHours() - 24);
      break;
    case '7d':
      startDate.setDate(now.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(now.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(now.getDate() - 90);
      break;
    default:
      startDate.setDate(now.getDate() - 7);
  }
  
  return { startDate, endDate: now };
}

// Get dashboard stats
router.get('/dashboard', async (req: AuthRequest, res: Response) => {
  try {
    const period = (req.query.period as string) || '7d';
    const { startDate, endDate } = getDateRange(period);
    
    const orgId = req.user!.organizationId;
    
    // Get current period stats
    const currentCalls = await db.select({
      totalCalls: sql<number>`cast(count(*) as int)`,
      connectedCalls: sql<number>`cast(sum(case when ${calls.status} = 'completed' then 1 else 0 end) as int)`,
      avgDuration: sql<number>`cast(avg(case when ${calls.durationSeconds} is not null then ${calls.durationSeconds} else 0 end) as int)`,
      totalCost: sql<number>`cast(sum(case when ${calls.costCents} is not null then ${calls.costCents} else 0 end) as int)`,
    })
    .from(calls)
    .where(and(
      eq(calls.organizationId, orgId),
      gte(calls.createdAt, startDate),
      lte(calls.createdAt, endDate)
    ));
    
    // Get previous period for comparison
    const prevStartDate = new Date(startDate);
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    prevStartDate.setDate(prevStartDate.getDate() - daysDiff);
    
    const prevCalls = await db.select({
      totalCalls: sql<number>`cast(count(*) as int)`,
      connectedCalls: sql<number>`cast(sum(case when ${calls.status} = 'completed' then 1 else 0 end) as int)`,
      avgDuration: sql<number>`cast(avg(case when ${calls.durationSeconds} is not null then ${calls.durationSeconds} else 0 end) as int)`,
    })
    .from(calls)
    .where(and(
      eq(calls.organizationId, orgId),
      gte(calls.createdAt, prevStartDate),
      lte(calls.createdAt, startDate)
    ));
    
    // Get active campaigns and agents
    const [activeCampaignsCount] = await db.select({ count: sql<number>`cast(count(*) as int)` })
      .from(campaigns)
      .where(and(
        eq(campaigns.organizationId, orgId),
        eq(campaigns.status, 'running')
      ));
    
    const [activeAgentsCount] = await db.select({ count: sql<number>`cast(count(*) as int)` })
      .from(agents)
      .where(and(
        eq(agents.organizationId, orgId),
        eq(agents.status, 'active')
      ));
    
    const current = currentCalls[0];
    const previous = prevCalls[0];
    
    const totalCallsChange = previous.totalCalls > 0 
      ? ((current.totalCalls - previous.totalCalls) / previous.totalCalls) * 100 
      : 0;
    
    const avgDurationChange = previous.avgDuration > 0 
      ? ((current.avgDuration - previous.avgDuration) / previous.avgDuration) * 100 
      : 0;
    
    const currentSuccessRate = current.totalCalls > 0 ? (current.connectedCalls / current.totalCalls) * 100 : 0;
    const prevSuccessRate = previous.totalCalls > 0 ? (previous.connectedCalls / previous.totalCalls) * 100 : 0;
    const successRateChange = prevSuccessRate > 0 ? currentSuccessRate - prevSuccessRate : 0;
    
    const stats = {
      totalCalls: current.totalCalls || 0,
      totalCallsChange: Math.round(totalCallsChange * 10) / 10,
      avgDurationSeconds: current.avgDuration || 0,
      avgDurationChange: Math.round(avgDurationChange * 10) / 10,
      successRate: Math.round(currentSuccessRate * 10) / 10,
      successRateChange: Math.round(successRateChange * 10) / 10,
      totalCostCents: current.totalCost || 0,
      costPerCall: current.totalCalls > 0 ? Math.round((current.totalCost || 0) / current.totalCalls) : 0,
      activeCampaigns: activeCampaignsCount?.count || 0,
      activeAgents: activeAgentsCount?.count || 0,
    };
    
    res.json({ stats });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// Get call volume over time
router.get('/call-volume', async (req: AuthRequest, res: Response) => {
  try {
    const period = (req.query.period as string) || '7d';
    const { startDate, endDate } = getDateRange(period);
    const orgId = req.user!.organizationId;
    
    // Group by date
    const volumeData = await db.select({
      date: sql<string>`DATE(${calls.createdAt})`,
      calls: sql<number>`cast(count(*) as int)`,
      connected: sql<number>`cast(sum(case when ${calls.status} = 'completed' then 1 else 0 end) as int)`,
      voicemail: sql<number>`cast(sum(case when ${calls.status} = 'no_answer' then 1 else 0 end) as int)`,
      failed: sql<number>`cast(sum(case when ${calls.status} = 'failed' then 1 else 0 end) as int)`,
    })
    .from(calls)
    .where(and(
      eq(calls.organizationId, orgId),
      gte(calls.createdAt, startDate),
      lte(calls.createdAt, endDate)
    ))
    .groupBy(sql`DATE(${calls.createdAt})`)
    .orderBy(sql`DATE(${calls.createdAt})`);
    
    res.json({ data: volumeData });
  } catch (error) {
    console.error('Error fetching call volume:', error);
    res.status(500).json({ error: 'Failed to fetch call volume' });
  }
});

// Get outcome breakdown
router.get('/outcomes', async (req: AuthRequest, res: Response) => {
  try {
    const period = (req.query.period as string) || '7d';
    const { startDate, endDate } = getDateRange(period);
    const orgId = req.user!.organizationId;
    
    const outcomeData = await db.select({
      outcome: calls.outcome,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(calls)
    .where(and(
      eq(calls.organizationId, orgId),
      gte(calls.createdAt, startDate),
      lte(calls.createdAt, endDate),
      sql`${calls.outcome} IS NOT NULL`
    ))
    .groupBy(calls.outcome)
    .orderBy(desc(sql`count(*)`));
    
    const totalOutcomes = outcomeData.reduce((sum, item) => sum + item.count, 0);
    
    const outcomes = outcomeData.map(item => ({
      outcome: item.outcome || 'Unknown',
      count: item.count,
      percentage: totalOutcomes > 0 ? Math.round((item.count / totalOutcomes) * 100) : 0,
    }));
    
    res.json({ outcomes });
  } catch (error) {
    console.error('Error fetching outcomes:', error);
    res.status(500).json({ error: 'Failed to fetch outcomes' });
  }
});

// Get agent performance
router.get('/agents', async (req: AuthRequest, res: Response) => {
  try {
    const period = (req.query.period as string) || '7d';
    const { startDate, endDate } = getDateRange(period);
    const orgId = req.user!.organizationId;
    
    const agentStats = await db.select({
      id: agents.id,
      name: agents.name,
      calls: sql<number>`cast(count(${calls.id}) as int)`,
      successRate: sql<number>`cast(round(
        sum(case when ${calls.status} = 'completed' then 1 else 0 end)::numeric / 
        nullif(count(${calls.id}), 0) * 100, 2
      ) as numeric)`,
      avgDuration: sql<number>`cast(avg(case when ${calls.durationSeconds} is not null then ${calls.durationSeconds} else 0 end) as int)`,
      revenue: sql<number>`cast(sum(case when ${calls.costCents} is not null then ${calls.costCents} else 0 end) as int)`,
    })
    .from(agents)
    .leftJoin(calls, and(
      eq(calls.agentId, agents.id),
      gte(calls.createdAt, startDate),
      lte(calls.createdAt, endDate)
    ))
    .where(eq(agents.organizationId, orgId))
    .groupBy(agents.id, agents.name)
    .orderBy(desc(sql`count(${calls.id})`));
    
    const agentPerformance = agentStats.map(agent => ({
      id: agent.id,
      name: agent.name,
      calls: agent.calls || 0,
      successRate: Number(agent.successRate) || 0,
      avgDuration: agent.avgDuration || 0,
      revenue: agent.revenue || 0,
    }));
    
    res.json({ agents: agentPerformance });
  } catch (error) {
    console.error('Error fetching agent performance:', error);
    res.status(500).json({ error: 'Failed to fetch agent performance' });
  }
});

// Get best call times
router.get('/best-times', async (req: AuthRequest, res: Response) => {
  try {
    // Mock best times data
    const times = [
      { hour: 10, day: 'weekday', successRate: 92, calls: 456 },
      { hour: 14, day: 'weekday', successRate: 88, calls: 398 },
      { hour: 11, day: 'weekday', successRate: 85, calls: 367 },
      { hour: 15, day: 'weekday', successRate: 82, calls: 312 },
      { hour: 9, day: 'weekday', successRate: 78, calls: 289 },
    ];
    
    res.json({ times });
  } catch (error) {
    console.error('Error fetching best times:', error);
    res.status(500).json({ error: 'Failed to fetch best times' });
  }
});

// Get sentiment analysis
router.get('/sentiment', async (req: AuthRequest, res: Response) => {
  try {
    // Mock sentiment data
    const sentiment = {
      positive: 72,
      neutral: 20,
      negative: 8,
      trend: [
        { date: '2024-12-04', positive: 68, neutral: 22, negative: 10 },
        { date: '2024-12-05', positive: 70, neutral: 21, negative: 9 },
        { date: '2024-12-06', positive: 69, neutral: 22, negative: 9 },
        { date: '2024-12-07', positive: 71, neutral: 20, negative: 9 },
        { date: '2024-12-08', positive: 72, neutral: 20, negative: 8 },
        { date: '2024-12-09', positive: 73, neutral: 19, negative: 8 },
        { date: '2024-12-10', positive: 72, neutral: 20, negative: 8 },
      ],
    };
    
    res.json({ sentiment });
  } catch (error) {
    console.error('Error fetching sentiment:', error);
    res.status(500).json({ error: 'Failed to fetch sentiment' });
  }
});

// Export report
router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const { format = 'csv', startDate, endDate } = req.query;
    
    // In production, generate actual report
    res.json({
      message: 'Report generation started',
      downloadUrl: '/api/analytics/export/download/report-123.csv',
    });
  } catch (error) {
    console.error('Error exporting report:', error);
    res.status(500).json({ error: 'Failed to export report' });
  }
});

export default router;
