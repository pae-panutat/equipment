/**
 * After a form refuses to save, take the person to the field that needs fixing: scroll it into view, put the cursor in it and
 * outline it in red until they change it. `name` is the data-field value on the field's <label> (or on the control itself).
 */
export function focusField(name: string): void {
  // wait a moment so a form that is switching back from its "confirm" step has been drawn again
  setTimeout(() => {
    const wrap = document.querySelector<HTMLElement>(`[data-field="${name}"]`);
    if (!wrap) return;
    const el = wrap.matches("input, select, textarea, button[data-select]")
      ? wrap
      : wrap.querySelector<HTMLElement>("input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), button[data-select]:not([disabled])");
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: true });
    el.setAttribute("aria-invalid", "true");
    const clear = () => el.removeAttribute("aria-invalid");
    el.addEventListener("input", clear, { once: true });
    el.addEventListener("change", clear, { once: true });
  }, 60);
}
