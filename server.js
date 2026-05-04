require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createChatRouter } = require('./routes/chat');
const { createScenarioRouter } = require('./routes/scenarios');
const { createSessionsRouter } = require('./routes/sessions');
const { killSwitch, makeTokenMeter } = require('./services/abuseGuards');

function createApp({ chatService, scenarioGenerator, gradingService, tokenGuard } = {}) {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/', rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/', killSwitch);
  app.use('/api/chat', createChatRouter(chatService, tokenGuard));
  app.use('/api', createScenarioRouter(scenarioGenerator, tokenGuard));
  app.use('/api/sessions', createSessionsRouter({ gradingService, tokenGuard }));
  return app;
}

function start() {
  const openai = require('./config/openai');
  const { makeChatService } = require('./services/chatService');
  const { makeScenarioGenerator } = require('./services/scenarioGenerator');
  const { makeGradingService } = require('./services/gradingService');
  const { makeSummarizer } = require('./services/conversationSummarizer');
  const tokenMeter = makeTokenMeter();
  const summarizer = makeSummarizer({ openai });
  const chatService = makeChatService({ openai, summarizer, tokenMeter });
  const scenarioGenerator = makeScenarioGenerator({ openai, tokenMeter });
  const gradingService = makeGradingService({ openai, tokenMeter });
  const app = createApp({ chatService, scenarioGenerator, gradingService, tokenGuard: tokenMeter.guardMiddleware });
  const port = Number(process.env.PORT) || 3001;
  app.listen(port, () => console.log(`[server] listening on :${port}`));
}

if (require.main === module) start();

module.exports = { createApp, start };
