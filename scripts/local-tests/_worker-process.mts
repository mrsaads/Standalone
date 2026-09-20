// Helper child process for restart-recovery.local-test.mts. Two modes, both using the real
// production functions from lib/delivery-worker.ts (never a reimplementation):
//
//   claim-and-hang   Claims exactly one delivery job (the real claimNextJob()), prints its id,
//                     then sleeps until killed — simulating a server process that grabbed a job
//                     and then died (crash, OOM-kill, deploy) before finishing it.
//   run               Runs the real tick loop for a few seconds, as instrumentation.ts would on a
//                     fresh process start — simulating the restart that follows.
import { claimNextJob, runDeliveryWorkerOnce } from "../../lib/delivery-worker";

const mode = process.argv[2];

if (mode === "claim-and-hang") {
  const job = await claimNextJob();
  console.log(`CLAIMED:${job ? job.id : "none"}`);
  await new Promise(() => {}); // hang until SIGKILL'd by the driver
} else if (mode === "run") {
  const deadline = Date.now() + 4000;
  let ticks = 0;
  while (Date.now() < deadline) {
    const did = await runDeliveryWorkerOnce();
    if (did) ticks++;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  console.log(`RAN_TICKS:${ticks}`);
  process.exit(0);
} else {
  console.error("Usage: _worker-process.mts <claim-and-hang|run>");
  process.exit(1);
}
