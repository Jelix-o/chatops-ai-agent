export function logInfo(message: string, meta?: Record<string, unknown>): void {
  console.log(formatLog("INFO", message, meta));
}

export function logWarn(message: string, meta?: Record<string, unknown>): void {
  console.warn(formatLog("WARN", message, meta));
}

export function logError(message: string, meta?: Record<string, unknown>): void {
  console.error(formatLog("ERROR", message, meta));
}

function formatLog(level: string, message: string, meta?: Record<string, unknown>): string {
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${new Date().toISOString()}] [${level}] ${message}${suffix}`;
}

