import React from 'react';
import { Typography } from 'antd';

// Official brand assets, served from /public/brand. Keep them as-is:
//
// YouTube (https://brand.youtube/youtube-logo/, "Digital" PNGs from the
// official youtube-icon.zip / youtube-logo.zip, only the transparent margin
// cropped and the size reduced):
// - never alter the logo: no recoloring, outlines, shadows or effects
// - red is #FF0033 and the triangle is always white; the full-color logo with
//   Almost Black (#212121) text goes on white or light backgrounds
// - keep clear space around it (the width of the play triangle, about 1/4 of
//   the icon's width) free of other elements
// - replace the files when YouTube publishes an update; don't redraw them
//
// Zoom (Zoom Brand Center, https://brand.zoom.com/document/8, file
// Zoom_Logo_Bloom_RGB.svg, copied unchanged):
// - primary use is Bloom (#0B5CFF) on white; never recolor or restyle it
// - clear space is the height of the "Z" (half of it where space is tight)
// - only source it from the Brand Center, never from third-party logo sites

export function YoutubeIcon({ width = 20, style }: { width?: number; style?: React.CSSProperties }) {
  return (
    <img
      src="/brand/youtube/youtube-icon-red.png"
      alt="YouTube"
      width={width}
      height={Math.round((width * 42) / 60)}
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
    />
  );
}

export function YoutubeLogo({ height = 24, style }: { height?: number; style?: React.CSSProperties }) {
  return (
    <img
      src="/brand/youtube/youtube-logo-fullcolor-almostblack.png"
      alt="YouTube"
      height={height}
      width={Math.round((height * 322) / 72)}
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
    />
  );
}

export function ZoomLogo({ height = 22, style }: { height?: number; style?: React.CSSProperties }) {
  return (
    <img
      src="/brand/zoom/zoom-logo-bloom.svg"
      alt="Zoom"
      height={height}
      width={Math.round((height * 351.845) / 80)}
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
    />
  );
}

// Dark grey (Material Grey 800): one step lighter than the logo's Almost Black
// (#212121, Grey 900), so the page name reads as secondary to the logo
const PAGE_TITLE_COLOR = '#424242';

// Page heading: official brand logo + page name. The logo sits inside the <h2>
// so the heading still reads "<Brand> <title>" (alt text). The 14px gap covers
// YouTube's clear space (~10px at 26px) and Zoom's narrow clear space (11px at 22px).
function BrandPageTitle({ logo, title }: { logo: React.ReactNode; title: string }) {
  return (
    <Typography.Title
      level={2}
      style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 14, color: PAGE_TITLE_COLOR }}
    >
      {logo}
      {title}
    </Typography.Title>
  );
}

export function YoutubePageTitle({ title }: { title: string }) {
  return <BrandPageTitle logo={<YoutubeLogo height={26} />} title={title} />;
}

export function ZoomPageTitle({ title }: { title: string }) {
  return <BrandPageTitle logo={<ZoomLogo height={22} />} title={title} />;
}
