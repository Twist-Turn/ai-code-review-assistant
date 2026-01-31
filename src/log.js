function info(msg) { console.log(msg); }
function warn(msg) { console.log(`::warning::${msg}`); }
function error(msg) { console.log(`::error::${msg}`); }

function fail(msg, err) {
  const details = err && err.stack ? `\n${err.stack}` : "";
  error(`${msg}${details}`);
  process.exitCode = 1;
}

module.exports = { info, warn, error, fail };
