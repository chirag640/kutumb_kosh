/**
 * Context-aware logging utility that silences debug logs in production.
 */
export const createLogger = (context: string) => {
  return {
    debug(msg: string, ...args: any[]) {
      if (__DEV__) {
        console.debug(`[DEBUG] [${context}] ${msg}`, ...args);
      }
    },
    info(msg: string, ...args: any[]) {
      if (__DEV__) {
        console.log(`[INFO] [${context}] ${msg}`, ...args);
      }
    },
    warn(msg: string, ...args: any[]) {
      console.warn(`[WARN] [${context}] ${msg}`, ...args);
    },
    error(msg: string, ...args: any[]) {
      console.error(`[ERROR] [${context}] ${msg}`, ...args);
    },
  };
};
