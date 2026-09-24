import type { ThemeConfig } from 'antd';

// Broadsheet design system (claude.ai/design project "Broadsheet"): newsprint
// for the web — near-black Source Serif 4 on paper, cyan for interaction and
// magenta as a rarer second spot color, 2px radius, airy 1.25x spacing.
// Values mirror the design system's styles.css tokens; the same values are
// exposed as CSS variables in app/globals.css. Change them in both places.
export const broadsheet = {
  bg: '#f3f2f2', // paper ground
  surface: '#eae9e9', // cards, inputs, dialogs
  text: '#201e1d',
  accent: '#0088b0', // cyan: interactive elements
  accent2: '#d6006c', // magenta: the rarer second spot color
  divider: 'rgba(32, 30, 29, 0.16)', // text at 16%
  rule: 'rgba(32, 30, 29, 0.08)', // text at 8%: table row rules
  inkHover: 'rgba(32, 30, 29, 0.07)', // ghost/secondary hover tint
  inkPressed: 'rgba(32, 30, 29, 0.14)',
  accentRamp: {
    100: '#e9f8ff', 200: '#cbeeff', 300: '#99e0ff', 400: '#62c5ee', 500: '#38a6cf',
    600: '#1186ac', 700: '#006786', 800: '#004961', 900: '#0a303e',
  },
  neutralRamp: {
    100: '#f8f4f4', 200: '#eae7e7', 300: '#d7d3d3', 400: '#bab6b6', 500: '#9b9797',
    600: '#7d7979', 700: '#605d5d', 800: '#444141', 900: '#2d2b2b',
  },
  shadow: {
    sm: '0 1px 2px rgba(45, 43, 43, 0.14)',
    md: '0 3px 10px rgba(45, 43, 43, 0.16)',
    lg: '0 12px 32px rgba(45, 43, 43, 0.22)',
  },
  // next/font variable first (self-hosted), then the family name and a serif fallback
  fontFamily: 'var(--font-source-serif), "Source Serif 4", Georgia, serif',
} as const;

const b = broadsheet;

export const broadsheetTheme: ThemeConfig = {
  token: {
    colorPrimary: b.accent,
    colorInfo: b.accent,
    colorLink: b.accent,
    // States go one ramp step darker on the light ground (not antd's lighter tint)
    colorPrimaryHover: b.accentRamp[600],
    colorPrimaryActive: b.accentRamp[700],
    colorLinkHover: b.accentRamp[600],
    colorLinkActive: b.accentRamp[700],
    colorText: b.text,
    colorTextHeading: b.text,
    colorBgLayout: b.bg,
    colorBgContainer: b.bg,
    colorBgElevated: b.surface,
    colorBorder: b.divider,
    colorBorderSecondary: b.rule,
    colorSplit: b.rule,
    fontFamily: b.fontFamily,
    fontSize: 15,
    borderRadius: 2,
    borderRadiusXS: 1,
    borderRadiusSM: 1,
    borderRadiusLG: 4,
    // Density 1.25x: the 4px base grid becomes 5px
    sizeUnit: 5,
    sizeStep: 5,
    controlHeight: 36,
    boxShadow: b.shadow.md,
    boxShadowSecondary: b.shadow.lg,
    boxShadowTertiary: b.shadow.sm,
  },
  components: {
    Layout: { headerBg: b.bg, siderBg: b.bg, bodyBg: b.bg },
    Menu: {
      // No rule between the sidebar and the page: Broadsheet separates with whitespace
      activeBarBorderWidth: 0,
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      popupBg: b.surface,
      itemHoverBg: b.inkHover,
      // Tinted fill + deep ramp step for text on it
      itemSelectedBg: b.accentRamp[100],
      itemSelectedColor: b.accentRamp[700],
    },
    Button: {
      fontWeight: 600,
      contentFontSize: 14,
      primaryShadow: 'none',
      defaultShadow: 'none',
      // Secondary buttons: hairline border, ink tint on hover (not antd's blue border)
      defaultBg: 'transparent',
      defaultHoverBg: b.inkHover,
      defaultHoverBorderColor: b.divider,
      defaultHoverColor: b.text,
      defaultActiveBg: b.inkPressed,
      defaultActiveBorderColor: b.divider,
      defaultActiveColor: b.text,
    },
    Input: { colorBgContainer: b.surface, hoverBorderColor: 'rgba(32, 30, 29, 0.45)', activeBorderColor: b.accent },
    InputNumber: { colorBgContainer: b.surface, hoverBorderColor: 'rgba(32, 30, 29, 0.45)', activeBorderColor: b.accent },
    Select: { colorBgContainer: b.surface, hoverBorderColor: 'rgba(32, 30, 29, 0.45)', activeBorderColor: b.accent },
    DatePicker: { colorBgContainer: b.surface, hoverBorderColor: 'rgba(32, 30, 29, 0.45)', activeBorderColor: b.accent },
    // The one boxed component: surface fill, no border
    Card: { colorBgContainer: b.surface, colorBorderSecondary: 'transparent', headerBg: 'transparent' },
    Table: {
      // Tables sit in cards and dialogs (surface fill). A solid color, not
      // 'transparent': antd derives the sorted-column tint from it, and
      // transparent turns that column black
      colorBgContainer: b.surface,
      headerBg: 'transparent',
      headerColor: 'rgba(32, 30, 29, 0.6)',
      headerSplitColor: 'transparent',
      borderColor: b.rule,
      rowHoverBg: 'rgba(32, 30, 29, 0.04)',
    },
    Modal: { contentBg: b.surface, headerBg: b.surface, titleFontSize: 20 },
    Tag: { defaultBg: b.neutralRamp[100], defaultColor: b.neutralRamp[800] },
    Segmented: { itemSelectedBg: b.accent, itemSelectedColor: b.bg, trackBg: b.inkHover },
  },
};
