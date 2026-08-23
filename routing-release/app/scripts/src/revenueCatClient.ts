import { ReplitConnectors } from "@replit/connectors-sdk";
import { createClient } from "@replit/revenuecat-sdk/client";

export async function getUncachableRevenueCatClient() {
  const connectors = new ReplitConnectors();

  const customFetch = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const path = url.pathname + url.search;

    let body: Record<string, unknown> | undefined;
    const contentType = request.headers.get("content-type") ?? "";
    if (request.body && contentType.includes("application/json")) {
      const text = await request.text();
      body = text ? JSON.parse(text) : undefined;
    }

    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "authorization" && key.toLowerCase() !== "content-type") {
        headers[key] = value;
      }
    });

    const response = await connectors.proxy("revenuecat", path, {
      method: request.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
      ...(body !== undefined ? { body } : {}),
      headers,
    });

    return response as unknown as Response;
  };

  return createClient({
    baseUrl: "https://api.revenuecat.com/v2",
    fetch: customFetch,
  });
}
