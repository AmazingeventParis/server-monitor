const http = require('http');
const fs = require('fs');
const { execSync } = require('child_process');

const SECRET = process.env.MONITOR_SECRET || 'swipego-monitor-2026';

function readRam() {
  try {
    const m = fs.readFileSync('/proc/meminfo', 'utf-8');
    const total = parseInt((m.match(/MemTotal:\s+(\d+)/) || [])[1] || 0);
    const avail = parseInt((m.match(/MemAvailable:\s+(\d+)/) || [])[1] || 0);
    const tGB = total / 1024 / 1024;
    const uGB = (total - avail) / 1024 / 1024;
    return { total_gb: Math.round(tGB * 10) / 10, used_gb: Math.round(uGB * 10) / 10, percent: Math.round((uGB / tGB) * 100) };
  } catch (e) { return { total_gb: 0, used_gb: 0, percent: 0 }; }
}

function readCpu() {
  const stat = fs.readFileSync('/proc/stat', 'utf-8');
  const p = stat.split('\n')[0].replace(/^cpu\s+/, '').split(/\s+/).map(Number);
  const idle = p[3] + (p[4] || 0);
  return { idle, total: p.reduce((a, b) => a + b, 0) };
}

function readDisk() {
  try {
    const df = execSync('df -k 2>/dev/null', { encoding: 'utf-8' });
    const lines = df.trim().split('\n').slice(1);
    let best = null;
    for (const l of lines) {
      const c = l.trim().split(/\s+/);
      if (c.length < 5 || !c[0].startsWith('/dev/')) continue;
      const t = parseInt(c[1]), u = parseInt(c[2]);
      if (!best || t > best.t) best = { t, u };
    }
    if (best) return { total_gb: Math.round(best.t/1024/1024*10)/10, used_gb: Math.round(best.u/1024/1024*10)/10, percent: Math.round(best.u/best.t*100) };
  } catch(e) {}
  return { total_gb: 0, used_gb: 0, percent: 0 };
}

let prevCpu = readCpu();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/stats') { res.writeHead(404); res.end('Not found'); return; }
  if (url.searchParams.get('secret') !== SECRET) { res.writeHead(403); res.end('Forbidden'); return; }

  const cur = readCpu();
  const idleD = cur.idle - prevCpu.idle;
  const totalD = cur.total - prevCpu.total;
  const cpuPct = totalD > 0 ? Math.round((1 - idleD / totalD) * 100) : 0;
  prevCpu = cur;

  const data = { cpu: { percent: cpuPct }, ram: readRam(), disk: readDisk(), timestamp: Date.now() };
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
});

server.listen(3000, () => console.log('Monitor running on :3000'));
