import type { Instrumentation } from "next";

// Every server error becomes one JSON line in the logs (Render keeps them), with the
// same reference the error page shows, so a judge's "Reference: …" can be found.
// The route pattern is logged rather than the path: family paths carry access tokens.
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  console.error(
    JSON.stringify({
      level: "error",
      at: new Date().toISOString(),
      digest,
      method: request.method,
      route: context.routePath,
      kind: context.routeType,
      message: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
    }),
  );
};
