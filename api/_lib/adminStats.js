// Aggregates for the private admin page. Pure functions over rows already
// read from Supabase, so they're easy to test. Returns counts and short text
// only: no emails, no financial data.

const FUNNEL_STEPS = [
  ["signup_started", "Started signup"],
  ["values_onboarding_completed", "Finished profile"],
  ["sample_data_loaded", "Loaded sample data"],
  ["sandbox_connected", "Connected accounts"],
  ["ai_guidance_received", "Got an AI answer"]
];

const QUESTION_TOPICS = [
  ["Investing & retirement", /\b(invest\w*|retire\w*|roth|401k|401\(k\)|ira|index fund|stocks?)\b/i],
  ["Car", /\b(car|truck|vehicle|auto loan|lease)\b/i],
  ["Rent & moving", /\b(rent|apartment|move out|moving|lease|roommate)\b/i],
  ["Job & income", /\b(job|offer|salary|raise|quit|relocat\w*|side hustle|freelance)\b/i],
  ["Debt", /\b(debt|loan|card|pay ?off|student loans?)\b/i],
  ["Home buying", /\b(buy a (house|home|condo)|mortgage|down payment)\b/i],
  ["Paycheck & budget", /\b(paycheck|budget|split|save|saving|emergency)\b/i],
  ["Trips & big purchases", /\b(trip|vacation|travel|wedding|buy)\b/i]
];

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1]).map(([label, count]) => ({ label, count }));
}

function ageBand(age) {
  const value = Number(age);
  if (!(value > 0)) return "Not given";
  if (value < 18) return "Under 18";
  if (value <= 21) return "18-21";
  if (value <= 25) return "22-25";
  if (value <= 30) return "26-30";
  if (value <= 35) return "31-35";
  return "36+";
}

function weekStart(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getUTCDay();
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - ((day + 6) % 7)));
  return monday.toISOString().slice(0, 10);
}

function topicForQuestion(question) {
  const match = QUESTION_TOPICS.find(([, pattern]) => pattern.test(String(question || "")));
  return match ? match[0] : "Other";
}

function buildAdminStats({ waitlist = [], events = [], runs = [], feedback = [], accountCount = null, now = Date.now() } = {}) {
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const recentEvents = events.filter((event) => new Date(event.created_at).getTime() >= thirtyDaysAgo);

  const sessionsByEvent = new Map();
  for (const event of recentEvents) {
    const set = sessionsByEvent.get(event.event_name) || new Set();
    set.add(event.session_id || event.id);
    sessionsByEvent.set(event.event_name, set);
  }
  const funnel = FUNNEL_STEPS.map(([name, label]) => ({ name, label, sessions: sessionsByEvent.get(name)?.size || 0 }));

  const partners = waitlist.filter((row) => row.stage === "School or employer partner");
  const people = waitlist.filter((row) => row.stage !== "School or employer partner");

  return {
    generatedAt: new Date(now).toISOString(),
    totals: {
      waitlist: people.length,
      partnerRequests: partners.length,
      accounts: accountCount,
      decisionsRun: runs.length,
      eventsLast30Days: recentEvents.length
    },
    waitlistByStage: countBy(people, (row) => row.stage || "Not given"),
    waitlistByAge: countBy(people, (row) => ageBand(row.age)),
    waitlistByWeek: countBy(waitlist, (row) => weekStart(row.created_at)).sort((left, right) => left.label.localeCompare(right.label)).slice(-12),
    recentGoals: people.filter((row) => row.goal).slice(-12).reverse().map((row) => ({ goal: String(row.goal).slice(0, 220), stage: row.stage || "", when: row.created_at })),
    partnerRequests: partners.slice(-10).reverse().map((row) => ({ organization: String(row.goal || "").slice(0, 220), when: row.created_at })),
    funnel,
    topEvents: countBy(recentEvents, (event) => event.event_name).slice(0, 12),
    questionTopics: countBy(runs, (run) => topicForQuestion(run.question)),
    recentFeedback: feedback.slice(-8).reverse().map((item) => ({ rating: item.rating ?? null, message: String(item.message || "").slice(0, 400), page: item.page || "", when: item.created_at }))
  };
}

module.exports = { buildAdminStats, topicForQuestion };
