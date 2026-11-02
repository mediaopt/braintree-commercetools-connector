import { RequestHeader } from "../types";

// No session (Express created before the merchant's session has a cart): no header, rather than the string "undefined"
export const sessionIdHeader = (sessionId?: string): RequestHeader =>
  sessionId ? { "X-Session-Id": sessionId } : {};

export const sessionHeader = (sessionId?: string) => ({
  "Content-Type": "application/json",
  ...sessionIdHeader(sessionId),
});
