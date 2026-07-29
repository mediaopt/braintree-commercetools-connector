export const sessionHeader = (sessionId: string) => ({
  "Content-Type": "application/json",
  "X-Session-Id": sessionId,
});
