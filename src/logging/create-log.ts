import { type Log, createLog as newLog } from './logger';

type LogInput = Omit<Log, 'appName'>;

export const createLogger = (appName: string) => {
  return {
    info: (input: LogInput) => newLog({ ...input, appName, type: 'info' }),
    warn: (input: LogInput) => newLog({ ...input, appName, type: 'warn' }),
    error: (input: LogInput) => newLog({ ...input, appName, type: 'error' }),
  };
};
