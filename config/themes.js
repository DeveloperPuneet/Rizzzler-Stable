// Central registry of the showcase themes.
// Each maps to a CSS file in /public/css/themes AND carries its own content
// hooks (eyebrow text, grand words, story blurbs, credits line) so every
// theme reads like a different page — not just a different color swap.
module.exports = [
  {
    key: "moonlight",
    label: "Moonlight",
    desc: "Centered glow, drifting stars, orbiting moon, soft blue-silver light",
    css: "/css/themes/moonlight.css",
    accent: "#8ab4f8",
    heroEyebrow: "Under the Moonlight",
    grandWords: ["Serene", "Radiant", "Weightless", "Luminous"],
    storyBlurbs: [
      "A quiet kind of glow — the moments worth slowing down for.",
      "Soft light, steady heart. This is the calm behind the scenes.",
    ],
    creditsTagline: "carried by moonlight",
  },
  {
    key: "scarysky",
    label: "Scary Sky",
    desc: "Jagged split panels, storm flicker, lightning flashes, blood-orange glow",
    css: "/css/themes/scarysky.css",
    accent: "#ff4d4d",
    heroEyebrow: "Beware What Follows",
    grandWords: ["Fearless", "Reckless", "Haunted", "Merciless"],
    storyBlurbs: [
      "Storm clouds don't scare this one — they follow.",
      "Every flash of lightning, another chapter of the chaos.",
    ],
    creditsTagline: "forged in the storm",
  },
  {
    key: "darknights",
    label: "Dark Nights",
    desc: "Neon synthwave grid, glass terminal panels, electric violet + cyan glitch",
    css: "/css/themes/darknights.css",
    accent: "#a855f7",
    heroEyebrow: "System Online",
    grandWords: ["Unstoppable", "Wired", "Overclocked", "Encrypted"],
    storyBlurbs: [
      "Running at full voltage, every night, no exceptions.",
      "Neon lights, sharp edges — built different, wired different.",
    ],
    creditsTagline: "running on Rizzzler OS",
  },
  {
    key: "cutefoxy",
    label: "Cute Foxy",
    desc: "Polaroid scrapbook, bouncy pastel blobs, hearts drifting upward",
    css: "/css/themes/cutefoxy.css",
    accent: "#ff9ab8",
    heroEyebrow: "So Cute It Hurts",
    grandWords: ["Sweetheart", "Bubbly", "Sunshine", "Precious"],
    storyBlurbs: [
      "A little scrapbook page of everything worth smiling about.",
      "Soft colors, big heart — this one's made of sunshine.",
    ],
    creditsTagline: "made with lots of love",
  },
  {
    key: "diva",
    label: "Diva",
    desc: "Spotlight stage hero, gold filmstrip gallery, shimmering glam energy",
    css: "/css/themes/diva.css",
    accent: "#ffd166",
    heroEyebrow: "Tonight's Star",
    grandWords: ["Iconic", "Flawless", "Legendary", "Golden"],
    storyBlurbs: [
      "Center stage, every time — the spotlight was always coming.",
      "Gold trim, big presence. This is the main character energy.",
    ],
    creditsTagline: "center stage, always",
  },
  {
    key: "scifi",
    label: "Scifi",
    desc: "Neon grids, holographic glow, cyberpunk energy and starfield motion",
    css: "/css/themes/scifi.css",
    accent: "#5ee7ff",
    heroEyebrow: "Signal Acquired",
    grandWords: ["Neon", "Signal", "Quantum", "Future"],
    storyBlurbs: [
      "The future is already here — the signal is just getting louder.",
      "Circuits hum, stars shimmer, and the whole page feels alive.",
    ],
    creditsTagline: "wired for the next era",
  },
  {
    key: "rocky",
    label: "Rocky",
    desc: "Craggy terrain, warm earth tones, bold and rugged cinematic texture",
    css: "/css/themes/rocky.css",
    accent: "#d78b2e",
    heroEyebrow: "Built to Last",
    grandWords: ["Rugged", "Steady", "Wild", "Unshaken"],
    storyBlurbs: [
      "Grounded, bold, and impossible to ignore.",
      "Each detail feels carved by real grit and real character.",
    ],
    creditsTagline: "carved in stone",
  },
];
