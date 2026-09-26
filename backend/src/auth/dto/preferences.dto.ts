import { IsBoolean, IsIn, IsOptional } from "class-validator";

export const THEME_STYLES = ["broadsheet", "organic", "classic"] as const;
export const THEME_MODES = ["light", "dark", "system"] as const;
export const LANGUAGES = ["vi", "en"] as const;

export class UpdatePreferencesDto {
  @IsIn(THEME_STYLES)
  @IsOptional()
  themeStyle?: (typeof THEME_STYLES)[number];

  @IsIn(THEME_MODES)
  @IsOptional()
  themeMode?: (typeof THEME_MODES)[number];

  @IsIn(LANGUAGES)
  @IsOptional()
  language?: (typeof LANGUAGES)[number];

  // Product analytics consent (P2-8); asked once after sign-in
  @IsBoolean()
  @IsOptional()
  analyticsConsent?: boolean;
}
