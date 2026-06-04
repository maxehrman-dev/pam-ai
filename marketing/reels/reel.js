const SCRIPTS = [
  {
    hook: "I asked ChatGPT if I could afford to move out.",
    q: "Can I afford to move out if rent is $1,800?",
    vague: "It depends on your overall budget, income, and savings. Generally aim to keep rent under 30% of income…",
    transition: "So I asked PAM — connected to my real bank.",
    result: {
      title: "Rent $1,800/mo",
      stats: [
        ["Monthly buffer", "$1,270 → $640", "warn"],
        ["Risk", "Medium", "warn"],
        ["Move-out fund", "delayed 4 months", "bad"]
      ]
    }
  },
  {
    hook: "Everyone says don't buy the car. I wanted a real answer.",
    q: "Can I afford a $400/month car payment?",
    vague: "Consider the total cost of ownership, interest rates, and your monthly budget before deciding…",
    transition: "PAM ran it on my actual accounts.",
    result: {
      title: "$400/mo car payment",
      stats: [
        ["Affordable?", "Yes — barely", "warn"],
        ["Emergency fund", "stalls 7 months", "bad"],
        ["Monthly buffer", "$1,270 → $870", "warn"]
      ]
    }
  },
  {
    hook: "Pay off debt or start investing? ChatGPT couldn't really say.",
    q: "Should I pay off debt or invest $200/mo?",
    vague: "Both have merits. It depends on your interest rates and risk tolerance and time horizon…",
    transition: "PAM used my real numbers.",
    result: {
      title: "Debt vs investing",
      stats: [
        ["Your debt rate", "22% APR", "bad"],
        ["Best move", "Debt first", "warn"],
        ["Saves you", "~$1,900/yr", "good"]
      ]
    }
  }
];

const stage = document.getElementById("stage");
const progress = document.getElementById("progress");
let timers = [];

function clearTimers(){ timers.forEach(t=>clearTimeout(t)); timers=[]; }

function statClass(c){ return c==="bad"?"bad":c==="warn"?"warn":"good"; }

function build(s){
  return `
  <div class="scene hook" data-i="0">
    <div class="kicker">PAM AI</div>
    <div class="big">${s.hook}</div>
  </div>

  <div class="scene chat" data-i="1">
    <div class="phone">
      <div class="phone-bar"><div class="dot" style="background:#10a37f"></div><div class="phone-title">ChatGPT</div></div>
      <div class="phone-body">
        <div class="bubble me">${s.q}</div>
        <div class="bubble them vague">${s.vague}</div>
      </div>
    </div>
  </div>

  <div class="scene transition" data-i="2">
    <div class="pam-mark">PAM</div>
    <div class="big">${s.transition}</div>
  </div>

  <div class="scene pam" data-i="3">
    <div class="pam-card">
      <div class="label reveal">PAM result</div>
      <h2 class="reveal">${s.result.title}</h2>
      ${s.result.stats.map(([k,v,c])=>`<div class="stat reveal"><span>${k}</span><strong class="${statClass(c)}">${v}</strong></div>`).join("")}
    </div>
  </div>

  <div class="scene endcard" data-i="4">
    <div class="pam-mark">PAM</div>
    <div class="big">Know what you can<br>actually afford.</div>
    <div class="url">pamadvisor.com</div>
  </div>`;
}

// scene durations (ms)
const DUR = [2600, 4200, 2400, 5200, 3200];

function play(idx){
  clearTimers();
  stage.querySelectorAll(".scene").forEach(n=>n.remove());
  stage.insertAdjacentHTML("beforeend", build(SCRIPTS[idx]));
  const scenes = [...stage.querySelectorAll(".scene")];
  const total = DUR.reduce((a,b)=>a+b,0);
  progress.style.transition="none"; progress.style.width="0";
  requestAnimationFrame(()=>{ progress.style.transition=`width ${total}ms linear`; progress.style.width="100%"; });
  let t=0;
  scenes.forEach((sc,i)=>{
    timers.push(setTimeout(()=>{
      scenes.forEach(x=>x.classList.remove("active"));
      sc.classList.add("active");
    }, t));
    t+=DUR[i];
  });
  // loop
  timers.push(setTimeout(()=>play(idx), total+400));
}

function fit(){
  const recording = document.body.classList.contains("recording");
  const availH = recording ? window.innerHeight : window.innerHeight - 90;
  const availW = window.innerWidth;
  const scale = Math.min(availW/1080, availH/1920);
  stage.style.transform = `scale(${scale})`;
  document.querySelector(".stage-wrap").style.height = (1920*scale)+"px";
  document.querySelector(".stage-wrap").style.width = (1080*scale)+"px";
}

function toggleRecord(){
  document.body.classList.toggle("recording");
  fit();
}

window.addEventListener("resize", fit);
fit();
play(0);
