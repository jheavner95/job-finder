"use client";

import { useSyncExternalStore } from "react";

import { greetingForHour } from "@/lib/presentation-language";

const subscribe = () => () => {};

export function LocalGreeting() {
  const hour = useSyncExternalStore(
    subscribe,
    () => new Date().getHours(),
    () => null,
  );
  return <>{hour === null ? "Welcome back." : greetingForHour(hour)}</>;
}
