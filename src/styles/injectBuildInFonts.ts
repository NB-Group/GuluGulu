import browser from 'webextension-polyfill'

// Built-in @font-face rules. Injected into the Shadow DOM app root by
// contentScripts/index.ts so the fonts resolve inside the shadow tree.
// Family names are consumed by the `:host` font stack there.
export const builtInFontsCSS = `
  @font-face {
    font-family: "Numbers";
    unicode-range: U+0030-0039;
    src: url(${browser.runtime.getURL('/assets/fonts/Geist[wght].woff2')}) format("woff2-variations");
  }

  @font-face {
    font-family: "Onest";
    src: url(${browser.runtime.getURL('/assets/fonts/Onest[wght].woff2')}) format("woff2-variations");
  }

  /* Subsetted static instance (wght=400) of ShangguSansSC-VF, woff2.
     Coverage: ASCII + Latin + symbols + CJK punct + kana + CJK Ext A +
     full CJK Unified (U+4E00-9FFF). Rare chars fall through to system fonts. */
  @font-face {
    font-family: "ShangguSansSCVF";
    src: url(${browser.runtime.getURL('/assets/fonts/ShangguSansSC-Regular.woff2')}) format("woff2");
  }

  @font-face {
    font-family: "CJKEmDash";
    unicode-range: U+2014, U+2E3A-2E3B;
    src: url(${browser.runtime.getURL('/assets/fonts/ZhudouSansVF-subset.woff2')}) format("woff2-variations");
  }
`
