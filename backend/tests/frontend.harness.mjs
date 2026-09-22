// Arnés para probar la lógica de la web SIN navegador: el JavaScript de public/index.html se ejecuta
// en un contexto de Node con un DOM de mentira (cualquier elemento acepta cualquier propiedad) y un
// fetch simulado por el guion de cada prueba. Sirve para verificar los flujos (recuperar el trabajo,
// reanudar, 401, terminar trabajo); NO reemplaza probar en un navegador real ni valida el aspecto.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'index.html'), 'utf-8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);

function makeEl(id='') {
  const store = { style:{}, dataset:{}, value:'', textContent:'', innerHTML:'', disabled:false, children:[], id, className:'' };
  const cls = new Set();
  store.classList = { add:(...a)=>a.forEach(x=>cls.add(x)), remove:(...a)=>a.forEach(x=>cls.delete(x)), toggle:(c,f)=>{ (f===undefined? !cls.has(c) : f) ? cls.add(c):cls.delete(c); }, contains:c=>cls.has(c) };
  if (id==='login-overlay') store.style.display='flex';
  return new Proxy(store, { get(t,k){ if (k in t) return t[k]; if (typeof k==='symbol') return undefined;
      if (k==='getAttribute') return ()=>''; if (k==='closest'||k==='querySelector') return ()=>makeEl(); if (k==='querySelectorAll'||k==='getElementsByTagName') return ()=>[];
      return (..._a)=>makeEl(); }, set(t,k,v){ t[k]=v; return true; } });
}
const els = {};
const document = { getElementById:(id)=> els[id] || (els[id]=makeEl(id)), querySelector:(s)=>makeEl(s), querySelectorAll:()=>[], createElement:()=>makeEl(), body:makeEl('body'), documentElement:makeEl('html'), addEventListener(){}, getElementsByClassName:()=>[] };

export function boot(routes) {
  const calls = [];
  const fetch = async (url, opts={}) => {
    const method = (opts.method||'GET').toUpperCase();
    calls.push(method+' '+url);
    const r = routes(method, url, opts.body ? JSON.parse(opts.body) : null);
    const status = r?.status ?? 200;
    return { ok: status<400, status, json: async()=> (r && 'body' in r ? r.body : r) ?? {} };
  };
  const timers = [];
  const ctx = vm.createContext({ document, fetch, console, window:{ isSecureContext:true, PublicKeyCredential:undefined, addEventListener(){}, matchMedia:()=>({matches:false,addEventListener(){}}) },
    navigator:{ clipboard:{writeText: async()=>{}} }, setTimeout:(f,ms)=>{ timers.push({f,ms}); return timers.length; }, clearTimeout:()=>{}, setInterval:()=>1, clearInterval:()=>{}, requestAnimationFrame:()=>{}, Date, JSON, Math, Promise, Array, Object, String, Number, Set, Map, URL, location:{reload(){}}, localStorage:{getItem(){return null},setItem(){}}, jspdf:{}, alert(){}, confirm(){return true}, prompt(){return ''}, Intl, encodeURIComponent, decodeURIComponent, parseInt, parseFloat, isNaN, Error, RegExp, structuredClone });
  ctx.window.document = document; ctx.globalThis = ctx;
  scripts.forEach((s,i)=>{ try { vm.runInContext(s, ctx, {filename:'inline'+i}); } catch(e) { throw new Error('script '+i+': '+e.message); } });
  return { ctx, calls, timers, run:(code)=>vm.runInContext(code, ctx), els };
}
