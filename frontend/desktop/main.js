const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.SAUCE_PORT) || 3210;
const SITE_URL = `http://localhost:${PORT}`;

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("use-angle", "swiftshader");
app.commandLine.appendSwitch("disable-gpu-compositing");

let serverProcess = null;
let mainWindow = null;
let isQuitting = false;

function isDev() {
  return !app.isPackaged;
}

function frontendDir() {
  if (isDev()) {
    return path.join(__dirname, "..");
  }
  return path.join(process.resourcesPath, "app", "out");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function serveStatic(dir) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, SITE_URL).pathname);
    const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const filePath = path.join(dir, rel);

    const candidate = filePath.endsWith("/") ? path.join(filePath, "index.html") : filePath;

    fs.stat(candidate, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Not Found");
        return;
      }
      const ext = path.extname(candidate).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      fs.createReadStream(candidate).pipe(res);
    });
  });

  return new Promise((resolve) => server.listen(PORT, resolve)).then(() => server);
}

function startServer() {
  if (!isDev()) {
    const dir = frontendDir();
    if (!fs.existsSync(dir)) {
      console.error(`[sauce] No se encontró el frontend en ${dir}`);
      return;
    }
    serveStatic(dir).then(() => console.log(`[sauce] sirviendo frontend en ${SITE_URL}`));
    return;
  }

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  serverProcess = spawn(npm, ["run", "dev"], {
    cwd: frontendDir(),
    shell: true,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout.on("data", (d) => process.stdout.write(`[next] ${d}`));
  serverProcess.stderr.on("data", (d) => process.stderr.write(`[next] ${d}`));

  serverProcess.on("exit", (code) => {
    if (code !== 0 && !isQuitting) {
      console.error(`[next] server exited with code ${code}`);
    }
  });
}

function stopServer() {
  if (!serverProcess) return;
  try {
    serverProcess.kill();
  } catch {
    /* already gone */
  }
  serverProcess = null;
}

function waitForServer(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      fetch(SITE_URL)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() > deadline) {
            reject(new Error(`Tiempo de espera agotado esperando a ${SITE_URL}`));
          } else {
            setTimeout(attempt, 500);
          }
        });
    };
    attempt();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: "#FAF8F5",
    title: "SAUCE",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL(SITE_URL);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require("electron").shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForServer();
  } catch (err) {
    console.error(err.message);
    app.quit();
    return;
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  stopServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
