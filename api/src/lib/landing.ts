import type { FastifyReply } from "fastify";
import type { AppDeps } from "../deps.js";

/**
 * Lets the landing page (a static site on its own domain) read the answer: its access-request
 * form and its blog. Returns false for any other origin; a request with no origin at all
 * (curl, the phone app, the website's server) is left alone.
 */
export function allowLanding(deps: AppDeps, origin: string | undefined, reply: FastifyReply): boolean {
  reply.header("vary", "origin");
  if (!origin) return true;
  if (!deps.config.formOrigins.includes(origin)) return false;
  reply.header("access-control-allow-origin", origin);
  return true;
}
