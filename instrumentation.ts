declare global {
  var __jobDiscoverySchedulerStarted: boolean | undefined;
}

async function runDueDiscovery() {
  const [{ prisma }, { DiscoveryScheduler }] = await Promise.all([
    import("./lib/db"),
    import("./lib/scheduling/discovery-scheduler"),
  ]);
  const due = await prisma.connectorSchedule.count({
    where: {
      scheduleType: { not: "Manual" },
      nextRunAt: { lte: new Date() },
      connector: { enabled: true },
    },
  });
  if (due === 0) return;
  await new DiscoveryScheduler(prisma).run({ trigger: "scheduled" });
}

export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs"
    || globalThis.__jobDiscoverySchedulerStarted
  ) {
    return;
  }
  globalThis.__jobDiscoverySchedulerStarted = true;

  const execute = () => {
    void runDueDiscovery().catch((error) => {
      console.error("Scheduled discovery orchestration failed.", error);
    });
  };
  const initial = setTimeout(execute, 5_000);
  const interval = setInterval(execute, 60_000);
  initial.unref();
  interval.unref();
}
