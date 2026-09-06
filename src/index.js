import { CosensePage } from "./cosense.js";
import { parsePlot } from "./parse.js";
import { openModal } from "./ui.js";

const ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#37474f"/><text x="16" y="21" font-family="sans-serif" font-size="11" font-weight="bold" fill="#fff" text-anchor="middle">CSP</text></svg>`,
  );

function main() {
  const cosensePage = new CosensePage();
  cosensePage.addMenu(
    "CLIPSTUDIO用に出力",
    ICON,
    () => {
      if (!cosensePage.isInPageView) {
        alert("ページを開いた状態で実行してください");
        return;
      }
      const result = parsePlot(cosensePage.toPlotLines());
      openModal(result, {
        source: {
          title: cosensePage.lines[0]?.text,
          url: window.location.href,
        },
      });
    },
  );
}

main();
