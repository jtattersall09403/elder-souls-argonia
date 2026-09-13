import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const big = [];
page.on("response", r => { const n = Number(r.headers()["content-length"] ?? 0); if (n > 400000) big.push([(n/1e6).toFixed(1), r.url().replace(/^https?:\/\/[^/]+/, "").slice(0, 90)]); });
await page.goto(process.argv[2], { waitUntil: "load", timeout: 120000 }); await page.waitForTimeout(20000);
console.log(big.sort((a,b)=>b[0]-a[0]).map(b => b.join(" MB ")).join("\n"));
await browser.close();
