import { chat, checkoutReview, clearHistory, getHistory, getResearchReport, researchReport, sellerNudge, synthesis } from "./service.js";

export default function registerAiRoutes(router) {
  router.add("POST", "/api/ai/chat", chat);
  router.add("POST", "/api/ai/checkout-review", checkoutReview);
  router.add("POST", "/api/ai/synthesis", synthesis);
  router.add("POST", "/api/ai/research-report", researchReport);
  router.add("GET", "/api/ai/research-report", getResearchReport);
  router.add("POST", "/api/ai/seller-nudge", sellerNudge);
  router.add("GET", "/api/ai/history", getHistory);
  router.add("DELETE", "/api/ai/history", clearHistory);
}
