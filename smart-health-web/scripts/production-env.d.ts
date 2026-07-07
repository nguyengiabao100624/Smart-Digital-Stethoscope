export function getProductionEnvFiles(cwd?: string): string[];

export function loadProductionEnv(options?: {
  cwd?: string;
  applyToProcess?: boolean;
}): {
  env: Record<string, string | undefined>;
  files: string[];
};
