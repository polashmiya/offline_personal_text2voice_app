/**
 * Structured development logging. Never pass user text, transcripts or
 * audio data here — log ids, states, timings and error categories only.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, string | number | boolean | null | undefined>;

function emit(level: Level, event: string, fields?: Fields) {
  if (!__DEV__ && level === 'debug') {
    return;
  }
  const line = { t: new Date().toISOString(), level, event, ...fields };
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(`[VoiceStudio] ${JSON.stringify(line)}`);
}

export const logger = {
  debug: (event: string, fields?: Fields) => emit('debug', event, fields),
  info: (event: string, fields?: Fields) => emit('info', event, fields),
  warn: (event: string, fields?: Fields) => emit('warn', event, fields),
  error: (event: string, fields?: Fields) => emit('error', event, fields),
};
