// The website's line icons (frontend/src/components/Icons.jsx), drawn with react-native-svg.
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { C } from '../theme';

const Icon = ({ size = 22, color = C.ink, width = 2, children }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </Svg>
);

export const Bag = p => <Icon {...p}><Path d="M6 7h12l1 13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1L6 7Z" /><Path d="M9 7V6a3 3 0 0 1 6 0v1" /></Icon>;
export const User = p => <Icon {...p}><Circle cx="12" cy="8" r="4" /><Path d="M4 21a8 8 0 0 1 16 0" /></Icon>;
export const Search = p => <Icon {...p}><Circle cx="11" cy="11" r="7" /><Path d="m20 20-3.5-3.5" /></Icon>;
export const Close = p => <Icon {...p}><Path d="M18 6 6 18M6 6l12 12" /></Icon>;
export const MapPin = p => <Icon {...p}><Path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" /><Circle cx="12" cy="10" r="2.5" /></Icon>;
export const Wallet = p => <Icon {...p}><Path d="M20 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6" /><Path d="M16 14h.01" /></Icon>;
export const Receipt = p => <Icon {...p}><Path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3Z" /><Path d="M9 8h6M9 12h6" /></Icon>;
export const ChevronRight = p => <Icon {...p}><Path d="m9 6 6 6-6 6" /></Icon>;
export const ChevronDown = p => <Icon {...p}><Path d="m6 9 6 6 6-6" /></Icon>;
export const Check = p => <Icon {...p}><Path d="M20 6 9 17l-5-5" /></Icon>;
export const Gift = p => <Icon {...p}><Rect x="3" y="8" width="18" height="4" rx="1" /><Path d="M12 8v13M19 12v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" /></Icon>;
export const Phone = p => <Icon {...p}><Path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" /></Icon>;
export const Mail = p => <Icon {...p}><Rect x="2" y="4" width="20" height="16" rx="2" /><Path d="m22 7-10 6L2 7" /></Icon>;
export const Home = p => <Icon {...p}><Path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" /></Icon>;
export const Tag = p => <Icon {...p}><Path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><Circle cx="7.5" cy="7.5" r="1.5" /></Icon>;
export const Alert = p => <Icon {...p}><Circle cx="12" cy="12" r="9" /><Path d="M12 8v5M12 16h.01" /></Icon>;
export const Back = p => <Icon {...p}><Path d="M19 12H5M12 19l-7-7 7-7" /></Icon>;
