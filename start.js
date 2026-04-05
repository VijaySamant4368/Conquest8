const api = typeof browser !== "undefined" ? browser : chrome;
document.addEventListener("DOMContentLoaded", async () => {
  await api.storage.local.set({ pirateStage: 2 });
});