const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  session,
} = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { setupFFmpegIPC } = require("./ffmpeg-handler.js");

let mainWindow;
let staticServer;

// Suppress Electron DevTools Autofill errors
app.commandLine.appendSwitch("disable-features", "Autofill");

// ① 必须在 app.whenReady() 之前注册 app:// 协议，且支持 fetch API
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// Create HTTP server to serve static files including FFmpeg WASM
function createStaticServer() {
  const server = http.createServer((req, res) => {
    // Parse the URL to get the file path
    const url = new URL(req.url, `http://${req.headers.host}`);
    let filePath = url.pathname;

    // Remove leading slash and decode URI
    filePath = decodeURIComponent(filePath.substring(1));

    // Determine the full file path based on the request
    let fullPath;
    if (filePath.startsWith("ffmpeg/")) {
      // Serve FFmpeg files from the dist directory
      fullPath = path.join(__dirname, "../apps/web/dist", filePath);
    } else {
      // Serve other static files from dist
      fullPath = path.join(__dirname, "../apps/web/dist", filePath);
    }

    console.log("[Static Server] Request:", req.url, "-> File:", fullPath);

    // Check if file exists
    fs.access(fullPath, fs.constants.F_OK, (err) => {
      if (err) {
        console.log("[Static Server] File not found:", fullPath);
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("File not found");
        return;
      }

      // Determine content type
      const ext = path.extname(fullPath).toLowerCase();
      const mimeTypes = {
        ".js": "application/javascript",
        ".wasm": "application/wasm",
        ".json": "application/json",
        ".css": "text/css",
        ".html": "text/html",
      };
      const contentType = mimeTypes[ext] || "application/octet-stream";

      // Set CORS headers to allow cross-origin requests
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Content-Type", contentType);

      // Add Cross-Origin-Resource-Policy for COEP compatibility
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

      // Stream the file
      const fileStream = fs.createReadStream(fullPath);
      fileStream.pipe(res);

      fileStream.on("error", (error) => {
        console.error("[Static Server] Error reading file:", error);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal server error");
      });
    });
  });

  server.listen(8080, "localhost", () => {
    console.log("[Static Server] Started on http://localhost:8080");
  });

  return server;
}

function createWindow() {
  // 3️⃣ "替换" 而不是 "追加" CSP - 完全覆盖所有现有CSP策略
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };

    // 删除所有现有的CSP相关header，确保没有冲突
    Object.keys(responseHeaders).forEach((key) => {
      if (key.toLowerCase().includes("content-security-policy")) {
        delete responseHeaders[key];
      }
    });

    // 设置完整的新CSP策略，与index.html meta标签完全一致
    responseHeaders["Content-Security-Policy"] = [
      "default-src 'self' blob: data: app:; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: app:; " +
        "worker-src 'self' blob: app:; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "connect-src 'self' app: http://localhost:8080 ws: wss: https://fonts.googleapis.com https://fonts.gstatic.com https://api.github.com https://fal.run https://fal.media https://v3.fal.media; " +
        "media-src 'self' blob: data: app:; " +
        "img-src 'self' blob: data: app: https://fal.run https://fal.media https://v3.fal.media;",
    ];

    // 添加 COOP/COEP 头以支持 SharedArrayBuffer（FFmpeg WASM需要）
    responseHeaders["Cross-Origin-Opener-Policy"] = ["same-origin"];
    responseHeaders["Cross-Origin-Embedder-Policy"] = ["require-corp"];

    callback({ responseHeaders });
  });

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      // 移除 webSecurity: false 和 allowRunningInsecureContent，让CSP正确工作
    },
  });

  // Load the Vite app
  const isDev = process.env.NODE_ENV === "development";
  if (isDev) {
    mainWindow.loadURL("http://localhost:5174");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../apps/web/dist/index.html"));
  }

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  // Register custom protocol for serving static files
  protocol.registerFileProtocol("app", (request, callback) => {
    const url = request.url.replace("app://", "");

    // Handle FFmpeg resources specifically
    if (url.startsWith("ffmpeg/")) {
      const filename = url.replace("ffmpeg/", "");
      // In production, FFmpeg files are in resources/ffmpeg/
      const ffmpegPath = path.join(__dirname, "resources", "ffmpeg", filename);

      // Check if file exists in resources/ffmpeg, fallback to dist
      if (fs.existsSync(ffmpegPath)) {
        callback(ffmpegPath);
        return;
      }

      // Development fallback - try dist directory
      const distPath = path.join(__dirname, "../apps/web/dist", url);
      callback(distPath);
    } else {
      // Handle other resources normally
      const filePath = path.join(__dirname, "../apps/web/dist", url);
      callback(filePath);
    }
  });

  // Start the static server to serve FFmpeg WASM files
  staticServer = createStaticServer();

  createWindow();
  setupFFmpegIPC(); // Add FFmpeg CLI support
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Close the static server when quitting
    if (staticServer) {
      staticServer.close();
    }
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for file operations
ipcMain.handle("open-file-dialog", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      {
        name: "Video Files",
        extensions: [
          "mp4",
          "webm",
          "mov",
          "avi",
          "mkv",
          "wmv",
          "flv",
          "3gp",
          "m4v",
        ],
      },
      {
        name: "Audio Files",
        extensions: ["mp3", "wav", "aac", "ogg", "flac", "m4a", "wma"],
      },
      {
        name: "Image Files",
        extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"],
      },
      {
        name: "All Files",
        extensions: ["*"],
      },
    ],
  });
  return result;
});

ipcMain.handle("open-multiple-files-dialog", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Media Files",
        extensions: [
          "mp4",
          "webm",
          "mov",
          "avi",
          "mkv",
          "mp3",
          "wav",
          "jpg",
          "jpeg",
          "png",
          "gif",
        ],
      },
      {
        name: "All Files",
        extensions: ["*"],
      },
    ],
  });
  return result;
});

ipcMain.handle("save-file-dialog", async (event, defaultFilename, filters) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultFilename,
    filters: filters || [
      { name: "Video Files", extensions: ["mp4", "webm", "mov"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  return result;
});

ipcMain.handle("read-file", async (event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath);
    return data;
  } catch (error) {
    console.error("Error reading file:", error);
    throw error;
  }
});

ipcMain.handle("write-file", async (event, filePath, data) => {
  try {
    await fs.promises.writeFile(filePath, data);
    return { success: true };
  } catch (error) {
    console.error("Error writing file:", error);
    throw error;
  }
});

ipcMain.handle("get-file-info", async (event, filePath) => {
  try {
    const stats = await fs.promises.stat(filePath);
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
    };
  } catch (error) {
    console.error("Error getting file info:", error);
    throw error;
  }
});

// Storage IPC handlers
ipcMain.handle("storage:save", async (event, key, data) => {
  const userDataPath = app.getPath("userData");
  const filePath = path.join(userDataPath, "projects", `${key}.json`);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(data));
});

ipcMain.handle("storage:load", async (event, key) => {
  try {
    const userDataPath = app.getPath("userData");
    const filePath = path.join(userDataPath, "projects", `${key}.json`);
    const data = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
});

ipcMain.handle("storage:remove", async (event, key) => {
  try {
    const userDataPath = app.getPath("userData");
    const filePath = path.join(userDataPath, "projects", `${key}.json`);
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
});

ipcMain.handle("storage:list", async (event) => {
  try {
    const userDataPath = app.getPath("userData");
    const projectsDir = path.join(userDataPath, "projects");
    const files = await fs.promises.readdir(projectsDir);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
});

ipcMain.handle("storage:clear", async (event) => {
  try {
    const userDataPath = app.getPath("userData");
    const projectsDir = path.join(userDataPath, "projects");
    const files = await fs.promises.readdir(projectsDir);
    await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map((f) => fs.promises.unlink(path.join(projectsDir, f)))
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
});

// FFmpeg resource IPC handlers
ipcMain.handle("get-ffmpeg-resource-path", (event, filename) => {
  // Try resources/ffmpeg first (production)
  const resourcesPath = path.join(__dirname, "resources", "ffmpeg", filename);
  if (fs.existsSync(resourcesPath)) {
    return resourcesPath;
  }

  // Fallback to dist directory (development)
  const distPath = path.join(__dirname, "../apps/web/dist/ffmpeg", filename);
  return distPath;
});

ipcMain.handle("check-ffmpeg-resource", (event, filename) => {
  // Check resources/ffmpeg first (production)
  const resourcesPath = path.join(__dirname, "resources", "ffmpeg", filename);
  if (fs.existsSync(resourcesPath)) {
    return true;
  }

  // Check dist directory (development)
  const distPath = path.join(__dirname, "../apps/web/dist/ffmpeg", filename);
  return fs.existsSync(distPath);
});
