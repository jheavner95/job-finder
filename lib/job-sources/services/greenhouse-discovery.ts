import type { PrismaClient } from "@prisma/client";

import { ProviderDiscoveryRunner } from "./provider-discovery";

export class GreenhouseDiscoveryRunner extends ProviderDiscoveryRunner {
  constructor(database: PrismaClient, client: typeof fetch = fetch) {
    super(database, "greenhouse", client);
  }
}
