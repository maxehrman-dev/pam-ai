const app = document.querySelector("#app");

function renderBootError(error) {
  if (!app) return;

  const detail =
    error instanceof Error && error.message
      ? error.message
      : "The app failed to load because one of its startup modules did not finish booting.";

  app.innerHTML = `
    <div class="page-shell">
      <main class="workspace-section">
        <div class="workspace-heading">
          <div>
            <p class="eyebrow">PAM AI</p>
            <h2>The simulator hit a startup issue.</h2>
          </div>
          <p>PAM AI could not finish loading the scenario engine. Refresh the page or redeploy the latest build.</p>
        </div>

        <section class="surface-panel" aria-live="polite">
          <div class="card-heading">
            <div>
              <p class="eyebrow">Boot status</p>
              <h3>Startup diagnostic</h3>
            </div>
          </div>
          <p class="scenario-summary">
            This usually means a missing module, a production-only runtime error, or a broken data dependency during
            first render.
          </p>
          <p class="scenario-summary subtle">${detail}</p>
          <div class="button-row">
            <button class="button button-primary" type="button" data-refresh-app>Refresh page</button>
          </div>
        </section>
      </main>
    </div>
  `;
}

async function boot() {
  if (!app) return;

  try {
    const module = await import("./main.js");
    if (typeof module.startApp !== "function") {
      throw new Error("Missing startApp export in src/main.js.");
    }
    await module.startApp();
  } catch (error) {
    console.error("PAM AI failed to boot.", error);
    renderBootError(error);
  }
}

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-refresh-app]")) {
    window.location.reload();
  }
});

boot();
