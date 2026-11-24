// Optional "about you" questions and the consent wording version.
// Shared by the browser (to render) and the server (to validate).

export const CONSENT_VERSION = '2026-11-24';

export const PREFER_NOT = { value: 'na', label: 'Prefer not to say' };

const STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
  ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'],
  ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
  ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
  ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'],
  ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
  ['PR', 'Puerto Rico'], ['XX', 'Outside the U.S.'],
];

// `step`: 'start' fields are asked before the issues; 'end' fields just before results.
export const DEMOGRAPHIC_FIELDS = [
  {
    id: 'state',
    step: 'start',
    label: 'Your state',
    options: STATES.map(([value, label]) => ({ value, label })),
  },
  {
    id: 'age',
    step: 'start',
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
    id: 'registration',
    step: 'end',
    label: 'Are you registered to vote?',
    options: [
      { value: 'registered', label: 'Yes, registered' },
      { value: 'not-registered', label: 'Not registered' },
      { value: 'not-sure', label: 'Not sure' },
      { value: 'not-eligible', label: 'Not eligible to vote' },
    ],
  },
  {
    id: 'party',
    step: 'end',
    label: 'Party you lean toward',
    options: [
      { value: 'democrat', label: 'Democrat' },
      { value: 'republican', label: 'Republican' },
      { value: 'independent', label: 'Independent' },
      { value: 'other', label: 'Another party' },
      { value: 'none', label: 'No party' },
    ],
  },
  {
    id: 'marital',
    step: 'end',
    label: 'Marital status',
    options: [
      { value: 'single', label: 'Single, never married' },
      { value: 'married', label: 'Married' },
      { value: 'partner', label: 'Living with a partner' },
      { value: 'divorced', label: 'Divorced or separated' },
      { value: 'widowed', label: 'Widowed' },
    ],
  },
  {
    id: 'household',
    step: 'end',
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
    step: 'end',
    label: 'Household income last year, before taxes',
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
