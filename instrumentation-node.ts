declare global {
  var __jobDiscoverySchedulerStarted: boolean | undefined;
}

export async function registerNodeInstrumentation() {
  if (globalThis.__jobDiscoverySchedulerStarted) return;
  globalThis.__jobDiscoverySchedulerStarted = true;

  const [{ prisma }, { DiscoveryScheduler }] = await Promise.all([
    import("./lib/db"),
    import("./lib/scheduling/discovery-scheduler"),
  ]);
  const execute = () => {
    void (async () => {
      const due = await prisma.connectorSchedule.count({
        where: {
          scheduleType: { not: "Manual" },
          nextRunAt: { lte: new Date() },
          connector: { enabled: true },
        },
      });
      if (due > 0) {
        await new DiscoveryScheduler(prisma).run({ trigger: "scheduled" });
      }
    })().catch((error) => {
      console.error("Scheduled discovery orchestration failed.", error);
    });
  };
  const initial = setTimeout(execute, 5_000);
  const interval = setInterval(execute, 60_000);
  initial.unref();
  interval.unref();
}
