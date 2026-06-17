"use client";
import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";

interface Props {
  name: string;
  title: string;
  outlet: string;
  accentColor: string;
  isSpeaking: boolean;
  isListening: boolean;
  avatarStyle: string;
}

// SVG Avatar faces — different journalists
const AVATAR_SVGS: Record<string, string> = {
  "professional-woman-dark": `
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#1a0a2e"/>
          <stop offset="100%" stop-color="#0d0618"/>
        </radialGradient>
        <radialGradient id="skin" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stop-color="#c68642"/>
          <stop offset="100%" stop-color="#a0522d"/>
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="100" fill="url(#bg)"/>
      <!-- Neck & shoulders -->
      <ellipse cx="100" cy="185" rx="52" ry="30" fill="#1a1a2e"/>
      <rect x="48" y="155" width="104" height="50" fill="#1a1a2e" rx="8"/>
      <!-- Suit lapels -->
      <polygon points="100,140 65,200 48,200" fill="#111"/>
      <polygon points="100,140 135,200 152,200" fill="#222"/>
      <!-- White shirt collar -->
      <polygon points="100,145 88,165 100,160 112,165" fill="#f0f0f0"/>
      <!-- Head -->
      <ellipse cx="100" cy="105" rx="42" ry="48" fill="url(#skin)"/>
      <!-- Hair -->
      <ellipse cx="100" cy="70" rx="42" ry="20" fill="#1a0a00"/>
      <path d="M58,90 Q55,70 65,60 Q80,50 100,50 Q120,50 135,60 Q145,70 142,90" fill="#1a0a00"/>
      <!-- Bun / updo -->
      <ellipse cx="100" cy="57" rx="28" ry="12" fill="#2a1000"/>
      <ellipse cx="100" cy="55" rx="14" ry="8" fill="#1a0a00"/>
      <!-- Eyes -->
      <ellipse cx="84" cy="105" rx="9" ry="7" fill="white"/>
      <ellipse cx="116" cy="105" rx="9" ry="7" fill="white"/>
      <circle cx="86" cy="106" r="5" fill="#3d2000"/>
      <circle cx="118" cy="106" r="5" fill="#3d2000"/>
      <circle cx="87" cy="104" r="2" fill="black"/>
      <circle cx="119" cy="104" r="2" fill="black"/>
      <!-- Highlight -->
      <circle cx="88" cy="103" r="1.2" fill="white"/>
      <circle cx="120" cy="103" r="1.2" fill="white"/>
      <!-- Eyebrows -->
      <path d="M75,97 Q84,93 93,97" stroke="#1a0a00" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M107,97 Q116,93 125,97" stroke="#1a0a00" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- Nose -->
      <path d="M97,110 Q95,120 100,122 Q105,120 103,110" stroke="#8b5e3c" stroke-width="1.5" fill="none"/>
      <!-- Mouth -->
      <path d="M88,132 Q100,140 112,132" stroke="#c0392b" stroke-width="2" fill="#e74c3c" stroke-linecap="round"/>
      <path d="M88,132 Q100,128 112,132" stroke="#922b21" stroke-width="1.5" fill="none"/>
      <!-- Earrings -->
      <circle cx="58" cy="110" r="4" fill="#e8b84b" opacity="0.9"/>
      <circle cx="142" cy="110" r="4" fill="#e8b84b" opacity="0.9"/>
    </svg>
  `,
  "professional-man-light": `
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bg2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#0a1628"/>
          <stop offset="100%" stop-color="#050c1a"/>
        </radialGradient>
        <radialGradient id="skin2" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stop-color="#f5cba7"/>
          <stop offset="100%" stop-color="#d4a574"/>
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="100" fill="url(#bg2)"/>
      <ellipse cx="100" cy="185" rx="55" ry="30" fill="#0d1b2a"/>
      <rect x="45" y="152" width="110" height="55" fill="#0d1b2a" rx="8"/>
      <!-- Suit -->
      <polygon points="100,142 60,200 45,200" fill="#0a1628"/>
      <polygon points="100,142 140,200 155,200" fill="#132238"/>
      <!-- Tie -->
      <polygon points="97,145 103,145 105,185 100,190 95,185" fill="#cc2936"/>
      <!-- White shirt -->
      <polygon points="100,148 90,168 100,162 110,168" fill="#f8f8f8"/>
      <!-- Head -->
      <ellipse cx="100" cy="105" rx="43" ry="49" fill="url(#skin2)"/>
      <!-- Hair — short dark -->
      <ellipse cx="100" cy="68" rx="43" ry="18" fill="#2c1810"/>
      <path d="M57,85 Q55,68 68,58 Q83,48 100,48 Q117,48 132,58 Q145,68 143,85" fill="#2c1810"/>
      <!-- Eyes -->
      <ellipse cx="84" cy="106" rx="9" ry="7" fill="white"/>
      <ellipse cx="116" cy="106" rx="9" ry="7" fill="white"/>
      <circle cx="86" cy="107" r="5" fill="#2c3e50"/>
      <circle cx="118" cy="107" r="5" fill="#2c3e50"/>
      <circle cx="87" cy="105" r="2" fill="black"/>
      <circle cx="119" cy="105" r="2" fill="black"/>
      <circle cx="88" cy="104" r="1.2" fill="white"/>
      <circle cx="120" cy="104" r="1.2" fill="white"/>
      <!-- Eyebrows -->
      <path d="M74,98 Q84,94 94,98" stroke="#2c1810" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M106,98 Q116,94 126,98" stroke="#2c1810" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- Nose -->
      <path d="M97,112 Q94,122 100,124 Q106,122 103,112" stroke="#c69070" stroke-width="1.5" fill="none"/>
      <!-- Mouth — slight smile -->
      <path d="M88,133 Q100,140 112,133" stroke="#c0392b" stroke-width="1.5" fill="#e8a090" stroke-linecap="round"/>
      <!-- Jawline / stubble hints -->
      <path d="M68,120 Q65,140 80,148 Q100,155 120,148 Q135,140 132,120" fill="rgba(180,140,100,0.15)"/>
    </svg>
  `,
  "professional-woman-light": `
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bg3" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#0f0a20"/>
          <stop offset="100%" stop-color="#080514"/>
        </radialGradient>
        <radialGradient id="skin3" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stop-color="#fde3cc"/>
          <stop offset="100%" stop-color="#e8c4a0"/>
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="100" fill="url(#bg3)"/>
      <ellipse cx="100" cy="185" rx="52" ry="30" fill="#0a0a18"/>
      <rect x="48" y="153" width="104" height="52" fill="#0a0a18" rx="8"/>
      <!-- Blazer dark blue -->
      <polygon points="100,140 62,200 46,200" fill="#12124a"/>
      <polygon points="100,140 138,200 154,200" fill="#1a1a5e"/>
      <!-- Blouse -->
      <polygon points="100,145 89,165 100,160 111,165" fill="#e8e0f5"/>
      <!-- Head -->
      <ellipse cx="100" cy="105" rx="42" ry="48" fill="url(#skin3)"/>
      <!-- Hair — straight blonde -->
      <ellipse cx="100" cy="68" rx="44" ry="20" fill="#c8a84b"/>
      <path d="M56,88 Q52,68 65,57 Q80,48 100,48 Q120,48 135,57 Q148,68 144,88" fill="#c8a84b"/>
      <!-- Side hair strands -->
      <path d="M58,90 Q50,120 55,150" stroke="#b8942a" stroke-width="8" fill="none" stroke-linecap="round"/>
      <path d="M142,90 Q150,120 145,150" stroke="#b8942a" stroke-width="8" fill="none" stroke-linecap="round"/>
      <!-- Eyes — blue -->
      <ellipse cx="84" cy="105" rx="9" ry="7" fill="white"/>
      <ellipse cx="116" cy="105" rx="9" ry="7" fill="white"/>
      <circle cx="86" cy="106" r="5" fill="#1a5276"/>
      <circle cx="118" cy="106" r="5" fill="#1a5276"/>
      <circle cx="87" cy="104" r="2" fill="black"/>
      <circle cx="119" cy="104" r="2" fill="black"/>
      <circle cx="88" cy="103" r="1.2" fill="white"/>
      <circle cx="120" cy="103" r="1.2" fill="white"/>
      <!-- Eyebrows -->
      <path d="M74,96 Q84,92 94,96" stroke="#8b6914" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M106,96 Q116,92 126,96" stroke="#8b6914" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- Nose -->
      <path d="M97,111 Q95,120 100,122 Q105,120 103,111" stroke="#c9956c" stroke-width="1.5" fill="none"/>
      <!-- Lips -->
      <path d="M88,131 Q100,139 112,131" stroke="#922b21" stroke-width="2" fill="#e74c3c" stroke-linecap="round"/>
      <path d="M88,131 Q100,127 112,131" stroke="#922b21" stroke-width="1" fill="none"/>
      <!-- Pearl earrings -->
      <circle cx="58" cy="109" r="5" fill="#f0f0f0"/>
      <circle cx="142" cy="109" r="5" fill="#f0f0f0"/>
    </svg>
  `,
};

export default function JournalistAvatar({
  name, title, outlet, accentColor, isSpeaking, isListening, avatarStyle
}: Props) {
  const [lipFrame, setLipFrame] = useState(0);
  const [waveAmps, setWaveAmps] = useState([0.3, 0.5, 0.7, 0.4, 0.6, 0.3, 0.8, 0.4]);
  const animRef = useRef<number>();

  useEffect(() => {
    if (isSpeaking) {
      const animate = () => {
        setLipFrame(f => (f + 1) % 6);
        setWaveAmps(prev => prev.map(() => 0.2 + Math.random() * 0.8));
        animRef.current = requestAnimationFrame(animate);
      };
      animRef.current = requestAnimationFrame(animate);
    } else {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      setLipFrame(0);
      setWaveAmps([0.3, 0.2, 0.3, 0.2, 0.3, 0.2, 0.3, 0.2]);
    }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isSpeaking]);

  const svgContent = AVATAR_SVGS[avatarStyle] || AVATAR_SVGS["professional-woman-dark"];
  const lipHeights = [0.9, 0.5, 0.3, 0.5, 0.7, 0.9][lipFrame];

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Avatar frame */}
      <div className="relative">
        {/* Outer glow ring */}
        <div
          className="absolute inset-0 rounded-full transition-all duration-300"
          style={{
            boxShadow: isSpeaking
              ? `0 0 0 3px ${accentColor}, 0 0 40px ${accentColor}55, 0 0 80px ${accentColor}22`
              : isListening
              ? `0 0 0 2px rgba(26,107,255,0.6), 0 0 25px rgba(26,107,255,0.2)`
              : `0 0 0 2px rgba(37,37,53,0.8)`,
          }}
        />

        {/* Avatar circle */}
        <div
          className="relative w-48 h-48 rounded-full overflow-hidden crt"
          style={{ border: `3px solid ${accentColor}33` }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />

        {/* Speaking overlay — lip animation indicator */}
        {isSpeaking && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-end gap-0.5">
            {waveAmps.map((amp, i) => (
              <div
                key={i}
                className="w-1 rounded-full transition-all duration-75"
                style={{
                  height: `${amp * 20 + 4}px`,
                  backgroundColor: accentColor,
                  opacity: 0.85,
                }}
              />
            ))}
          </div>
        )}

        {/* Mic indicator when listening */}
        {isListening && (
          <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center rec-ring">
            <Mic size={14} className="text-white" />
          </div>
        )}

        {/* LIVE badge when speaking */}
        {isSpeaking && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            ON AIR
          </div>
        )}
      </div>

      {/* Name plate */}
      <div className="text-center">
        <div className="font-display text-lg font-bold text-white leading-tight">{name}</div>
        <div className="text-xs font-medium mt-0.5" style={{ color: accentColor }}>{title}</div>
        <div className="text-xs text-studio-muted">{outlet}</div>
      </div>

      {/* Status bar */}
      <div
        className="text-xs px-3 py-1 rounded-full font-medium"
        style={{
          background: isSpeaking
            ? `${accentColor}22`
            : isListening
            ? "rgba(26,107,255,0.15)"
            : "rgba(37,37,53,0.6)",
          color: isSpeaking ? accentColor : isListening ? "#1a6bff" : "#6b6b85",
          border: `1px solid ${isSpeaking ? accentColor + "44" : isListening ? "rgba(26,107,255,0.3)" : "rgba(37,37,53,0.8)"}`,
        }}
      >
        {isSpeaking ? "● Speaking" : isListening ? "○ Listening" : "○ Ready"}
      </div>
    </div>
  );
}
