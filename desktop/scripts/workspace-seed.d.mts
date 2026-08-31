export function resolvePackagedDependencies(packageJson: { dependencies?: Record<string, string> }): Record<string, string>;
export function prepareWorkspaceSeed(): { output: string; files: number };
