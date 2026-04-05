const api = typeof browser !== "undefined" ? browser : chrome;
const statusEl = document.getElementById("status");

document.getElementById("launch").addEventListener("click", async () => {
  await api.storage.local.set({ pirateStage: 1, pirateVisited: ["start"] });
  const url = api.runtime.getURL("start.html");
  if (api.tabs && api.tabs.create) {
    await api.tabs.create({ url });
  } else {
    window.open(url, "_blank");
  }
  statusEl.textContent = "Bon Voyage opened.";
});

document.getElementById("reset").addEventListener("click", async () => {
  await api.storage.local.set({ pirateStage: 1, pirateVisited: [] });
  statusEl.textContent = "Progress reset.";
});
