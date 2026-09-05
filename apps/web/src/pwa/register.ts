export function registerServiceWorker(): void {
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        void reg.update();
      })
      .catch(() => {});

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }
}

