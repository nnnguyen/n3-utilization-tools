import { theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';

// The app's own design systems (claude.ai/design projects), each as an Ant
// Design theme in a light and a dark variant. The same values are exposed as
// CSS variables in app/globals.css — change them in both places.
//
// Both systems share one mapping onto antd (dsTheme below); a system only
// differs in its colors, type, radii and density.

type Ramp = Record<100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string>;

interface ModeColors {
  bg: string; // page ground
  surface: string; // cards, inputs, dialogs
  text: string;
  accent: string; // interactive elements
  primaryHover: string;
  primaryActive: string;
  link: string;
  linkHover: string;
  linkActive: string;
  textOnPrimary?: string; // label color on a solid accent fill (antd default: white)
  divider: string; // text at 16-18%
  rule: string; // text at 8-9%: table row rules
  inkHover: string; // ghost/secondary hover tint
  inkPressed: string;
  inkStrong: string; // input hover border
  inkHeader: string; // table header text
  inkRowHover: string;
  menuSelectedBg: string;
  menuSelectedColor: string;
  tagBg: string;
  tagColor: string;
  shadow: { sm: string; md: string; lg: string };
}

interface DesignSystem {
  fontFamily: string;
  buttonFontWeight: number;
  radius: { xs: number; sm: number; base: number; lg: number; container: number };
  // Pill-shaped buttons, fields, tags and segmented controls
  pill: boolean;
  // Density: the 4px antd base grid scaled by the system's density
  sizeUnit: number;
  light: ModeColors;
  dark: ModeColors;
}

// Broadsheet (project "Broadsheet"): newsprint for the web — near-black
// Source Serif 4 on paper, cyan for interaction and magenta as a rarer second
// spot color, 2px radius, airy 1.25x spacing.
export const broadsheetAccent: Ramp = {
  100: '#e9f8ff', 200: '#cbeeff', 300: '#99e0ff', 400: '#62c5ee', 500: '#38a6cf',
  600: '#1186ac', 700: '#006786', 800: '#004961', 900: '#0a303e',
};
const broadsheetNeutral: Ramp = {
  100: '#f8f4f4', 200: '#eae7e7', 300: '#d7d3d3', 400: '#bab6b6', 500: '#9b9797',
  600: '#7d7979', 700: '#605d5d', 800: '#444141', 900: '#2d2b2b',
};

// Light-ground ink (#201e1d) and the dark-ground paper ink both systems share
const lightInk = {
  divider: 'rgba(32, 30, 29, 0.16)',
  rule: 'rgba(32, 30, 29, 0.08)',
  inkHover: 'rgba(32, 30, 29, 0.07)',
  inkPressed: 'rgba(32, 30, 29, 0.14)',
  inkStrong: 'rgba(32, 30, 29, 0.45)',
  inkHeader: 'rgba(32, 30, 29, 0.6)',
  inkRowHover: 'rgba(32, 30, 29, 0.04)',
};
const darkShadow = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
  md: '0 3px 10px rgba(0, 0, 0, 0.45)',
  lg: '0 12px 32px rgba(0, 0, 0, 0.55)',
};

const broadsheet: DesignSystem = {
  // next/font variable first (self-hosted), then the family name and a serif fallback
  fontFamily: 'var(--font-source-serif), "Source Serif 4", Georgia, serif',
  buttonFontWeight: 600,
  radius: { xs: 1, sm: 1, base: 2, lg: 4, container: 4 },
  pill: false,
  sizeUnit: 5, // density 1.25x
  light: {
    bg: '#f3f2f2',
    surface: '#eae9e9',
    text: '#201e1d',
    accent: '#0088b0',
    // States go one ramp step darker on the light ground (not antd's lighter tint)
    primaryHover: broadsheetAccent[600],
    primaryActive: broadsheetAccent[700],
    link: '#0088b0',
    linkHover: broadsheetAccent[600],
    linkActive: broadsheetAccent[700],
    ...lightInk,
    // Tinted fill + deep ramp step for text on it
    menuSelectedBg: broadsheetAccent[100],
    menuSelectedColor: broadsheetAccent[700],
    tagBg: broadsheetNeutral[100],
    tagColor: broadsheetNeutral[800],
    shadow: {
      sm: '0 1px 2px rgba(45, 43, 43, 0.14)',
      md: '0 3px 10px rgba(45, 43, 43, 0.16)',
      lg: '0 12px 32px rgba(45, 43, 43, 0.22)',
    },
  },
  // Broadsheet ships no dark surfaces; derived from the same palette: warm
  // ink ground, paper-colored text, and the lighter accent step (500) so cyan
  // keeps its contrast. Primary buttons carry dark ink on cyan for the same reason.
  dark: {
    bg: '#191817',
    surface: '#242221',
    text: '#ece8e6',
    accent: broadsheetAccent[500],
    // On a dark ground the states step lighter ("400 on a dark one")
    primaryHover: broadsheetAccent[400],
    primaryActive: broadsheetAccent[300],
    link: broadsheetAccent[500],
    linkHover: broadsheetAccent[400],
    linkActive: broadsheetAccent[300],
    textOnPrimary: '#191817',
    divider: 'rgba(236, 232, 230, 0.18)',
    rule: 'rgba(236, 232, 230, 0.09)',
    inkHover: 'rgba(236, 232, 230, 0.08)',
    inkPressed: 'rgba(236, 232, 230, 0.15)',
    inkStrong: 'rgba(236, 232, 230, 0.45)',
    inkHeader: 'rgba(236, 232, 230, 0.6)',
    inkRowHover: 'rgba(236, 232, 230, 0.04)',
    menuSelectedBg: broadsheetAccent[900],
    menuSelectedColor: broadsheetAccent[300],
    tagBg: broadsheetNeutral[800],
    tagColor: broadsheetNeutral[200],
    shadow: darkShadow,
  },
};

// Organic (project "Organic"): warm, rounded and a little playful — cream and
// sand ground, terracotta accent, sage second accent, Caprasimo headings over
// Figtree (Fraunces / Be Vietnam Pro in Vietnamese, see globals.css), 16px
// radii that grow into pills, density 1.1x.
export const organicAccent: Ramp = {
  100: '#fff2eb', 200: '#ffe1d0', 300: '#ffc6a5', 400: '#f6a06b', 500: '#d67f48',
  600: '#b2622d', 700: '#8c491a', 800: '#643312', 900: '#402310',
};
const organicNeutral: Ramp = {
  100: '#f9f4ed', 200: '#eee7db', 300: '#dcd3c4', 400: '#c0b6a5', 500: '#a19786',
  600: '#82796a', 700: '#645c50', 800: '#474238', 900: '#2e2b25',
};

const organic: DesignSystem = {
  // CSS variable: the families follow the UI language (globals.css)
  fontFamily: 'var(--font-body)',
  buttonFontWeight: 400, // buttons use the display face, which has one weight
  // Containers (cards, dialogs) are over-rounded: radius-lg 28px x 1.15
  radius: { xs: 4, sm: 8, base: 16, lg: 16, container: 32 },
  pill: true,
  sizeUnit: 4.4,
  light: {
    bg: '#f5ead8',
    surface: '#ebddc5',
    text: '#201e1d',
    accent: '#c67139',
    primaryHover: organicAccent[600],
    primaryActive: organicAccent[700],
    // The accent only reaches 3:1 on the ground: text-size links take a deep step
    link: organicAccent[700],
    linkHover: organicAccent[800],
    linkActive: organicAccent[900],
    textOnPrimary: '#f5ead8',
    ...lightInk,
    menuSelectedBg: organicAccent[100],
    menuSelectedColor: organicAccent[700],
    tagBg: organicNeutral[100],
    tagColor: organicNeutral[800],
    shadow: {
      sm: '0 1px 2px rgba(46, 43, 37, 0.14)',
      md: '0 3px 10px rgba(46, 43, 37, 0.16)',
      lg: '0 12px 32px rgba(46, 43, 37, 0.22)',
    },
  },
  // Organic ships no dark variant either; derived the same way: a deep warm
  // brown ground, cream text, the 500 terracotta stepping lighter on states
  dark: {
    bg: '#1c1915',
    surface: '#28231d',
    text: '#f1e6d4',
    accent: organicAccent[500],
    primaryHover: organicAccent[400],
    primaryActive: organicAccent[300],
    link: organicAccent[400],
    linkHover: organicAccent[300],
    linkActive: organicAccent[200],
    textOnPrimary: '#1c1915',
    divider: 'rgba(241, 230, 212, 0.18)',
    rule: 'rgba(241, 230, 212, 0.09)',
    inkHover: 'rgba(241, 230, 212, 0.08)',
    inkPressed: 'rgba(241, 230, 212, 0.15)',
    inkStrong: 'rgba(241, 230, 212, 0.45)',
    inkHeader: 'rgba(241, 230, 212, 0.6)',
    inkRowHover: 'rgba(241, 230, 212, 0.04)',
    menuSelectedBg: organicAccent[900],
    menuSelectedColor: organicAccent[300],
    tagBg: organicNeutral[800],
    tagColor: organicNeutral[200],
    shadow: darkShadow,
  },
};

function dsTheme(ds: DesignSystem, mode: 'light' | 'dark'): ThemeConfig {
  const c = ds[mode];
  const field = { colorBgContainer: c.surface, hoverBorderColor: c.inkStrong, activeBorderColor: c.accent };
  const pill = ds.pill ? { borderRadius: 999, borderRadiusLG: 999, borderRadiusSM: 999 } : {};
  return {
    ...(mode === 'dark' ? { algorithm: antdTheme.darkAlgorithm } : {}),
    token: {
      colorPrimary: c.accent,
      colorInfo: c.accent,
      colorLink: c.link,
      colorPrimaryHover: c.primaryHover,
      colorPrimaryActive: c.primaryActive,
      colorLinkHover: c.linkHover,
      colorLinkActive: c.linkActive,
      ...(c.textOnPrimary ? { colorTextLightSolid: c.textOnPrimary } : {}),
      colorText: c.text,
      colorTextHeading: c.text,
      colorBgLayout: c.bg,
      colorBgContainer: c.bg,
      colorBgElevated: c.surface,
      colorBorder: c.divider,
      colorBorderSecondary: c.rule,
      colorSplit: c.rule,
      fontFamily: ds.fontFamily,
      fontSize: 15,
      borderRadius: ds.radius.base,
      borderRadiusXS: ds.radius.xs,
      borderRadiusSM: ds.radius.sm,
      borderRadiusLG: ds.radius.lg,
      sizeUnit: ds.sizeUnit,
      sizeStep: ds.sizeUnit,
      controlHeight: 36,
      boxShadow: c.shadow.md,
      boxShadowSecondary: c.shadow.lg,
      boxShadowTertiary: c.shadow.sm,
    },
    components: {
      Layout: { headerBg: c.bg, siderBg: c.bg, bodyBg: c.bg },
      Menu: {
        // No rule between the sidebar and the page: separated by whitespace
        activeBarBorderWidth: 0,
        itemBg: 'transparent',
        subMenuItemBg: 'transparent',
        popupBg: c.surface,
        itemHoverBg: c.inkHover,
        itemSelectedBg: c.menuSelectedBg,
        itemSelectedColor: c.menuSelectedColor,
      },
      Button: {
        fontWeight: ds.buttonFontWeight,
        contentFontSize: 14,
        primaryShadow: 'none',
        defaultShadow: 'none',
        // Secondary buttons: hairline border, ink tint on hover (not antd's blue border)
        defaultBg: 'transparent',
        defaultHoverBg: c.inkHover,
        defaultHoverBorderColor: c.divider,
        defaultHoverColor: c.text,
        defaultActiveBg: c.inkPressed,
        defaultActiveBorderColor: c.divider,
        defaultActiveColor: c.text,
        ...pill,
      },
      // (A pill TextArea is squared off again in globals.css)
      Input: { ...field, ...pill },
      InputNumber: { ...field, ...pill },
      Select: { ...field, ...pill },
      DatePicker: { ...field, ...pill },
      // The one boxed component: surface fill, no border
      Card: {
        colorBgContainer: c.surface,
        colorBorderSecondary: 'transparent',
        headerBg: 'transparent',
        borderRadiusLG: ds.radius.container,
      },
      Table: {
        // Tables sit in cards and dialogs (surface fill). A solid color, not
        // 'transparent': antd derives the sorted-column tint from it, and
        // transparent turns that column black
        colorBgContainer: c.surface,
        headerBg: 'transparent',
        headerColor: c.inkHeader,
        headerSplitColor: 'transparent',
        borderColor: c.rule,
        rowHoverBg: c.inkRowHover,
      },
      Modal: { contentBg: c.surface, headerBg: c.surface, titleFontSize: 20, borderRadiusLG: ds.radius.container },
      Tag: { defaultBg: c.tagBg, defaultColor: c.tagColor, ...(ds.pill ? { borderRadiusSM: 999 } : {}) },
      Segmented: {
        itemSelectedBg: c.accent,
        itemSelectedColor: c.bg,
        trackBg: c.inkHover,
        ...(ds.pill ? { borderRadius: 999, borderRadiusSM: 999, borderRadiusXS: 999 } : {}),
      },
    },
  };
}

// "Classic": Ant Design's own default look (sans-serif, #1677ff)
const classicLightTheme: ThemeConfig = {};
const classicDarkTheme: ThemeConfig = { algorithm: antdTheme.darkAlgorithm };

const THEMES = {
  broadsheet: { light: dsTheme(broadsheet, 'light'), dark: dsTheme(broadsheet, 'dark') },
  organic: { light: dsTheme(organic, 'light'), dark: dsTheme(organic, 'dark') },
  classic: { light: classicLightTheme, dark: classicDarkTheme },
};

export function buildTheme(style: keyof typeof THEMES, mode: 'light' | 'dark'): ThemeConfig {
  return (THEMES[style] ?? THEMES.broadsheet)[mode];
}

// Chart series color (SVG attributes can't read CSS variables)
export function chartAccent(style: keyof typeof THEMES, mode: 'light' | 'dark'): string {
  if (style === 'classic') return mode === 'dark' ? '#1668dc' : '#1677ff';
  const ds = style === 'organic' ? organic : broadsheet;
  return ds[mode].accent;
}
