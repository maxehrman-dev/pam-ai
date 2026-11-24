// POST /api/signup  join the update list: { "email": "...", "consent": true }
// Stored in its own table, never linked to survey responses.
import { guard, readJson, send, supabase } from './_lib/server.js';
import { validateSignup } from './_lib/validate.js';

export default async function handler(req, res) {
  if (!(await guard(req, res, 'signup', ['POST'], { perMinute: 5, perDay: 20, globalPerDay: 20000 }))) return;
  const parsed = await readJson(req);
  if (parsed.error) return send(res, parsed.status, { error: parsed.error });
  const result = validateSignup(parsed.body);
  if (!result.ok) return send(res, 400, { error: result.error });
  try {
    await supabase('bc_signups?on_conflict=email', {
      method: 'POST',
      body: result.row,
      prefer: 'resolution=ignore-duplicates,return=minimal',
    });
    // Same reply whether or not the address was already on the list, so the endpoint can't be used to check who signed up.
    return send(res, 200, { ok: true });
  } catch (err) {
    console.error(`[ballot-compass] signup failed: ${err.message}`);
    return send(res, 502, { error: 'Sign-up could not be saved right now.' });
  }
}
