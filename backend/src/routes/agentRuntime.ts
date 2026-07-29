import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { spawn, exec, ChildProcess } from 'child_process';
import path from 'path';

const router = Router();

let agentProcess: ChildProcess | null = null;
let agentPid: number | null = null;
const recentLogs: string[] = [];
const MAX_LOG_LINES = 50;

const AGENTS_DIR = path.resolve(process.cwd(), '..', 'agents');

function pushLog(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;
  recentLogs.push(trimmed);
  if (recentLogs.length > MAX_LOG_LINES) recentLogs.shift();
}

function findAgentPid(): Promise<number | null> {
  return new Promise((resolve) => {
    exec('pgrep -f "agent.py start"', (err, stdout) => {
      if (err || !stdout.trim()) return resolve(null);
      const pid = parseInt(stdout.trim().split('\n')[0], 10);
      resolve(isNaN(pid) ? null : pid);
    });
  });
}

router.get('/status', async (_req: AuthRequest, res: Response) => {
  const pid = await findAgentPid();
  res.json({
    running: pid !== null,
    pid,
    logs: recentLogs,
  });
});

router.post('/start', async (req: AuthRequest, res: Response) => {
  const existingPid = await findAgentPid();
  if (existingPid) {
    return res.json({ started: false, alreadyRunning: true, pid: existingPid });
  }

  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

  agentProcess = spawn(pythonCmd, ['agent.py', 'start'], {
    cwd: AGENTS_DIR,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  agentProcess.stdout?.on('data', (data: Buffer) => {
    data.toString().split('\n').forEach(pushLog);
  });
  agentProcess.stderr?.on('data', (data: Buffer) => {
    data.toString().split('\n').forEach(pushLog);
  });

  agentProcess.on('exit', (code) => {
    pushLog(`Agent process exited with code ${code}`);
    agentProcess = null;
    agentPid = null;
  });

  // Unref so the backend can exit without killing the agent
  agentProcess.unref();
  agentPid = agentProcess.pid || null;

  pushLog(`Agent process started (pid ${agentPid})`);
  res.json({ started: true, pid: agentPid });
});

router.post('/stop', async (_req: AuthRequest, res: Response) => {
  const pid = await findAgentPid();
  if (!pid) {
    return res.json({ stopped: false, message: 'Agent is not running' });
  }

  exec(`pkill -f "agent.py start"`, (err) => {
    if (err) {
      res.status(500).json({ stopped: false, error: err.message });
    } else {
      pushLog(`Agent process stopped (pid ${pid})`);
      agentProcess = null;
      agentPid = null;
      res.json({ stopped: true, pid });
    }
  });
});

export default router;
