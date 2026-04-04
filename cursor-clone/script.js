document.addEventListener("DOMContentLoaded", function () {
  // Initialize Lucide icons
  lucide.createIcons();

  // Prompt card: handle contenteditable placeholder
  const promptInput = document.querySelector(".prompt-input");
  if (promptInput) {
    promptInput.addEventListener("focus", function () {
      if (this.textContent.trim() === "") this.textContent = "";
    });
    promptInput.addEventListener("blur", function () {
      if (this.textContent.trim() === "") this.textContent = "";
    });
  }

  // History items: show archive button on hover
  // (CSS handles the display toggle via .history-item:hover .history-archive)
  // Prevent archive clicks from navigating
  document.querySelectorAll(".history-archive").forEach(btn => {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      const item = this.closest(".history-item");
      if (item) {
        item.style.opacity = "0";
        item.style.transition = "opacity 0.2s";
        setTimeout(() => item.remove(), 200);
      }
    });
  });

  // Pill buttons: ripple feedback
  document.querySelectorAll(".pill-btn").forEach(btn => {
    btn.addEventListener("click", function () {
      const text = this.textContent;
      if (promptInput) {
        promptInput.textContent = text;
        promptInput.focus();
        // Move cursor to end
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(promptInput);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
  });

  // Nav items: active state
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", function (e) {
      document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
      this.classList.add("active");
    });
  });

  // Chat Page: Right Panel interactions
  const toggleContextBtn = document.getElementById("toggle-context-btn");
  const restoreContextBtn = document.getElementById("restore-context-btn");
  const appContainer = document.querySelector(".app-container");

  function togglePanel() {
    if (appContainer) {
      appContainer.classList.toggle("panel-hidden");
    }
  }

  if (toggleContextBtn) {
    toggleContextBtn.addEventListener("click", togglePanel);
  }
  if (restoreContextBtn) {
    restoreContextBtn.addEventListener("click", togglePanel);
  }

  // Maximize panel logic
  const btnMaximize = document.getElementById("btn-maximize");
  if (btnMaximize) {
    btnMaximize.addEventListener("click", function () {
      const appContainer = document.querySelector(".app-container");
      if (appContainer) {
        appContainer.classList.toggle("layout-maximized");
        
        // Toggle icon between maximize and collapse/minimize
        const icon = btnMaximize.querySelector("i");
        if (appContainer.classList.contains("layout-maximized")) {
          icon.setAttribute("data-lucide", "minimize-2");
          btnMaximize.setAttribute("title", "Collapse panel");
        } else {
          icon.setAttribute("data-lucide", "maximize-2");
          btnMaximize.setAttribute("title", "Expand panel");
        }
        lucide.createIcons();
      }
    });
  }

  // More options dropdown logic
  const btnMore = document.getElementById("btn-more");
  const moreDropdown = document.getElementById("more-dropdown");
  if (btnMore && moreDropdown) {
    btnMore.addEventListener("click", function (e) {
      e.stopPropagation(); // prevent document click from closing it immediately
      moreDropdown.classList.toggle("hidden");
    });
    
    // Close dropdown when clicking outside
    document.addEventListener("click", function (e) {
      if (!moreDropdown.contains(e.target) && !moreDropdown.classList.contains("hidden")) {
        moreDropdown.classList.add("hidden");
      }
    });
  }

  // Chat Page: Context Tabs active state
  document.querySelectorAll(".context-tab").forEach(tab => {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".context-tab").forEach(t => t.classList.remove("active"));
      this.classList.add("active");
    });
  });

  // Chat Page: Flow Tabs active state and content switching
  document.querySelectorAll(".flow-tab").forEach(tab => {
    tab.addEventListener("click", function () {
      // 1. Update tab styling
      document.querySelectorAll(".flow-tab").forEach(t => t.classList.remove("active"));
      this.classList.add("active");

      // 2. Update visible content
      const targetId = this.getAttribute("data-target");
      if (targetId) {
        document.querySelectorAll(".flow-content").forEach(content => {
          content.classList.remove("active");
        });
        const targetEl = document.getElementById(targetId);
        if (targetEl) targetEl.classList.add("active");
      }
    });
  });

  // User Profile Dropdown logic
  const userProfileBtn = document.getElementById("user-profile-btn");
  const userSettingsMenu = document.getElementById("user-settings-menu");

  if (userProfileBtn && userSettingsMenu) {
    userProfileBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      userSettingsMenu.classList.toggle("hidden");
    });

    document.addEventListener("click", function(e) {
      if (!userSettingsMenu.contains(e.target) && !userProfileBtn.contains(e.target)) {
        userSettingsMenu.classList.add("hidden");
      }
    });
  }

});
