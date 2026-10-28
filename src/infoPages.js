// Public info pages: the three partner programs (schools & employers,
// creators, advisors), the help center and the money-terms glossary.
// Partner forms reuse the waitlist endpoint; each program is its own stage.

import { escapeHtml } from "./utils/formatters.js";

export const PARTNER_KINDS = {
  schools: {
    path: "/schools",
    stage: "School or employer partner",
    navLabel: "Schools & employers",
    kicker: "For schools and employers",
    title: "Give your students or new hires a head start.",
    sub: "The money calls that shape the next decade happen early: the first lease, the first 401(k), the first real paycheck. Offer PAM to a class, a cohort, or your whole intern program.",
    cta: "Talk to us",
    steps: [
      ["Tell us about your group", "Who they are and roughly how many. A career center, a financial literacy class, a new-grad cohort."],
      ["Get one invite link", "We set up a link for your group. Share it with the announcement below, or write your own."],
      ["People sign up on their own", "Each person sets up PAM privately. You never see anyone's numbers."]
    ],
    perks: [
      "Built for first-job decisions: paycheck split, first lease, student loans, 401(k) match",
      "Straight answers on their real numbers, with a safer version when the answer is no",
      "Each member's money stays private to them, always",
      "We'll tell you how many people joined. Never what they asked or what they have."
    ],
    template: {
      title: "Ready-to-send announcement",
      note: "Paste it into an email, Slack, or your LMS. Swap in your invite link.",
      text: "Subject: A free tool for your first big money decisions\n\nHi everyone,\n\nWe're offering PAM to our group. PAM is a decision simulator for your money: ask it something like \"Can I afford a $1,600 apartment?\" or \"Should I pay off my card or start investing?\" and it runs the answer against your own numbers, with a straight call and a safer way if the answer is no.\n\nIt's private. Nobody here sees your numbers, and PAM can't move money.\n\nGet started: [your invite link]\n\nPAM is an educational modeling tool, not financial advice."
    },
    faq: [
      ["What does it cost?", "Pricing for groups is set with each early partner. Tell us about your group and we'll come back with a simple quote."],
      ["Can we see how members are doing?", "No. You'll know how many people joined, nothing more. Financial privacy is the whole point."],
      ["Do members need to connect a bank?", "No. They can try PAM with sample numbers or type a few in. Linking accounts is optional."],
      ["Is this financial advice?", "No. PAM is an educational modeling tool, not a licensed advisor. That makes it a fit for financial literacy programs."]
    ],
    form: {
      title: "Talk to us about a partnership.",
      body: "Tell us about your school, program, or company and roughly how many people you'd want to bring.",
      emailLabel: "Work email",
      emailPlaceholder: "you@school.edu",
      fieldLabel: "School, program, or company",
      fieldPlaceholder: "e.g. State U career center, 40-person intern class",
      sent: "We read every request and will reach out about early access for your group."
    }
  },
  creators: {
    path: "/creators",
    stage: "Creator affiliate",
    navLabel: "Creators",
    kicker: "Creator program",
    title: "Your audience asks money questions. PAM answers them on their numbers.",
    sub: "For finance creators on TikTok, YouTube, Instagram, podcasts and newsletters. Share PAM with your audience and earn a share of what they pay.",
    cta: "Apply to the program",
    steps: [
      ["Apply", "Tell us where you post and who your audience is. We read every application."],
      ["Get your link", "Accepted creators get a personal referral link and a demo account to film with."],
      ["Earn while they stay", "You get a share of every subscription your link brings in, for as long as they keep PAM."]
    ],
    perks: [
      "A recurring revenue share, set when you're accepted",
      "A demo account with sample numbers, so you never show your own",
      "Early looks at new features to make content about",
      "Payouts start when paid plans launch"
    ],
    rules: {
      title: "The ground rules",
      items: [
        "Say it's a paid partnership. FTC rules require clear disclosure, and your audience deserves it.",
        "PAM is an educational tool, not financial advice. Please don't present it as either.",
        "No promises of returns, savings, or guaranteed outcomes.",
        "No spam, paid search on our name, or fake reviews."
      ]
    },
    faq: [
      ["Who is this for?", "Creators who talk about money for people early in their careers: budgeting, first jobs, moving out, debt, investing basics."],
      ["Do I need a big following?", "No. A smaller, engaged audience that trusts you matters more than a big number."],
      ["When do I get paid?", "Payouts start once paid plans are live. Accepted creators get the exact terms in writing before then."]
    ],
    form: {
      title: "Apply to the creator program.",
      body: "Where do you post, and roughly how many people follow you?",
      emailLabel: "Email",
      emailPlaceholder: "you@example.com",
      fieldLabel: "Your channel and audience",
      fieldPlaceholder: "e.g. @moneywithmaya on TikTok, 40k followers",
      sent: "Thanks. We read every application and will email you either way."
    }
  },
  advisors: {
    path: "/advisors",
    stage: "Advisor referral partner",
    navLabel: "Advisors",
    kicker: "For financial professionals",
    title: "For the clients who aren't ready for you yet.",
    sub: "Clients' kids, new grads, people a few years from needing a plan. PAM helps them make good early calls on their own, so they show up later with better habits and real numbers.",
    cta: "Request a referral link",
    steps: [
      ["Request a link", "Tell us about your practice. Advisors, CPAs, and credit counselors are all welcome."],
      ["Share it", "Hand it to the young people you work with, or the children of the clients you work with."],
      ["They take it from there", "They use PAM privately, and PAM is upfront that big decisions deserve a qualified professional."]
    ],
    perks: [
      "PAM sells no products and earns no commissions, so there's no conflict with your advice",
      "It's read-only: PAM can't move money or place trades",
      "Every answer is labeled as an educational model, not advice",
      "Their data stays theirs. You don't see it, and neither does anyone else"
    ],
    rules: {
      title: "What PAM is, and isn't",
      items: [
        "It is an educational decision simulator for people early in their financial lives.",
        "It is not a registered investment adviser, broker, or tax preparer, and it doesn't replace one.",
        "It does not recommend specific securities or funds.",
        "Referral links carry no payment either way, which keeps things clean for your compliance team."
      ]
    },
    faq: [
      ["Is there a cost?", "No. Referral links are free for professionals."],
      ["Do you send clients to advisors?", "Not today. PAM tells people to consult a qualified professional before major decisions, but it doesn't route them to anyone."],
      ["Can I see what my referrals do in PAM?", "No. What they ask and what they have stays private to them."]
    ],
    form: {
      title: "Request a referral link.",
      body: "Tell us about your practice and who you'd share PAM with.",
      emailLabel: "Work email",
      emailPlaceholder: "you@yourfirm.com",
      fieldLabel: "Your practice",
      fieldPlaceholder: "e.g. Fee-only advisor, Chicago, many clients with college-age kids",
      sent: "Thanks. We'll email your referral link once it's set up."
    }
  }
};

export const PARTNER_STAGES = Object.values(PARTNER_KINDS).map((kind) => kind.stage);

export function getPartnerKindByStage(stage) {
  return Object.values(PARTNER_KINDS).find((kind) => kind.stage === stage) || PARTNER_KINDS.schools;
}

const HELP_SECTIONS = [
  {
    title: "Getting started",
    articles: [
      ["What is PAM?", "PAM is a decision simulator for your money. Ask about a choice before you make it, like rent, a car, a job offer, debt, or investing, and PAM runs it against your numbers: what it does to your monthly buffer, your savings, your goals, and the safer way to get there."],
      ["How do I ask a good question?", "Name the decision and the number. \"Can I afford a $1,800 apartment?\" works better than \"Should I move?\". If you leave something out, PAM fills in a sensible assumption and shows it so you can change it."],
      ["What do Worth it, Not yet and Don't mean?", "That's PAM's call, made by its own math from your buffer, savings runway and goals. Worth it means it fits. Not yet means it's possible but tight, usually with a goal pushed back. Don't means it would put you in a risky spot as things stand. Questions that compare two options, like paying off debt or investing, get PAM's pick instead."],
      ["Can I ask follow-up questions?", "Yes. Use the box under any answer. Follow-ups like \"What if it was $1,500 instead?\" keep the same decision and change only what you name."],
      ["Why won't PAM answer some questions?", "PAM only works on money decisions, so it stays specific and doesn't make things up. Ask it about your money and it's all yours."],
      ["Is PAM a financial advisor?", "No. PAM is an educational modeling tool, not a licensed financial advisor, investment adviser, tax professional, or attorney. Consult a qualified professional before major financial decisions."]
    ]
  },
  {
    title: "Your money and data",
    articles: [
      ["Do I have to connect my bank?", "No. You can try PAM with sample numbers or type in a few of your own. Connecting accounts just means PAM uses your real balances, spending and debts automatically."],
      ["How does connecting accounts work?", "Bank connections go through Plaid, the same service many banking apps use. You sign in to your bank inside Plaid's window, so PAM never sees your bank login. During the beta, connections use Plaid's test environment."],
      ["Is my financial data safe?", "Data is encrypted in transit, access tokens stay on PAM's servers and never reach your browser, and PAM is read-only: it can't move money. We never sell your data or use it to train AI models."],
      ["What exactly does PAM store?", "Your profile, the balances, transactions and debts from accounts you connect, and the decisions you run. The plain-English breakdown is on the What PAM stores page."],
      ["How do I disconnect or delete my data?", "In Profile, choose Disconnect financial data. That revokes the bank connection and wipes the connected data in one step. To delete your whole account, email hello@pamadvisor.com."]
    ]
  },
  {
    title: "Answers and the math",
    articles: [
      ["Where do the numbers come from?", "From PAM's own calculations on your numbers. The written explanation is AI, but it only explains PAM's math. It never makes up a figure, and an explanation that disagrees with the math is thrown out."],
      ["What is a range of outcomes?", "For investing questions, PAM runs your plan through 1,000 simulated markets, from rough to strong, and shows where most of them land. It's a range, not a forecast."],
      ["Are the results guaranteed?", "No. They're estimates built on your numbers and stated assumptions. Real life can turn out differently, so treat PAM as a planning aid, not a promise."],
      ["What if a result looks wrong?", "Check the assumptions in The full breakdown under the answer, update any number that's off in your profile, and ask again. For big decisions, check the numbers with a professional."]
    ]
  },
  {
    title: "Account and billing",
    articles: [
      ["How do I sign back in?", "Use Sign in at the top of the homepage. If you're already signed in on this device, PAM opens straight to your dashboard."],
      ["Are payments live?", "Not yet. Founding members are quoted $7.99 a month, but nothing is charged until paid plans launch and you confirm checkout yourself."],
      ["How do I send feedback?", "From Profile in the app, or email hello@pamadvisor.com. We read all of it."]
    ]
  }
];

const GLOSSARY = [
  ["401(k)", "A retirement account offered through an employer. Money goes in from your paycheck, often before tax, and many employers add a match."],
  ["APR", "Annual percentage rate: the yearly cost of borrowing, including interest. A 22% APR card costs about $220 a year for every $1,000 you carry."],
  ["Avalanche method", "Paying off debt by putting extra money on the highest-interest balance first. It saves the most interest."],
  ["Brokerage account", "A regular, taxable investing account. No special tax breaks, but you can take money out any time."],
  ["Buffer", "What's left each month after your bills, spending and goal savings. PAM's main measure of breathing room."],
  ["Compound growth", "Earning returns on your past returns. It's why money invested early grows much more than money invested later."],
  ["Credit utilization", "How much of your available credit you're using. Lower is better for your credit score; many people aim to stay under about 30%."],
  ["Debt-to-income ratio", "Monthly debt payments divided by monthly income. Lenders use it to judge whether you can take on a new loan."],
  ["Effective tax rate", "The share of your total income that actually goes to tax. Lower than your top bracket, because each bracket only applies to part of your income."],
  ["Emergency fund", "Cash set aside for surprises like a job loss or a big repair. A common target is three to six months of essential costs."],
  ["Employer match", "Money your employer adds to your 401(k) when you contribute, up to a limit. Skipping it leaves part of your pay on the table."],
  ["HSA", "Health savings account. Paired with a high-deductible health plan, it can be tax-free going in, while growing, and coming out for medical costs."],
  ["Index fund", "A fund that holds every stock or bond in a market index, like the S&P 500. Low cost, broadly diversified."],
  ["Liquidity", "How quickly something can become cash without losing value. Savings is liquid; a 401(k) or a car is not."],
  ["Marginal tax bracket", "The rate on your next dollar of income. A raise is only taxed at this rate on the extra amount, not on everything."],
  ["Monte Carlo simulation", "Running a plan through many randomly varied market histories to see the range of likely results, instead of assuming one steady return."],
  ["Net worth", "Everything you own minus everything you owe."],
  ["Roth IRA", "A retirement account you fund with after-tax money. Growth and qualified withdrawals in retirement are tax-free. Income limits apply."],
  ["Roth vs Traditional", "Roth: pay tax now, not later. Traditional: skip tax now, pay it when you withdraw. The better choice depends on whether your tax rate is higher now or in retirement."],
  ["Runway", "How many months your savings would cover your essential costs if your income stopped."],
  ["Sinking fund", "Money you set aside bit by bit for a known future expense, like a trip, a car repair, or a security deposit."],
  ["Snowball method", "Paying off debt smallest balance first, for quick wins. Costs more interest than avalanche, but some people stick with it better."],
  ["Take-home pay", "What lands in your account after taxes, insurance, and retirement contributions come out."],
  ["Volatility", "How much an investment's value swings up and down. Higher volatility means a wider range of outcomes."]
];

export function glossaryAnchor(term) {
  return String(term).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function renderInfoHeader(chrome) {
  return `
    ${chrome.disclaimer}
    <header class="marketing-nav info-nav">
      <a class="foresee-brand" href="/">
        <span aria-hidden="true">PAM</span>
        <div><strong>PAM SI</strong><small>Personal Asset Manager</small></div>
      </a>
      <a class="info-home-link" href="/">Home</a>
    </header>
  `;
}

function renderFaqList(items) {
  return `
    <div class="info-faq">
      ${items.map(([question, answer]) => `
        <details class="info-article">
          <summary>${escapeHtml(question)}</summary>
          <p>${escapeHtml(answer)}</p>
        </details>
      `).join("")}
    </div>
  `;
}

export function renderPartnerPage(key, chrome) {
  const kind = PARTNER_KINDS[key];
  const openForm = `data-open-waitlist data-waitlist-stage="${escapeHtml(kind.stage)}"`;
  return `
    <div class="foresee-shell marketing-shell info-page">
      ${renderInfoHeader(chrome)}
      <section class="info-hero">
        <div class="marketing-eyebrow">${escapeHtml(kind.kicker)}</div>
        <h1>${escapeHtml(kind.title)}</h1>
        <p class="marketing-sub">${escapeHtml(kind.sub)}</p>
        <button class="button button-primary marketing-btn-lg" type="button" ${openForm}>${escapeHtml(kind.cta)} →</button>
      </section>
      <section class="info-section">
        <h2>How it works</h2>
        <ol class="info-steps">
          ${kind.steps.map(([title, body], index) => `
            <li><span class="marketing-step-number" aria-hidden="true">${index + 1}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p></div></li>
          `).join("")}
        </ol>
      </section>
      <section class="info-section info-two-col">
        <div class="info-card">
          <h2>${key === "creators" ? "What you get" : key === "advisors" ? "Why it's safe to share" : "What your people get"}</h2>
          <ul class="marketing-checklist">${kind.perks.map((perk) => `<li>${escapeHtml(perk)}</li>`).join("")}</ul>
        </div>
        ${kind.template ? `
          <div class="info-card">
            <h2>${escapeHtml(kind.template.title)}</h2>
            <p class="info-note">${escapeHtml(kind.template.note)}</p>
            <pre class="info-template" id="partner-template">${escapeHtml(kind.template.text)}</pre>
            <button class="text-button" type="button" data-copy-target="partner-template">Copy text</button>
          </div>
        ` : `
          <div class="info-card">
            <h2>${escapeHtml(kind.rules.title)}</h2>
            <ul class="info-rules">${kind.rules.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
        `}
      </section>
      <section class="info-section">
        <h2>Questions</h2>
        ${renderFaqList(kind.faq)}
      </section>
      <section class="marketing-section marketing-final-cta">
        <h2>${escapeHtml(kind.title)}</h2>
        <button class="button button-primary marketing-btn-lg" type="button" ${openForm}>${escapeHtml(kind.cta)} →</button>
      </section>
      ${chrome.footer}
      ${chrome.cookie}
      ${chrome.modal}
    </div>
  `;
}

function searchText(...parts) {
  return escapeHtml(parts.join(" ").toLowerCase());
}

export function renderHelpPage(chrome) {
  return `
    <div class="foresee-shell marketing-shell info-page">
      ${renderInfoHeader(chrome)}
      <section class="info-hero info-hero-compact">
        <div class="marketing-eyebrow">Help center</div>
        <h1>How can we help?</h1>
        <label class="info-search">
          <span class="sr-only">Search help</span>
          <input type="search" placeholder="Search, like “bank” or “delete”" data-info-search="help" autocomplete="off" />
        </label>
      </section>
      <div class="info-search-results" data-info-results="help">
        ${HELP_SECTIONS.map((section) => `
          <section class="info-section" data-info-group>
            <h2>${escapeHtml(section.title)}</h2>
            <div class="info-faq">
              ${section.articles.map(([question, answer]) => `
                <details class="info-article" data-search-text="${searchText(question, answer)}">
                  <summary>${escapeHtml(question)}</summary>
                  <p>${escapeHtml(answer)}${/what pam stores/i.test(answer) ? ` <a href="/privacy-plain">Read it here.</a>` : ""}</p>
                </details>
              `).join("")}
            </div>
          </section>
        `).join("")}
        <p class="info-empty" data-info-empty hidden>Nothing matches that. Try another word, or email <a href="mailto:hello@pamadvisor.com">hello@pamadvisor.com</a>.</p>
      </div>
      <section class="info-section info-card info-contact">
        <div>
          <h2>Still stuck?</h2>
          <p>Email <a href="mailto:hello@pamadvisor.com">hello@pamadvisor.com</a> and a person will answer. New to the vocabulary? The <a href="/glossary">money terms glossary</a> explains it in plain English.</p>
        </div>
      </section>
      ${chrome.footer}
      ${chrome.cookie}
      ${chrome.modal}
    </div>
  `;
}

export function renderGlossaryPage(chrome) {
  const letters = [...new Set(GLOSSARY.map(([term]) => (/[a-z]/i.test(term[0]) ? term[0].toUpperCase() : "#")))];
  return `
    <div class="foresee-shell marketing-shell info-page">
      ${renderInfoHeader(chrome)}
      <section class="info-hero info-hero-compact">
        <div class="marketing-eyebrow">Money terms</div>
        <h1>Plain English for the words PAM uses.</h1>
        <label class="info-search">
          <span class="sr-only">Search terms</span>
          <input type="search" placeholder="Search, like “APR” or “Roth”" data-info-search="glossary" autocomplete="off" />
        </label>
        <nav class="glossary-letters" aria-label="Jump to letter">
          ${letters.map((letter) => `<a href="#glossary-${letter === "#" ? "num" : letter.toLowerCase()}">${letter}</a>`).join("")}
        </nav>
      </section>
      <div class="info-search-results" data-info-results="glossary">
        <dl class="glossary-list">
          ${GLOSSARY.map(([term, definition], index) => {
            const letter = /[a-z]/i.test(term[0]) ? term[0].toUpperCase() : "#";
            const first = index === GLOSSARY.findIndex(([other]) => (/[a-z]/i.test(other[0]) ? other[0].toUpperCase() : "#") === letter);
            return `
              <div class="glossary-entry" id="${glossaryAnchor(term)}" data-search-text="${searchText(term, definition)}">
                ${first ? `<span class="glossary-letter-anchor" id="glossary-${letter === "#" ? "num" : letter.toLowerCase()}"></span>` : ""}
                <dt>${escapeHtml(term)}</dt>
                <dd>${escapeHtml(definition)}</dd>
              </div>
            `;
          }).join("")}
        </dl>
        <p class="info-empty" data-info-empty hidden>No term matches that. Ask PAM about it instead, or email <a href="mailto:hello@pamadvisor.com">hello@pamadvisor.com</a>.</p>
      </div>
      <p class="info-note info-glossary-note">Definitions are general and educational, not advice. Rules like income limits change; check current figures before acting.</p>
      ${chrome.footer}
      ${chrome.cookie}
      ${chrome.modal}
    </div>
  `;
}

// In-place search: filters items without re-rendering the page.
export function wireInfoPages(root = document) {
  root.querySelectorAll("[data-info-search]").forEach((input) => {
    const results = root.querySelector(`[data-info-results="${input.dataset.infoSearch}"]`);
    if (!results) return;
    input.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      let shown = 0;
      results.querySelectorAll("[data-search-text]").forEach((item) => {
        const match = !query || item.dataset.searchText.includes(query);
        item.hidden = !match;
        if (match) shown += 1;
        if (query && match && item.tagName === "DETAILS") item.open = true;
        if (!query && item.tagName === "DETAILS") item.open = false;
      });
      results.querySelectorAll("[data-info-group]").forEach((group) => {
        group.hidden = !group.querySelector("[data-search-text]:not([hidden])");
      });
      const empty = results.querySelector("[data-info-empty]");
      if (empty) empty.hidden = shown > 0;
    });
  });
  root.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", async () => {
      const source = document.getElementById(button.dataset.copyTarget);
      if (!source) return;
      try {
        await navigator.clipboard.writeText(source.textContent);
        button.textContent = "Copied";
      } catch (_error) {
        const range = document.createRange();
        range.selectNodeContents(source);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        button.textContent = "Selected. Press copy.";
      }
      window.setTimeout(() => { button.textContent = "Copy text"; }, 2200);
    });
  });
}
