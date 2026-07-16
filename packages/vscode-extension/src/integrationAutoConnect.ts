export type AutomaticIntegrationTrigger = 'login' | 'startup';

export function shouldAutomaticallyConnectIntegrations(input: {
  trigger: AutomaticIntegrationTrigger;
  authenticated: boolean;
  autoConnectEnabled: boolean;
  integrationEnabled: boolean;
}): boolean {
  if (!input.authenticated || !input.autoConnectEnabled) {
    return false;
  }
  return input.trigger === 'login' || !input.integrationEnabled;
}
