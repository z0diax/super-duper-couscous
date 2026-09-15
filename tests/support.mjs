import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
export const testPassword = 'Integration-Password-2026!';
export async function startFixture(port = 18765) {
  const name = `hrmdo_test_${Date.now()}_${Math.random().toString(16).slice(2,8)}`;
  const uploadDirectory = path.resolve('storage', name);
  const env = { ...process.env, HRMDO_DATABASE: name, HRMDO_ADMIN_EMAIL: 'admin@example.test', HRMDO_ADMIN_PASSWORD: testPassword, HRMDO_UPLOAD_DIRECTORY: uploadDirectory };
  const php = process.env.PHP_BINARY || 'php';
  const run = (args, overrides = {}) => {
    const r = spawnSync(php, args, { env: { ...env, ...overrides }, encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 0, r.stderr || r.stdout || r.error?.message); return r.stdout;
  };
  run(['scripts/install.php']);
  const server = spawn(php, ['-S', `127.0.0.1:${port}`, 'tests/router.php'], { env, stdio: ['ignore','pipe','pipe'], windowsHide: true });
  let logs = ''; server.stderr.on('data', chunk => { logs += chunk; });
  const base = `http://127.0.0.1:${port}/hrmdorms`;
  for (let n=0;n<100;n++) { try { if ((await fetch(`${base}/api/auth.php`)).ok) break; } catch {} if(n===99) throw new Error(logs); await new Promise(r=>setTimeout(r,50)); }
  return { env, base, run, server, logs:()=>logs, async stop() {
    server.kill(); if (server.exitCode===null) await once(server,'exit');
    run(['-r', `require 'api/db.php'; $name=app_config()['database']; if (!preg_match('/^hrmdo_test_[0-9]+_[a-f0-9]+$/',$name)) exit(2); database(false)->exec('DROP DATABASE IF EXISTS \`'.$name.'\`');`]);
    const root=path.resolve('storage')+path.sep;
    assert(uploadDirectory.startsWith(root) && path.basename(uploadDirectory)===name); fs.rmSync(uploadDirectory,{recursive:true,force:true});
  }};
}
export class Client {
  constructor(base) { this.base=base; this.cookie=''; this.csrf=''; this.revision=-1; this.state=null; }
  async request(file, method='GET', body, expected=200, headers={}) {
    const r=await fetch(`${this.base}/api/${file}`,{method,headers:{Cookie:this.cookie,...(body && !(body instanceof FormData)?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-CSRF-Token':this.csrf}:{}),...headers},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
    const cookie=r.headers.getSetCookie(); if(cookie.length) this.cookie=cookie.map(c=>c.split(';')[0]).join('; ');
    const data=await r.json(); assert.equal(r.status,expected,`${method} ${file}: ${JSON.stringify(data)}`);
    if(data.csrfToken) this.csrf=data.csrfToken; if(data.state) {this.state=data.state;this.revision=data.revision;} return data;
  }
  async login(email='admin@example.test') { await this.request('auth.php'); await this.request('auth.php','POST',{email,password:testPassword}); await this.refresh(); return this; }
  refresh() { return this.request('state.php'); }
  async action(action,args,expected=200,{refresh=true}={}) { if(refresh) await this.refresh(); return this.request('state.php','POST',{action,args,revision:this.revision},expected); }
}
