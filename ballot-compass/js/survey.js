// Optional "about you" questions and the consent wording version.
// Shared by the browser (to render) and the server (to validate).

export const CONSENT_VERSION = '2026-11-23';

export const PREFER_NOT = { value: 'na', label: 'Prefer not to say' };

export const DEMOGRAPHIC_FIELDS = [
  {
    id: 'age',
    label: 'Your age',
    options: [
      { value: '18-24', label: '18 to 24' },
      { value: '25-34', label: '25 to 34' },
      { value: '35-44', label: '35 to 44' },
      { value: '45-54', label: '45 to 54' },
      { value: '55-64', label: '55 to 64' },
      { value: '65+', label: '65 or older' },
    ],
  },
  {
    id: 'household',
    label: 'People in your household, including you',
    options: [
      { value: '1', label: '1 (just me)' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4' },
      { value: '5', label: '5' },
      { value: '6+', label: '6 or more' },
    ],
  },
  {
    id: 'income',
    label: 'Total household income last year, before taxes',
    options: [
      { value: 'under-25k', label: 'Under $25,000' },
      { value: '25-50k', label: '$25,000 to $49,999' },
      { value: '50-75k', label: '$50,000 to $74,999' },
      { value: '75-100k', label: '$75,000 to $99,999' },
      { value: '100-150k', label: '$100,000 to $149,999' },
      { value: '150-200k', label: '$150,000 to $199,999' },
      { value: '200k+', label: '$200,000 or more' },
    ],
  },
];

/** null/'' means "not answered"; otherwise it must be a listed value or "Prefer not to say". */
export function isValidDemographic(fieldId, value) {
  if (value === null || value === undefined || value === '') return true;
  const field = DEMOGRAPHIC_FIELDS.find((f) => f.id === fieldId);
  if (!field) return false;
  return value === PREFER_NOT.value || field.options.some((o) => o.value === value);
}

export function isValidEmail(email) {
  return typeof email === 'string'
    && email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function newSubmissionId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
