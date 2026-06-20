window.FamilyCreditsSelects = (() => {
  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function close(except = null) {
    document.querySelectorAll(".custom-select.open").forEach((select) => {
      if (select !== except) {
        select.classList.remove("open");
        select.querySelector(".custom-select-button")?.setAttribute("aria-expanded", "false");
      }
    });
  }

  function sync(wrapper) {
    const select = wrapper.previousElementSibling;
    const selected = select.options[select.selectedIndex] || select.options[0];
    wrapper.querySelector(".custom-select-value").textContent = selected?.textContent || "Select";
    wrapper.querySelectorAll(".custom-select-option").forEach((option) => {
      const isActive = option.dataset.value === select.value;
      option.classList.toggle("active", isActive);
      option.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  function optionsKey(select) {
    return [...select.options].map((option) => `${option.value}\u001f${option.textContent}`).join("\u001e");
  }

  function enhance({ root = document, wrapperClass = "" } = {}) {
    root.querySelectorAll("select").forEach((select, index) => {
      const existing = select.nextElementSibling?.classList.contains("custom-select") ? select.nextElementSibling : null;
      const key = optionsKey(select);
      if (existing?.dataset.key === key && existing.dataset.wrapperClass === wrapperClass) {
        sync(existing);
        return;
      }

      existing?.remove();
      select.classList.add("native-select-hidden");
      if (!select.id) select.id = `select-${index}`;

      const wrapper = document.createElement("div");
      wrapper.className = ["custom-select", wrapperClass].filter(Boolean).join(" ");
      wrapper.dataset.key = key;
      wrapper.dataset.wrapperClass = wrapperClass;
      wrapper.innerHTML = `
        <button class="custom-select-button focus-ring" type="button" role="combobox" aria-expanded="false" aria-controls="${select.id}-menu">
          <span class="custom-select-value"></span>
        </button>
        <div id="${select.id}-menu" class="custom-select-menu" role="listbox">
          ${[...select.options]
            .map(
              (option) => `
                <button class="custom-select-option" type="button" role="option" data-value="${escapeHtml(option.value)}">
                  <span>${escapeHtml(option.textContent)}</span>
                </button>
              `
            )
            .join("")}
        </div>
      `;
      select.insertAdjacentElement("afterend", wrapper);
      sync(wrapper);
    });
  }

  function onClick(event) {
    const toggle = event.target.closest(".custom-select-button");
    if (toggle) {
      const wrapper = toggle.closest(".custom-select");
      const shouldOpen = !wrapper.classList.contains("open");
      close(wrapper);
      wrapper.classList.toggle("open", shouldOpen);
      toggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      return;
    }

    const option = event.target.closest(".custom-select-option");
    if (option) {
      const wrapper = option.closest(".custom-select");
      const select = wrapper.previousElementSibling;
      select.value = option.dataset.value;
      sync(wrapper);
      close();
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    if (!event.target.closest(".custom-select")) close();
  }

  function onKeydown(event) {
    const wrapper = event.target.closest(".custom-select");
    if (!wrapper) return;

    const select = wrapper.previousElementSibling;
    const options = [...wrapper.querySelectorAll(".custom-select-option")];
    const currentIndex = Math.max(0, options.findIndex((option) => option.dataset.value === select.value));

    if (event.key === "Escape") {
      close();
      wrapper.querySelector(".custom-select-button")?.focus();
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      if (event.target.classList.contains("custom-select-button")) {
        event.preventDefault();
        wrapper.classList.add("open");
        event.target.setAttribute("aria-expanded", "true");
        options[currentIndex]?.focus();
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      wrapper.classList.add("open");
      wrapper.querySelector(".custom-select-button")?.setAttribute("aria-expanded", "true");
      const direction = event.key === "ArrowDown" ? 1 : -1;
      options[(currentIndex + direction + options.length) % options.length]?.focus();
    }
  }

  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeydown);

  return { enhance, close };
})();
