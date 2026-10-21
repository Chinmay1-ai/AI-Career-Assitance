import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import geminiRouter from './routes/gemini.js';
import healthRouter from './routes/health.js';
import interviewsRouter from './routes/interviews.js';
import resumesRouter from './routes/resumes.js';

const app = express();

app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  }),
);
app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/gemini', geminiRouter);
app.use('/api/interviews', interviewsRouter);
app.use('/api/resumes', resumesRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;
