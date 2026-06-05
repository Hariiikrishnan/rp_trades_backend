const morgan = require('morgan');
const logger = require('../utils/logger');

// Stream morgan output through winston
const stream = {
  write: (message) => logger.http(message.trim()),
};

const requestLogger = morgan(
  process.env.NODE_ENV === 'production' ? 'combined' : 'dev',
  { stream }
);

module.exports = requestLogger;
