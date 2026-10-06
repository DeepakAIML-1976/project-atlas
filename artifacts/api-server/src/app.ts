import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (process.env.CLERK_SECRET_KEY) {
  app.use(
    clerkMiddleware((req) => ({
      publishableKey: publishableKeyFromHost(
        getClerkProxyHost(req) ?? "",
        process.env.CLERK_PUBLISHABLE_KEY,
      ),
    })),
  );
} else {
  logger.info("CLERK_SECRET_KEY not provided - enabling Local SME Dev Mode");
}

app.use("/api", router);

// Explicit 404 JSON response for unhandled API routes
app.use("/api/*", (_req, res) => {
  res.status(404).json({ error: "API endpoint not found. Please ensure backend server is running the latest build." });
});

// Error logging middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, url: req.originalUrl || req.url, method: req.method }, "Express unhandled route error");
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: err?.message || "Internal server error" });
});

// Serve built web frontend static files if available
const webDistPath = path.resolve(process.cwd(), "artifacts/atlas-web/dist/public");
const fallbackWebDistPath = path.resolve(process.cwd(), "../atlas-web/dist/public");
const staticDir = fs.existsSync(webDistPath)
  ? webDistPath
  : fs.existsSync(fallbackWebDistPath)
  ? fallbackWebDistPath
  : null;

if (staticDir) {
  logger.info({ staticDir }, "Serving static web assets from");
  app.use(express.static(staticDir));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path.join(staticDir, "index.html"));
    }
    next();
  });
} else {
  app.get("/", (_req, res) => {
    res.send(
      `<!DOCTYPE html>
      <html>
        <head><title>Deepak's Digital Twin Suite API</title></head>
        <body style="font-family: sans-serif; padding: 40px; background: #faf9f6; color: #333;">
          <h2>Deepak's Digital Twin Suite API Server</h2>
          <p>The backend API server is running successfully at <code>/api</code>.</p>
          <p>To view the full Web UI, please run the frontend dev server via <code>pnpm dev:web</code> or build static assets via <code>pnpm --filter @workspace/atlas-web run build</code>.</p>
        </body>
      </html>`
    );
  });
}

export default app;
