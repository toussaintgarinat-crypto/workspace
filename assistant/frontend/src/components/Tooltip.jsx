import { useState, useRef } from 'react';

const POSITIONS = {
  top:    { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' },
  bottom: { top:    'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' },
  left:   { right:  'calc(100% + 8px)', top:  '50%', transform: 'translateY(-50%)' },
  right:  { left:   'calc(100% + 8px)', top:  '50%', transform: 'translateY(-50%)' },
};

const tipStyle = (position) => ({
  position: 'absolute',
  ...POSITIONS[position] || POSITIONS.top,
  background: '#1a1a1a',
  border: '1px solid #333',
  borderRadius: '6px',
  color: '#c0c0c0',
  fontSize: '11px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  padding: '5px 9px',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  zIndex: 9999,
  lineHeight: '1.3',
  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
});

export default function Tooltip({ label, position = 'top', children, style }) {
  const [visible, setVisible] = useState(false);
  const pressTimer = useRef(null);
  const hideTimer = useRef(null);

  if (!label) return children;

  const show = () => {
    clearTimeout(hideTimer.current);
    setVisible(true);
  };
  const hide = () => {
    clearTimeout(pressTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 80);
  };

  const onTouchStart = (e) => {
    pressTimer.current = setTimeout(() => {
      setVisible(true);
      hideTimer.current = setTimeout(() => setVisible(false), 2000);
    }, 500);
  };
  const onTouchEnd = () => {
    clearTimeout(pressTimer.current);
  };
  const onTouchMove = () => {
    clearTimeout(pressTimer.current);
    setVisible(false);
  };

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', ...style }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
    >
      {children}
      {visible && <div style={tipStyle(position)}>{label}</div>}
    </div>
  );
}
