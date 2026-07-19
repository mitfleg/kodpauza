export type RuntimeReloadDecisionInput = {
  patchChanged: boolean;
  activeTurnMissingUi: boolean;
  anyTurnActive: boolean;
  reloadPending: boolean;
};

export type RuntimeReloadDecision = {
  reloadNow: boolean;
  reloadPending: boolean;
};

/**
 * A repaired bundle is not enough when the current webview still runs the old
 * cached JavaScript. Reloading the editor fixes that cache, but doing it in the
 * middle of an AI turn would interrupt the user. Keep the recovery pending
 * until every active Codex/Claude turn has finished.
 */
export function runtimeReloadDecision(
  input: RuntimeReloadDecisionInput,
): RuntimeReloadDecision {
  const recoveryNeeded =
    input.reloadPending || input.patchChanged || input.activeTurnMissingUi;
  if (!recoveryNeeded) return { reloadNow: false, reloadPending: false };
  if (input.anyTurnActive) return { reloadNow: false, reloadPending: true };
  return { reloadNow: true, reloadPending: false };
}
