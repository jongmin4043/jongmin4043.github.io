const applySiteTheme = (theme, { persist = false } = {}) => {
  const normalizedTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = normalizedTheme;

  if (persist) {
    try {
      window.localStorage.setItem("jm-site-theme", normalizedTheme);
    } catch (_error) {
      // The selected theme still applies to the current page when storage is unavailable.
    }
  }

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = normalizedTheme === "light" ? "#f5f7fb" : "#080a0f";

  const toggle = document.getElementById("theme-toggle");
  if (toggle) toggle.checked = normalizedTheme === "light";

  window.dispatchEvent(new CustomEvent("site-theme-change", {
    detail: { theme: normalizedTheme },
  }));
};

const initialSiteTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
applySiteTheme(initialSiteTheme);

const themeToggle = document.getElementById("theme-toggle");
if (themeToggle) {
  themeToggle.addEventListener("change", () => {
    applySiteTheme(themeToggle.checked ? "light" : "dark", { persist: true });
  });
}

window.addEventListener("storage", (event) => {
  if (event.key === "jm-site-theme") applySiteTheme(event.newValue === "light" ? "light" : "dark");
});

const revealItems = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12 }
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const sections = document.querySelectorAll("main section[id]");
const navLinks = document.querySelectorAll(".site-nav a");

const updateActiveNav = () => {
  const scrollPosition = window.scrollY + window.innerHeight * 0.35;
  let activeId = "";

  sections.forEach((section) => {
    if (scrollPosition >= section.offsetTop) activeId = section.id;
  });

  navLinks.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${activeId}`);
  });
};

window.addEventListener("scroll", updateActiveNav, { passive: true });
updateActiveNav();

const glow = document.querySelector(".cursor-glow");
const canTrackPointer = window.matchMedia("(pointer: fine)").matches;

if (canTrackPointer && glow) {
  window.addEventListener("pointermove", (event) => {
    glow.style.left = `${event.clientX}px`;
    glow.style.top = `${event.clientY}px`;
    glow.style.opacity = "1";
  });
}

document.getElementById("year").textContent = new Date().getFullYear();
