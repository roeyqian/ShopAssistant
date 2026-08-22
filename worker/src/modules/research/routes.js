import { archiveCompletedResearch, clearUserResearchData, getCompletedResearchArchiveContent, getRecommendations, trackBehavior, getSummary } from "./service.js";

export default function registerResearchRoutes(router) {
  router.add("DELETE", "/api/research/data", clearUserResearchData);
  router.add("POST", "/api/research/archive", archiveCompletedResearch);
  router.add("GET", "/api/research/archive/:archiveId/content", getCompletedResearchArchiveContent);
  router.add("POST", "/api/research/recommendations", getRecommendations);
  router.add("POST", "/api/research/track", trackBehavior);
  router.add("GET", "/api/research/summary", getSummary);
}
