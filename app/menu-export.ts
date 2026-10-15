// SVG-based image export cannot load external URLs from cloned pseudo-element styles.
// Embed their artwork first, then restore the live preview after capture.
export async function prepareMenuArtworkForExport(node: HTMLElement) {
  const attribute = "data-menu-export-art";
  const sheet = document.createElement("style");
  const previous: Array<{ element: Element; value: string | null }> = [];
  const cache = new Map<string, string>();
  const restore = () => {
    sheet.remove();
    previous.forEach(({ element, value }) => value === null ? element.removeAttribute(attribute) : element.setAttribute(attribute, value));
  };
  try {
    const rules: string[] = [];
    for (const element of [node, ...node.querySelectorAll("*")]) {
      for (const pseudo of ["::before", "::after"]) {
        const style = getComputedStyle(element, pseudo);
        let image = style.backgroundImage;
        if (style.display === "none" || !image.includes("url(")) continue;
        for (const match of [...image.matchAll(/url\(["']?([^"')]+)["']?\)/g)]) {
          const url = match[1];
          if (url.startsWith("data:")) continue;
          if (!cache.has(url)) {
            const response = await fetch(url);
            if (!response.ok) throw new Error("菜单装饰图片暂时无法读取，请稍后重试");
            const blob = await response.blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(new Error("菜单图片读取失败"));
              reader.readAsDataURL(blob);
            });
            cache.set(url, dataUrl);
          }
          image = image.replace(match[0], `url("${cache.get(url)}")`);
        }
        let entry = previous.find(item => item.element === element);
        if (!entry) {
          entry = { element, value: element.getAttribute(attribute) };
          previous.push(entry);
          element.setAttribute(attribute, `art-${previous.length}`);
        }
        rules.push(`[${attribute}="${element.getAttribute(attribute)}"]${pseudo}{background-image:${image}!important}`);
      }
    }
    sheet.textContent = rules.join("\n");
    document.head.append(sheet);
    return restore;
  } catch (error) {
    restore();
    throw error;
  }
}
