const { JSDOM, VirtualConsole } = require("jsdom");

const virtualConsole = new VirtualConsole();
virtualConsole.on("error", (...args) => console.error("[JSDOM ERROR]", ...args));
virtualConsole.on("warn", (...args) => console.warn("[JSDOM WARN]", ...args));
virtualConsole.on("log", (...args) => console.log("[JSDOM LOG]", ...args));
virtualConsole.on("jsdomError", (err) => console.error("[JSDOM EXCEPTION]", err));

async function run() {
  console.log("Loading http://localhost:3001 in JSDOM...");
  const dom = await JSDOM.fromURL("http://localhost:3001", {
    resources: "usable",
    runScripts: "dangerously",
    virtualConsole,
    pretendToBeVisual: true,
  });

  // wait a bit for scripts to load and React to render
  await new Promise(r => setTimeout(r, 3000));
  console.log("Title:", dom.window.document.title);
  console.log("Body HTML snippet:", dom.window.document.body.innerHTML.slice(0, 300));
  
  // check if error boundary or anything was hit
  const errorEl = dom.window.document.querySelector("div");
  console.log("First div text:", errorEl ? errorEl.textContent.slice(0, 100) : "none");
}

run().catch(console.error);
