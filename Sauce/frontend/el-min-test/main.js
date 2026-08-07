const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const logPath = "C:\\Users\\tinoc\\AppData\\Local\\Temp\\opencode\\min-trace.log";

function log(m) {
  fs.appendFileSync(logPath, new Date().toISOString() + " " + m + "\n");
}

process.on("uncaughtException", (e) => log("uncaught: " + (e && e.stack)));
process.on("unhandledRejection", (e) => log("unhandledRejection: " + e));

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("use-angle", "swiftshader");
app.commandLine.appendSwitch("disable-gpu-compositing");

log("start");

app.whenReady().then(() => {
  log("ready");
  const win = new BrowserWindow({ width: 800, height: 600 });
  win.webContents.once("did-finish-load", () => {
    log("loaded");
  });
  win.loadURL("data:text/html,<h1>SAUCE min test</h1>").catch((e) => log("loadErr: " + e));
});

app.on("window-all-closed", () => {
  log("window-all-closed");
});
