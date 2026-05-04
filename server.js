require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createChatRouter } = require('./routes/chat');
const { createScenarioRouter } = require('./routes/scenarios');
const { createSessionsRouter } = require('./routes/sessions');

function createApp({ chatService, scenarioGenerator, gradingService } = {}) {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/', rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/chat', createChatRouter(chatService));
  app.use('/api', createScenarioRouter(scenarioGenerator));
  app.use('/api/sessions', createSessionsRouter({ gradingService }));
  return app;
}

function start() {
  const openai = require('./config/openai');
  const { makeChatService } = require('./services/chatService');
  const { makeScenarioGenerator } = require('./services/scenarioGenerator');
  const { makeGradingService } = require('./services/gradingService');
  const { makeSummarizer } = require('./services/conversationSummarizer');
  const summarizer = makeSummarizer({ openai });
  const chatService = makeChatService({ openai, summarizer });
  const scenarioGenerator = makeScenarioGenerator({ openai });
  const gradingService = makeGradingService({ openai });
  const app = createApp({ chatService, scenarioGenerator, gradingService });
  const port = Number(process.env.PORT) || 3001;
  app.listen(port, () => console.log(`[server] listening on :${port}`));
}

if (require.main === module) start();

module.exports = { createApp, start };
