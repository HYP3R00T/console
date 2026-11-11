import { OwnerConfiguration } from "../storage/owner-configuration.ts";
export type HttpConfiguration = {
  host: string;
  port: number;
  origins: string[];
  authentication: boolean;
};
const local = new Set(["127.0.0.1", "::1", "localhost"]);
export function parseHttpConfiguration(value: unknown): HttpConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid HTTP configuration.");
  const config = value as HttpConfiguration;
  if (
    Object.keys(config).some(
      (key) => !["host", "port", "origins", "authentication"].includes(key),
    ) ||
    typeof config.host !== "string" ||
    ![...local, "0.0.0.0", "::"].includes(config.host) ||
    !Number.isInteger(config.port) ||
    config.port < 1 ||
    config.port > 65535 ||
    typeof config.authentication !== "boolean" ||
    (!local.has(config.host) && !config.authentication) ||
    !Array.isArray(config.origins) ||
    !config.origins.length ||
    config.origins.length > 20
  )
    throw new Error(
      "Remote binding requires authentication and explicit browser origins.",
    );
  for (const origin of config.origins) {
    const url = new URL(origin);
    if (
      url.origin !== origin ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ))
    )
      throw new Error("Use HTTPS origins, or HTTP loopback origins.");
  }
  return config;
}
export async function httpConfiguration(path: string) {
  const snapshot = await new OwnerConfiguration<HttpConfiguration>(
    path,
    parseHttpConfiguration,
    {
      host: "127.0.0.1",
      port: 3000,
      origins: ["http://127.0.0.1:3001", "http://localhost:3001"],
      authentication: false,
    },
  ).read();
  if (snapshot.invalid || !snapshot.configuration)
    throw new Error("Invalid owner-only http.json configuration.");
  return snapshot.configuration;
}
