import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { canRoleAccessModule } from './src/services/businessLogic';
import { createInitialSeedDatabase } from './src/data/seedData';
import { UserRole } from './src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));

  let serverDb = createInitialSeedDatabase();

  // Middleware kiểm tra phân quyền tại Backend (RBAC)
  app.get('/api/rbac-check', (req, res) => {
    const role = (req.headers['x-actor-role'] as UserRole) || 'STUDENT';
    const moduleId = String(req.query.module || 'dashboard');
    const allowed = canRoleAccessModule(role, moduleId);
    if (!allowed) {
      res.status(403).json({
        allowed: false,
        message: 'Backend từ chối quyền truy cập vào phân hệ này.',
      });
      return;
    }
    res.json({ allowed: true, role, moduleId });
  });

  // API dành cho tài khoản Học viên: không gửi đáp án đúng (correctAnswer) trước khi giáo viên công bố điểm (scoresPublished === true)
  app.get('/api/student-assignments/:studentCode', (req, res) => {
    const role = (req.headers['x-actor-role'] as UserRole) || 'STUDENT';
    const requesterStudentCode = String(req.headers['x-student-code'] || '');
    const targetStudentCode = req.params.studentCode;

    // Không cho học viên truy cập dữ liệu của học viên khác bằng cách đổi URL
    if (role === 'STUDENT' && requesterStudentCode && requesterStudentCode !== targetStudentCode) {
      res.status(403).json({
        error: 'Học viên không được phép truy cập dữ liệu của học viên khác.',
      });
      return;
    }

    const sanitizedAssignments = serverDb.assignments.map((asg) => ({
      ...asg,
      questions: asg.questions.map((q) => ({
        ...q,
        correctAnswer: asg.scoresPublished ? q.correctAnswer : undefined,
      })),
    }));

    res.json({ assignments: sanitizedAssignments });
  });

  app.post('/api/sync-state', (req, res) => {
    res.json({
      ok: true,
      mode: process.env.DATABASE_URL ? 'MULTI_USER_DB' : 'DEMO_LOCAL_STORAGE',
      serverTime: new Date().toISOString(),
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`APLUS 2 Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
