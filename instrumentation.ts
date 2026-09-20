// Next.js runs register() once per server process start — including every restart, redeploy, or
// crash-and-restart on Render. This is the "restart recovery" hook for the persisted delivery
// queue (lib/delivery-worker.ts): starting the in-process worker here means every process start
// immediately resumes any pending or crashed-mid-job delivery work instead of that work only ever
// being kicked off from inside an HTTP request handler.
//
// Guarded to the Node.js runtime only (never the Edge runtime, which this app doesn't use for API
// routes anyway, and never during `next build`) since the worker needs real Postgres connections
// and timers.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDeliveryWorker } = await import("@/lib/delivery-worker");
    startDeliveryWorker();
  }
}
