// 结束 headless 浏览器，并把历次残留一起扫干净。
// Windows 上只 kill 主进程不会级联子进程，一次 e2e 能攒下几百个进程和几 GB 临时目录；
// 这些实例的 user-data-dir 都在 %TEMP%\agi-*，按这个前缀扫最可靠。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 用 String.raw：普通字符串里的 '\T' / '\a' 会被 JS 吃掉反斜杠，变成 'Tempagi-' 就永远匹配不上
const SWEEP = String.raw`
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like '*\Temp\agi-*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-ChildItem -Path (Join-Path $env:TEMP 'agi-*') -Directory -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
`;

export function sweepBrowsers() {
  try {
    spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', SWEEP], { stdio: 'ignore' });
  } catch { /* 忽略 */ }
}

export async function killBrowser(browser, profileDir, send) {
  if (send) {
    // Browser.close 会直接掐掉连接，等不到响应，必须带超时兜底
    try { await Promise.race([send('Browser.close'), sleep(1000)]); } catch { /* 连接可能已断 */ }
  }
  if (browser && browser.pid) {
    try { process.kill(browser.pid); } catch { /* 已经退了 */ }
  }
  // 进程退出有延迟，扫几轮才能连目录一起清掉
  for (let i = 0; i < 3; i++) {
    await sleep(700);
    sweepBrowsers();
    if (profileDir) {
      try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch { /* 下一轮再试 */ }
    }
  }
}
