import { chat, clearHistory, getHistory, sellerNudge } from "./service.js";

export default function registerAiRoutes(router) {
  router.add("POST", "/api/ai/chat", chat);
  router.add("POST", "/api/ai/seller-nudge", sellerNudge);
  router.add("GET", "/api/ai/history", getHistory);
  router.add("DELETE", "/api/ai/history", clearHistory);
}
