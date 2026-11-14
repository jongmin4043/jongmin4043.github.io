(() => {
  const player = document.getElementById("music-player");
  const audio = document.getElementById("background-music");
  const toggle = document.getElementById("music-toggle");
  const volume = document.getElementById("music-volume");
  const status = document.getElementById("music-status");
  if (!player || !audio || !toggle || !volume || !status) return;

  let requested = false;
  let loading = false;
  let failed = false;
  let attempt = 0;
  let loadingTimer;
  const volumeKey = "jm-site-music-volume";

  const render = () => {
    const active = requested && (!audio.paused || loading);
    toggle.setAttribute("aria-pressed", String(active));
    const label = loading ? "Cancel loading music" : active ? "Pause background music" : "Play background music";
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
    player.classList.toggle("is-playing", requested && !audio.paused && !loading);
  };

  let initialVolume = 0.2;
  try {
    const stored = window.localStorage.getItem(volumeKey);
    if (stored !== null && stored.trim() !== "") {
      const value = Number(stored);
      if (Number.isFinite(value) && value >= 0 && value <= 1) initialVolume = value;
    }
  } catch (_error) {
    // Music controls remain usable when browser storage is unavailable.
  }
  audio.volume = initialVolume;
  volume.value = String(Math.round(initialVolume * 100));

  const showFailure = (message) => {
    clearTimeout(loadingTimer);
    requested = false;
    loading = false;
    failed = true;
    audio.pause();
    status.textContent = message;
    render();
  };

  toggle.addEventListener("click", async () => {
    const currentAttempt = ++attempt;
    if (requested) {
      clearTimeout(loadingTimer);
      requested = false;
      loading = false;
      audio.pause();
      status.textContent = "Paused";
      render();
      return;
    }

    requested = true;
    loading = true;
    status.textContent = "Loading music…";
    render();
    clearTimeout(loadingTimer);
    loadingTimer = setTimeout(() => {
      if (currentAttempt === attempt && loading) {
        ++attempt;
        showFailure("Connection timed out. Tap play to retry.");
      }
    }, 20000);

    // Fetch the recording only after an explicit click, never on page load.
    if (!audio.getAttribute("src") || failed) {
      failed = false;
      audio.src = audio.dataset.src;
      audio.load();
    }
    try {
      await audio.play();
      if (currentAttempt !== attempt || !requested) return;
      clearTimeout(loadingTimer);
      loading = false;
      status.textContent = "Now playing";
      render();
    } catch (error) {
      if (currentAttempt !== attempt) return;
      showFailure(error.name === "NotAllowedError"
        ? "Playback blocked. Tap play to retry."
        : "Audio unavailable. Tap play to retry.");
    }
  });

  audio.addEventListener("playing", () => {
    clearTimeout(loadingTimer);
    if (!requested) {
      audio.pause();
      return;
    }
    loading = false;
    status.textContent = "Now playing";
    render();
  });
  audio.addEventListener("waiting", () => {
    if (requested) {
      loading = true;
      status.textContent = "Buffering…";
      render();
    }
  });
  audio.addEventListener("pause", () => {
    if (!requested) return;
    clearTimeout(loadingTimer);
    requested = false;
    loading = false;
    status.textContent = "Paused";
    render();
  });
  audio.addEventListener("error", () => {
    ++attempt;
    showFailure("Audio unavailable. Tap play to retry.");
  });

  volume.addEventListener("input", () => {
    const value = Math.max(0, Math.min(100, Number(volume.value)));
    audio.volume = value / 100;
    try {
      window.localStorage.setItem(volumeKey, String(audio.volume));
    } catch (_error) {
      // Adjusting volume does not require persistent storage.
    }
  });

  const credits = player.querySelector(".music-credits");
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && credits.open) {
      credits.open = false;
      credits.querySelector("summary").focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (credits.open && !credits.contains(event.target)) credits.open = false;
  });

  render();
  player.hidden = false;
})();
