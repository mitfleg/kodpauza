export interface DetectionResult {
  detected: boolean;
  extensionId?: string;
  extensionPath?: string;
  version?: string;
  safeToPatch: boolean;
  message: string;
}

export interface PatchResult {
  ok: boolean;
  changed: boolean;
  dryRun?: boolean;
  backupId?: string;
  message: string;
}

export interface DiagnosticsResult {
  adapterId: string;
  name: string;
  detection: DetectionResult;
  checks: string[];
}

export interface ToolAdapter {
  id: string;
  name: string;
  detect(): Promise<DetectionResult>;
  installPatch(options?: { dryRun?: boolean }): Promise<PatchResult>;
  removePatch(): Promise<PatchResult>;
  restoreBackup(): Promise<PatchResult>;
  diagnostics(): Promise<DiagnosticsResult>;
}
