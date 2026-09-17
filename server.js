#!/usr/bin/env node
/**
 * 微信读书管理平台 —— 后端/同步服务（零依赖，纯 Node 内置模块）
 *
 * 功能：
 *  1. 静态托管本目录下的 index.html（直接当平台用）。
 *  2. 提供 /api/db 同步接口：
 *       GET  /api/db        -> { rev: <版本号>, db: <全量数据> | null }
 *       POST /api/db        -> body { db }，整体覆盖保存，rev+1，返回 { ok, rev }
 *     （采用 last-write-wins，适合小团队协作；同时多人编辑以最后保存者为准）
 *  3. 共享数据持久化在 server_db.json（与 index.html 同目录）。
 *
 * 运行： node server.js   （可用 PORT=8080 node server.js 指定端口）
 * 访问： 本人 http://localhost:<端口> ；同网络同事 http://<你的局域网IP>:<端口>
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(ROOT, 'server_db.json');

// 启动时载入已有共享数据
let state = { rev: 0, db: null };
try {
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  const j = JSON.parse(raw);
  if (j && typeof j === 'object') {
    state.rev = typeof j.rev === 'number' ? j.rev : 0;
    state.db = j.db || null;
  }
} catch (e) { /* 首次运行无文件，忽略 */ }

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // 允许跨域（方便以 file:// 或不同端口调试；同目录托管时同源亦可）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // ---- 同步接口 ----
  if (req.method === 'GET' && req.url.split('?')[0] === '/api/db') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(state));
  }
  if (req.method === 'POST' && req.url.split('?')[0] === '/api/db') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data && data.db) {
          state.db = data.db;
          state.rev = state.rev + 1;
          fs.writeFileSync(DB_FILE, JSON.stringify(state));
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, rev: state.rev }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
      }
    });
    return;
  }

  // ---- 静态文件托管 ----
  let urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(ROOT, safe);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('平台同步服务已启动');
  console.log('  本人访问 : http://localhost:' + PORT);
  console.log('  共享数据 : ' + DB_FILE);
  console.log('  同事访问 : http://<你的局域网IP>:' + PORT + ' （需同一网络，且本机防火墙放行该端口）');
});
