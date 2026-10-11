const { spawn } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function run(name, cwd, args, color) {
  const p = spawn('npm', args, { cwd, shell: true });
  p.stdout.on('data', d => process.stdout.write(color + '[' + name + '] ' + String(d)));
  p.stderr.on('data', d => process.stderr.write(color + '[' + name + '] ' + String(d)));
  p.on('exit', c => console.log('[' + name + '] exited with ' + c));
  return p;
}

console.log('Starting backend + frontend...');
run('backend', path.join(ROOT, 'backend'), ['start'], '\x1b[36m');
setTimeout(() => run('frontend', path.join(ROOT, 'frontend'), ['run', 'dev'], '\x1b[35m'), 2500);
