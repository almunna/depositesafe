/**
 * Serves the built web app from the API process.
 *
 * Replit routes "/" to a static host and "/api" to this server. A single
 * container has no router in front of it, so the image points
 * DEPOSITSAFE_WEB_ROOT at the Vite build and this middleware stands in.
 * Anything under /api is left to the API, including its JSON 404.
 */

import path from "node:path";
import express, { Router, type IRouter } from "express";

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function webApp(root: string): IRouter {
  const router: IRouter = Router();
  const webRoot = path.resolve(root);
  const indexFile = path.join(webRoot, "index.html");

  // Vite fingerprints every file under /assets, so they can be cached forever.
  // A missing one is a 404, never the app shell served as a script.
  router.use(
    "/assets",
    express.static(path.join(webRoot, "assets"), { immutable: true, maxAge: "1y", index: false }),
    (_req, res) => {
      res.status(404).end();
    },
  );
  router.use(express.static(webRoot, { index: false }));

  // Client-side routes all resolve to the app shell, which must not be cached
  // or browsers keep asking for the previous build's assets.
  router.use((req, res, next) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || isApiPath(req.path)) {
      next();
      return;
    }
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(indexFile, (error) => {
      if (error) next(error);
    });
  });

  return router;
}
