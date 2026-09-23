export function isDemoModeEnabled(
  nodeEnv = process.env.NODE_ENV,
  demoFlag = process.env.NEXT_PUBLIC_DEMO_MODE,
): boolean {
  return nodeEnv !== "production" && demoFlag === "true";
}

