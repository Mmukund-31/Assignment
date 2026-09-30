const express = require('express');
const taskRoutes = require('./routes/tasks');
const { version } = require('../package.json');

const app = express();

app.use(express.json());

// Landing response so opening the bare deployment URL in a browser isn't a 404.
app.get('/', (req, res) => {
  res.json({
    name: 'Task API',
    description: 'Task manager REST API (in-memory store)',
    version,
    status: 'ok',
    documentation: 'https://github.com/Mmukund-31/Assignment#readme',
    health: '/health',
    tasks: '/tasks',
    stats: '/tasks/stats',
    endpoints: [
      'GET /health',
      'GET /tasks',
      'GET /tasks/stats',
      'POST /tasks',
      'PUT /tasks/:id',
      'DELETE /tasks/:id',
      'PATCH /tasks/:id/complete',
      'PATCH /tasks/:id/assign',
    ],
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/tasks', taskRoutes);

// Errors raised by middleware for bad client input (e.g. malformed JSON from
// express.json) carry a 4xx `status`; those are client errors, not 500s (BUGS.md #5).
app.use((err, req, res, next) => {
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: 'Invalid request body' });
  }

  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Task API running on port ${PORT}`);
  });
}

module.exports = app;
