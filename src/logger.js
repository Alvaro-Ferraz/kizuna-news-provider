'use strict';

function writeLog(level, event, fields) {
  const entry = JSON.stringify({
    level,
    event,
    ...fields,
  });

  if (level === 'error') console.error(entry);
  else console.info(entry);
}

function createLogger() {
  return {
    info(event, fields = {}) {
      writeLog('info', event, fields);
    },
    error(event, fields = {}) {
      writeLog('error', event, fields);
    },
  };
}

module.exports = { createLogger, ...createLogger() };
