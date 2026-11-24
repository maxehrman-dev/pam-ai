// POST   /api/responses  share (or update) anonymous answers, keyed by a random id the browser keeps
// DELETE /api/responses  delete them again: { "submission_id": "..." }
import { guard, readJson, send, supabase } from './_lib/server.js';
import { validateResponse, isSubmissionId } from './_lib/validate.js';

export default async function handler(req, res) {
  if (!(await guard(req, res, 'responses', ['POST', 'DELETE'], { perMinute: 10, perDay: 50, globalPerDay: 50000 }))) return;
  const parsed = await readJson(req);
  if (parsed.error) return send(res, parsed.status, { error: parsed.error });

  try {
    if (req.method === 'DELETE') {
      const id = parsed.body && parsed.body.submission_id;
      if (!isSubmissionId(id)) return send(res, 400, { error: 'Invalid submission id.' });
      await supabase(`bc_responses?submission_id=eq.${encodeURIComponent(id.toLowerCase())}`, { method: 'DELETE', prefer: 'return=minimal' });
      return send(res, 200, { ok: true, deleted: true });
    }

    const result = validateResponse(parsed.body);
    if (!result.ok) return send(res, 400, { error: result.error });
    await supabase('bc_responses?on_conflict=submission_id', {
      method: 'POST',
      body: result.row,
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
    return send(res, 200, { ok: true });
  } catch (err) {
    console.error(`[ballot-compass] responses ${req.method} failed: ${err.message}`);
    return send(res, 502, { error: 'Your answers could not be saved right now.' });
  }
}
