const value = (name: string) => process.env[name]?.trim() ?? '';

export const legalOperator = {
  name: value('NEXT_PUBLIC_LEGAL_OPERATOR_NAME'),
  status: value('NEXT_PUBLIC_LEGAL_OPERATOR_STATUS'),
  inn: value('NEXT_PUBLIC_LEGAL_OPERATOR_INN'),
  registrationNumber: value('NEXT_PUBLIC_LEGAL_OPERATOR_REGISTRATION_NUMBER'),
  address: value('NEXT_PUBLIC_LEGAL_OPERATOR_ADDRESS'),
  email: value('NEXT_PUBLIC_LEGAL_OPERATOR_EMAIL'),
};

export const legalOperatorReady = Boolean(
  legalOperator.name && legalOperator.status && legalOperator.inn,
);

export function operatorLabel() {
  return [legalOperator.status, legalOperator.name].filter(Boolean).join(' ') || 'Оператор Kodpauza';
}
