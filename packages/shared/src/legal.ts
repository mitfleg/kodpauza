export const legalDocumentVersions = {
  terms: '2026-07-17.2',
  privacy: '2026-07-21',
  personalDataConsent: '2026-07-17.3',
  cookies: '2026-07-17.2',
  advertisingRules: '2026-07-17',
  developerAgreement: '2026-07-17.2',
} as const;

export const registrationLegalDocuments = [
  { type: 'terms', version: legalDocumentVersions.terms },
  { type: 'privacy', version: legalDocumentVersions.privacy },
  {
    type: 'personal_data_consent',
    version: legalDocumentVersions.personalDataConsent,
  },
] as const;

export type RegistrationLegalDocumentType =
  (typeof registrationLegalDocuments)[number]['type'];
