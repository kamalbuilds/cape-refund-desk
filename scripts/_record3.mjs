// Records the "Run the sample" flow via CDP screencast (no Playwright ffmpeg download needed), then stitches with system ffmpeg.
import { chromium } from "playwright-core";
import fs from "node:fs"; import { execFileSync } from "node:child_process";
const OUT = process.argv[2]; fs.mkdirSync(OUT,{recursive:true});
const FR = "/tmp/capeui/frames"; fs.rmSync(FR,{recursive:true,force:true}); fs.mkdirSync(FR,{recursive:true});
const b = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await b.newContext({ viewport:{width:1440,height:900} });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
const frames=[]; let n=0;
cdp.on("Page.screencastFrame", async f => { const i=n++; fs.writeFileSync(`${FR}/f${String(i).padStart(5,"0")}.jpg`, Buffer.from(f.data,"base64")); frames.push(f.metadata.timestamp); try{await cdp.send("Page.screencastFrameAck",{sessionId:f.sessionId});}catch{} });
await p.goto("http://localhost:3100",{waitUntil:"networkidle"});
await cdp.send("Page.startScreencast",{format:"jpeg",quality:85,maxWidth:1440,maxHeight:900,everyNthFrame:1});
await p.waitForTimeout(3000);
await p.getByRole("button",{name:/Run the sample/}).click();
await p.locator(".receipt h2").getByText(/recorded real run/).waitFor({timeout:60000});
await p.waitForTimeout(2000);
await p.getByRole("tab",{name:/Your broker decides/}).click(); await p.waitForTimeout(1500);
await p.locator(".row .en").first().click(); await p.waitForTimeout(3000);
await cdp.send("Page.stopScreencast"); await ctx.close(); await b.close();
let list=""; for(let i=0;i<frames.length;i++){ const d=i+1<frames.length?Math.max(0.01,frames[i+1]-frames[i]):0.5; list+=`file '${FR}/f${String(i).padStart(5,"0")}.jpg'\nduration ${d.toFixed(4)}\n`; }
list+=`file '${FR}/f${String(frames.length-1).padStart(5,"0")}.jpg'\n`;
fs.writeFileSync(`${FR}/list.txt`,list);
execFileSync("ffmpeg",["-y","-loglevel","error","-f","concat","-safe","0","-i",`${FR}/list.txt`,"-vf","fps=30,format=yuv420p","-c:v","libx264","-crf","20",`${OUT}/run-the-sample.mp4`]);
console.log("frames",frames.length,"secs",(frames.at(-1)-frames[0]).toFixed(1));
