import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// Dev user for local development without OAuth
export const DEV_USER: User = {
  id: 1,
  openId: "dev-user-local",
  name: "Dev User",
  email: "dev@localhost",
  loginMethod: "local",
  role: "admin",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication failed - check if we should use dev user
    user = null;
  }

  // In development, if no OAuth is configured, use a dev user
  const isDev = process.env.NODE_ENV !== "production";
  const oauthConfigured = !!process.env.OAUTH_SERVER_URL;
  
  if (!user && isDev && !oauthConfigured) {
    user = DEV_USER;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
