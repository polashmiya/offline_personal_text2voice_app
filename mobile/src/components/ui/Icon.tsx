import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeProvider';

/** Stroke icons (24×24 grid, Lucide-style shapes drawn for this app). */
const PATHS = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h5v-6h4v6h5V9.5'],
  mic: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3'],
  folder: ['M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z'],
  settings: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  restart: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5'],
  back: ['M11 19l-7-7 7-7', 'M20 19l-7-7 7-7'],
  forward: ['M13 5l7 7-7 7', 'M4 5l7 7-7 7'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'],
  share: ['M4 12v8h16v-8', 'M12 3v13', 'M7 8l5-5 5 5'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 15h10l1-15', 'M10 11v6', 'M14 11v6'],
  plus: ['M12 5v14', 'M5 12h14'],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  check: ['M5 12l5 5 9-9'],
  paste: ['M9 3h6v4H9z', 'M7 5H5v16h14V5h-2'],
  fileText: ['M14 3H6v18h12V7z', 'M14 3v4h4', 'M8 13h8', 'M8 17h8'],
  chevronRight: ['M9 6l6 6-6 6'],
  pencil: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  alert: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'],
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  redo: ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
  music: ['M9 18V5l12-2v13', 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', 'M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z', 'M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5'],
  storage: ['M22 12H2', 'M5.5 5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-7z', 'M6 16h.01', 'M10 16h.01'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  wave: ['M2 12h2', 'M6 8v8', 'M10 4v16', 'M14 7v10', 'M18 10v4', 'M22 12h0'],
  upload: ['M12 21V9', 'M7 14l5-5 5 5', 'M5 3h14'],
  star: ['M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z'],
  globe: ['M2 12h20', 'M12 2a15 15 0 0 1 0 20', 'M12 2a15 15 0 0 0 0 20'],
  palette: ['M12 22a10 10 0 1 1 10-10c0 2.2-1.8 3-4 3h-2a2 2 0 0 0-1.5 3.3A2 2 0 0 1 12 22z'],
  speed: ['M12 14l4-4', 'M3.3 19a10 10 0 1 1 17.4 0'],
  select: ['M4 4h4', 'M4 4v4', 'M20 4h-4', 'M20 4v4', 'M4 20h4', 'M4 20v-4', 'M20 20h-4', 'M20 20v-4'],
} as const;

export type IconName = keyof typeof PATHS | 'play' | 'pause' | 'info' | 'search' | 'person' | 'more';

type Props = { name: IconName; size?: number; color?: string; strokeWidth?: number };

export function Icon({ name, size = 24, color, strokeWidth = 2 }: Props) {
  const { colors } = useTheme();
  const stroke = color ?? colors.text;
  const common = {
    stroke,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  let body: React.ReactNode;
  switch (name) {
    case 'play':
      body = <Path d="M7 4.5v15l13-7.5z" fill={stroke} stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />;
      break;
    case 'pause':
      body = (
        <>
          <Rect x={6} y={4.5} width={4} height={15} rx={1} fill={stroke} />
          <Rect x={14} y={4.5} width={4} height={15} rx={1} fill={stroke} />
        </>
      );
      break;
    case 'info':
      body = (
        <>
          <Circle cx={12} cy={12} r={10} {...common} />
          <Path d="M12 16v-4" {...common} />
          <Path d="M12 8h.01" {...common} />
        </>
      );
      break;
    case 'search':
      body = (
        <>
          <Circle cx={11} cy={11} r={7} {...common} />
          <Path d="M21 21l-4.3-4.3" {...common} />
        </>
      );
      break;
    case 'person':
      body = (
        <>
          <Circle cx={12} cy={8} r={4} {...common} />
          <Path d="M4 21a8 8 0 0 1 16 0" {...common} />
        </>
      );
      break;
    case 'more':
      body = (
        <>
          <Circle cx={12} cy={5} r={1.6} fill={stroke} />
          <Circle cx={12} cy={12} r={1.6} fill={stroke} />
          <Circle cx={12} cy={19} r={1.6} fill={stroke} />
        </>
      );
      break;
    default:
      body = PATHS[name].map(d => <Path key={d} d={d} {...common} />);
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {body}
    </Svg>
  );
}
