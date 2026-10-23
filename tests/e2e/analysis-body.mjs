import assert from 'node:assert/strict';

/** Independent CDP reader: never treat preliminary readings as the finished report. */
export function analysisBody(raw) {
  const text = raw.base64Encoded ? Buffer.from(raw.body, 'base64').toString('utf8') : raw.body;
  let whole;
  try { whole = JSON.parse(text); } catch { /* NDJSON is validated below. */ }
  if (whole && typeof whole === 'object' && !('type' in whole)) return whole;
  const events = text.trim().split(/\r?\n/u).map(line => JSON.parse(line));
  assert(events.length > 0 && events.every(event => ['readings', 'result', 'error'].includes(event?.type)), 'Unknown analysis stream event');
  const terminal = events.filter(event => event.type !== 'readings');
  assert.equal(terminal.length, 1, 'Analysis stream must have exactly one final event');
  // Compare event identity without formatting two entire reports on rejection.
  assert(events.at(-1) === terminal[0], 'Analysis final event must be last');
  assert.equal(terminal[0].type, 'result', `Analysis stream failed: ${terminal[0].status ?? ''} ${terminal[0].body?.error?.message ?? ''}`);
  assert(terminal[0].report && typeof terminal[0].report === 'object', 'Final report is missing');
  return terminal[0].report;
}
