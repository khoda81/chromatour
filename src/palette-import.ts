import { parseHexColors, queueImportedPalette } from "./colors";

const form = document.querySelector<HTMLFormElement>("#palette-import-form");
const input = document.querySelector<HTMLTextAreaElement>("#palette-input");
const status = document.querySelector<HTMLElement>("#palette-import-status");
const colorCount = document.querySelector<HTMLInputElement>("#color-count");

if (form && input && status && colorCount) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();

    try {
      const colors = parseHexColors(input.value);
      const min = Number(colorCount.min);
      const max = Number(colorCount.max);

      if (colors.length < min || colors.length > max) {
        throw new Error(`Import between ${min} and ${max} colors.`);
      }

      queueImportedPalette(colors);
      colorCount.value = String(colors.length);
      colorCount.dispatchEvent(new Event("input", { bubbles: true }));

      status.dataset.state = "success";
      status.textContent = `Imported ${colors.length} colors.`;
    } catch (error: unknown) {
      status.dataset.state = "error";
      status.textContent =
        error instanceof Error ? error.message : "Could not import this palette.";
    }
  });

  input.addEventListener("input", () => {
    status.removeAttribute("data-state");
    status.textContent = "";
  });
}
