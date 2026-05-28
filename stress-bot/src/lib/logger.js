// Tiny console logger with consistent formatting.

const ts = () => new Date().toISOString().slice(11, 23);

export const log = {
  info(msg) {
    console.log(`[${ts()}] ${msg}`);
  },
  pass(msg) {
    console.log(`[${ts()}] PASS  ${msg}`);
  },
  fail(msg) {
    console.log(`[${ts()}] FAIL  ${msg}`);
  },
  warn(msg) {
    console.log(`[${ts()}] WARN  ${msg}`);
  },
  section(msg) {
    console.log(`\n=== ${msg} ===`);
  },
};
