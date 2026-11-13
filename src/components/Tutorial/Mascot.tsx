import React from 'react';
import { createAvatar } from '@bible-strong/avatar-react';
import avatarJson from '../../assets/grok-bot.avatar.json';

// "Grok bot" avatar from Bible Strong Avatar Lab (MIT, @bible-strong/avatar-react). Validated once here.
const Bot = createAvatar(avatarJson);

export type MascotMood = 'sleeping' | 'idle' | 'listening' | 'thinking' | 'working' | 'happy' | 'proud' | 'celebrate';

export const Mascot: React.FC<{ mood: MascotMood; size?: number }> = ({ mood, size = 96 }) => (
  <div style={{
    width: size + 16, height: size + 16, borderRadius: '50%', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.95), rgba(165,180,252,0.55))',
    boxShadow: '0 10px 30px -8px rgba(79,70,229,0.45), inset 0 0 0 1px rgba(255,255,255,0.7)'
  }}>
    <Bot animation={mood} size={size} ariaLabel="StreamFusion assistant" />
  </div>
);
