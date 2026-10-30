// Computes WCAG contrast for every visible text element in the landing, board, lane and drawer states.
import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await (await b.newContext({ viewport:{width:1440,height:900} })).newPage();
const audit = () => p.evaluate(() => {
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if(!m) return null; const v=m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return {r:v[0],g:v[1],b:v[2],a:v[3]===undefined?1:v[3]}; };
  const lin = (c)=>{c/=255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)};
  const L=(c)=>.2126*lin(c.r)+.7152*lin(c.g)+.0722*lin(c.b);
  const over=(top,bot)=>({r:top.r*top.a+bot.r*(1-top.a),g:top.g*top.a+bot.g*(1-top.a),b:top.b*top.a+bot.b*(1-top.a),a:1});
  const bgOf = (el) => { const chain=[]; for(let e=el;e;e=e.parentElement){const c=parse(getComputedStyle(e).backgroundColor); if(c&&c.a>0){chain.push(c); if(c.a>=1)break;}} let base={r:23,g:23,b:33,a:1}; for(const c of chain.reverse()) base=over(c,base); return base; };
  const out=[]; const seen=new Set();
  for (const el of document.querySelectorAll("body *")) {
    const t=[...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent.trim()).join(" ");
    if(!t) continue; const cs=getComputedStyle(el); if(cs.visibility==="hidden"||cs.display==="none"||+cs.opacity===0) continue;
    const r=el.getBoundingClientRect(); if(r.width<2||r.height<2) continue;
    let fg=parse(cs.color); if(!fg) continue; const bg=bgOf(el); fg=over(fg,bg);
    const l1=L(fg),l2=L(bg); const cr=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
    const size=parseFloat(cs.fontSize); const key=el.className+"|"+cs.color+"|"+JSON.stringify(bg); if(seen.has(key)) continue; seen.add(key);
    out.push({cr:+cr.toFixed(2),t:t.slice(0,40),cls:String(el.className).slice(0,40),tag:el.tagName,size,fg:cs.color,bg:`rgb(${bg.r|0},${bg.g|0},${bg.b|0})`, disabled: !!el.closest(":disabled")});
  } return out; });
const all=[]; const run=async(name)=>{ const r=await audit(); for(const x of r) all.push({state:name,...x}); };
await p.goto("http://localhost:3100",{waitUntil:"networkidle"}); await p.waitForTimeout(1200); await run("landing");
await p.getByRole("button",{name:/Run the sample/}).click(); await p.locator(".receipt h2").getByText(/recorded real run/).waitFor({timeout:60000}); await p.waitForTimeout(2500); await run("board");
await p.getByRole("tab",{name:/Your broker decides/}).click(); await p.waitForTimeout(600); await run("lane");
await p.locator(".row .en").first().click(); await p.waitForTimeout(1200); await run("drawer");
const bad=all.filter(x=>x.cr<4.5 && !x.disabled);
console.log("checked",all.length,"unique text styles; below 4.5:",bad.length);
for(const x of bad.sort((a,b)=>a.cr-b.cr)) console.log(x.cr,x.state,x.tag+"."+x.cls,JSON.stringify(x.t),x.size+"px",x.fg,"on",x.bg);
const live=all.filter(x=>!x.disabled).sort((a,b)=>a.cr-b.cr); console.log("lowest 6 enabled:"); for(const x of live.slice(0,6)) console.log(" ",x.cr,x.state,x.tag+"."+x.cls,JSON.stringify(x.t),x.fg,"on",x.bg); console.log("disabled controls (exempt):",all.filter(x=>x.disabled).length);
await b.close();
