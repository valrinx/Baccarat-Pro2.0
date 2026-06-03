export function createLogger(scope = 'app') {
  function format(level, message, meta) {
    return {
      scope,
      level,
      message,
      meta: meta ?? null,
      timestamp: new Date().toISOString()
    };
  }

  function log(level, message, meta) {
    const payload = format(level, message, meta);
    if (level === 'error') console.error(`[${scope}] ${message}`, meta ?? '');
    else if (level === 'warn') console.warn(`[${scope}] ${message}`, meta ?? '');
    else console.log(`[${scope}] ${message}`, meta ?? '');
    return payload;
  }

  return {
    info: (message, meta) => log('info', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    error: (message, meta) => log('error', message, meta)
  };
}
