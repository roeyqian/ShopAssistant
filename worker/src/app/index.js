/// <reference path="../../../../worker-configuration.d.ts" />
// @ts-nocheck

import router from "./routes.js";
import { handleApi } from "./http.js";

export default {
  async fetch(request, env, executionCtx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url, router, { executionCtx });
    }

    try {
      const assetResponse = await env.assets.fetch(request);
      if (url.pathname === "/" || url.pathname.endsWith(".html")) {
        const headers = new Headers(assetResponse.headers);
        headers.set("cache-control", "no-cache");
        return new Response(assetResponse.body, {
          status: assetResponse.status,
          statusText: assetResponse.statusText,
          headers,
        });
      }
      return assetResponse;
    } catch (error) {
      console.error("Asset error:", error);
      return new Response("Not Found", { status: 404 });
    }
  },
};
