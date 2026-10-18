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

// Microsoft 365 OAuth callback endpoint (interactive browser flow satisfying Entra ID Security Defaults)
app.get("/auth/callback", async (req, res): Promise<void> => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  if (!code) {
    res.status(400).send("Authorization code missing in callback.");
    return;
  }

  const { getPkceVerifier } = await import("./lib/pkce");
  const codeVerifier = state ? getPkceVerifier(state) : undefined;

  const tenantId = process.env.MS_GRAPH_TENANT_ID || "5af47cf9-2cb5-4b53-a5ec-f7fa67c69552";
  const clientId = process.env.MS_GRAPH_CLIENT_ID || "36cd549a-b6da-4af7-a41c-c898a8d7553e";
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET || "";
  const redirectUri = "http://localhost:5000/auth/callback";

  try {
    const buildParams = (includeSecret: boolean, includeVerifier: boolean) => {
      const p = new URLSearchParams({
        client_id: clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        scope: "https://graph.microsoft.com/Chat.ReadWrite https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/User.Read offline_access",
      });
      if (includeVerifier && codeVerifier) {
        p.append("code_verifier", codeVerifier);
      }
      if (includeSecret && clientSecret) {
        p.append("client_secret", clientSecret);
      }
      return p;
    };

    // Try with PKCE code_verifier first (standard for Public Client flow)
    let tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: buildParams(false, true).toString(),
    });

    let tokens = (await tokenRes.json()) as any;
    if (tokens.error && clientSecret && (tokens.error_description?.includes("client_secret") || tokens.error === "invalid_client")) {
      tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: buildParams(true, true).toString(),
      });
      tokens = (await tokenRes.json()) as any;
    }
    if (tokens.access_token) {
      const candidatePaths = [
        path.resolve(process.cwd(), "scratch/teams_delegated_tokens.json"),
        path.resolve(process.cwd(), "../../scratch/teams_delegated_tokens.json"),
      ];
      for (const tokenFilePath of candidatePaths) {
        try {
          fs.mkdirSync(path.dirname(tokenFilePath), { recursive: true });
          fs.writeFileSync(tokenFilePath, JSON.stringify(tokens, null, 2));
        } catch (_) {}
      }

      if (tokens.refresh_token) {
        process.env.MS_GRAPH_REFRESH_TOKEN = tokens.refresh_token;
        const candidateEnv = [
          path.resolve(process.cwd(), ".env"),
          path.resolve(process.cwd(), "../../.env"),
        ];
        for (const envPath of candidateEnv) {
          if (fs.existsSync(envPath)) {
            try {
              let envText = fs.readFileSync(envPath, "utf8");
              if (envText.includes("MS_GRAPH_REFRESH_TOKEN=")) {
                envText = envText.replace(/MS_GRAPH_REFRESH_TOKEN=.*$/m, `MS_GRAPH_REFRESH_TOKEN=${tokens.refresh_token}`);
              } else {
                envText += `\nMS_GRAPH_REFRESH_TOKEN=${tokens.refresh_token}`;
              }
              fs.writeFileSync(envPath, envText, "utf8");
            } catch (_) {}
          }
        }
      }

      res.send(`<!DOCTYPE html>
<html>
<head><title>Microsoft Teams Connected</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 60px; background: #0f172a; color: white;">
  <div style="max-width: 500px; margin: 0 auto; background: #1e293b; padding: 40px; border-radius: 12px; border: 1px solid #334155;">
    <h2 style="color: #22c55e; margin-top: 0;">Microsoft Teams Connected!</h2>
    <p style="font-size: 15px; color: #94a3b8; line-height: 1.5;">
      Delegated permissions have been refreshed successfully for <strong>Deepak Paranjape</strong>.
      Teams and Outlook messaging is active.
    </p>
    <p style="margin-top: 30px;">
      <a href="http://localhost:3000/authorization-inbox" style="display: inline-block; background: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Open Authorization Inbox
      </a>
    </p>
  </div>
  <script>setTimeout(() => window.location.href = 'http://localhost:3000/authorization-inbox', 2000);</script>
</body>
</html>`);
      return;
    }

    res.status(500).send(`Token exchange error: ${JSON.stringify(tokens)}`);
  } catch (err: any) {
    res.status(500).send(`OAuth callback error: ${err?.message}`);
  }
});

app.use("/api", router);

// Explicit 404 JSON response for unhandled API routes
app.use((req, res, next) => {
  if (req.path.startsWith("/api") || req.originalUrl?.startsWith("/api")) {
    res.status(404).json({ error: "API endpoint not found. Please ensure backend server is running the latest build." });
    return;
  }
  next();
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
const candidateStaticDirs = [
  path.resolve(process.cwd(), "artifacts/atlas-web/dist/public"),
  path.resolve(process.cwd(), "../atlas-web/dist/public"),
  path.resolve(process.cwd(), "dist/public"),
  path.resolve(process.cwd(), "../dist/public"),
];

try {
  const currentDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, "$1"));
  candidateStaticDirs.push(
    path.resolve(currentDir, "../../atlas-web/dist/public"),
    path.resolve(currentDir, "../../../artifacts/atlas-web/dist/public"),
    path.resolve(currentDir, "public")
  );
} catch (_) {}

const staticDir = candidateStaticDirs.find((d) => fs.existsSync(d) && fs.existsSync(path.join(d, "index.html"))) || null;

if (staticDir) {
  logger.info({ staticDir }, "Serving static web assets from");
  app.use(express.static(staticDir));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api") && !req.path.startsWith("/auth")) {
      return res.sendFile(path.join(staticDir, "index.html"));
    }
    next();
  });
} else {
  logger.warn("Static assets directory not found; API routes active, fallback page serving at /");
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/auth")) {
      return next();
    }
    res.status(200).send(
      `<!DOCTYPE html>
      <html>
        <head><title>Deepak's Digital Twin Suite API</title></head>
        <body style="font-family: sans-serif; padding: 40px; background: #faf9f6; color: #333;">
          <h2>Deepak's Digital Twin Suite API Server</h2>
          <p>The backend API server is running successfully at <code>/api</code>.</p>
          <p>Frontend static assets were not located in any candidate directory.</p>
          <p>Please ensure your Render build command includes: <code>pnpm --filter @workspace/atlas-web run build</code></p>
        </body>
      </html>`
    );
  });
}

export default app;
