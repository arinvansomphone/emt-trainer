require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createChatRouter } = require('./routes/chat');
const { createScenarioRouter } = require('./routes/scenarios');
const { createSessionsRouter } = require('./routes/sessions');
const { createTeacherRouter } = require('./routes/teacher');
const { makeTeacherAuth } = require('./services/teacherAuth');
const { killSwitch, makeTokenMeter } = require('./services/abuseGuards');

function createApp({ chatService, scenarioGenerator, gradingService, tokenGuard, teacherAuth = makeTeacherAuth() } = {}) {
  const app = express();
  // Render terminates TLS at its proxy; trust one hop so express-rate-limit
  // and req.ip read the real client IP from X-Forwarded-For.
  app.set('trust proxy', 1);
  // Google Identity Services needs its popup, script, iframe and style origins.
  const cspDefaults = helmet.contentSecurityPolicy.getDefaultDirectives();
  const google = 'https://accounts.google.com';
  app.use(helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      directives: {
        ...cspDefaults,
        'script-src': [...cspDefaults['script-src'], google],
        'frame-src': ["'self'", google],
        'connect-src': [...(cspDefaults['connect-src'] || ["'self'"]), google],
        'style-src': [...cspDefaults['style-src'], `${google}/gsi/style`],
      },
    },
  }));
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  // Only POSTs hit OpenAI. Classrooms share one NAT IP, so keep this generous;
  // the daily token meter is the real spend cap.
  app.use('/api/', rateLimit({
    windowMs: 60_000,
    limit: Number(process.env.RATE_LIMIT_PER_MIN) || 300,
    skip: (req) => req.method === 'GET',
    message: { error: 'Too many requests from your network. Please wait a minute and try again.' },
    standardHeaders: true,
    legacyHeaders: false,
  }));
  app.use('/api/', killSwitch);
  // Built per app so each instance (and test) has its own counters.
  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    message: { error: 'Too many sign-in attempts. Please wait a minute and try again.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(['/api/teacher/login', '/api/teacher/signup', '/api/teacher/google'], authLimiter);
  app.use('/api/teacher', createTeacherRouter({ teacherAuth }));
  app.use('/api/chat', createChatRouter(chatService, tokenGuard));
  app.use('/api', createScenarioRouter(scenarioGenerator, tokenGuard));
  app.use('/api/sessions', createSessionsRouter({ gradingService, tokenGuard }));

  const distDir = path.join(__dirname, 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }
  app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

  return app;
}

function start() {
  const openai = require('./config/openai');
  const { makeChatService } = require('./services/chatService');
  const { makeScenarioGenerator } = require('./services/scenarioGenerator');
  const { makeGradingService } = require('./services/gradingService');
  const { makeSummarizer } = require('./services/conversationSummarizer');
  const tokenMeter = makeTokenMeter();
  const summarizer = makeSummarizer({ openai, tokenMeter });
  const chatService = makeChatService({ openai, summarizer, tokenMeter });
  const scenarioGenerator = makeScenarioGenerator({ openai, tokenMeter });
  const gradingService = makeGradingService({ openai, tokenMeter });
  const app = createApp({ chatService, scenarioGenerator, gradingService, tokenGuard: tokenMeter.guardMiddleware });
  const port = Number(process.env.PORT) || 3001;
  app.listen(port, () => console.log(`[server] listening on :${port}`));
}

if (require.main === module) start();

module.exports = { createApp, start };
