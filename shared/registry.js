/**
 * shared/registry.js
 * =====================================================================
 * SINGLE SOURCE OF TRUTH for every customization option in Rizzzler:
 * themes, avatar effects, title effects, and showcase (page motion) effects.
 *
 * Why this file exists
 * ---------------------------------------------------------------------
 * Previously `config/themes.js` and `config/visuals.js` were the only
 * definitions, and the backend trusted whatever value a form posted
 * (see the old `dashboardController.updateProfile`, which only validated
 * `theme` and blindly accepted `avatarEffect`/`titleEffect`/`showcaseEffect`).
 * That's a validation drift bug waiting to happen: add an option to the
 * `<select>` on the frontend and forget to update backend validation (or
 * vice versa) and you get either dead UI options or unvalidated user input
 * flowing into CSS class names (`rz-avatar-effect--<%= value %>`) and the
 * database.
 *
 * This module is required by:
 *   - controllers (server-rendered EJS views pull option lists from here)
 *   - the validation layer (dashboardController, adminController)
 *   - a small JSON endpoint (`GET /api/registry`, see Routes/apiRoutes.js)
 *     so any future client-side/SPA code has the same data without a
 *     second copy.
 *
 * To add a new theme or effect: edit ONLY this file. Nothing else needs
 * to change — views iterate these arrays, and validation automatically
 * accepts the new `key`/`value`.
 * =====================================================================
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------
// Each theme maps to a CSS file in /public/css/themes AND carries its own
// content hooks (eyebrow text, grand words, story blurbs, credits line) so
// every theme reads like a different page — not just a different color swap.
const THEMES = [
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
  {
    key: "frostbyte",
    label: "Frostbyte",
    desc: "Icy cyan circuitry, crystalline frost drift, frozen-glass terminal panels",
    css: "/css/themes/frostbyte.css",
    accent: "#7ee8fa",
    heroEyebrow: "Cold Boot",
    grandWords: ["Glacial", "Crystalline", "Frozen", "Pristine"],
    storyBlurbs: [
      "Cold on the surface, running hot underneath — that's the whole point.",
      "Every edge sharp as ice, every detail crystal clear.",
    ],
    creditsTagline: "frozen in high definition",
  },
  {
    key: "bubblepop",
    label: "Bubble Pop",
    desc: "Playful cartoon styling, candy colors, bouncy backgrounds and goofy kid-energy vibes",
    css: "/css/themes/bubblepop.css",
    accent: "#ff7ad9",
    heroEyebrow: "Big Mood Energy",
    grandWords: ["Bouncy", "Sunny", "Sparkly", "Goofy"],
    storyBlurbs: [
      "Everything is brighter when the page feels like a fun little adventure.",
      "Big smiles, soft colors, and enough personality to light up the room.",
    ],
    creditsTagline: "all giggles, all heart",
  },
  {
    key: "stickerstorm",
    label: "Sticker Storm",
    desc: "A sticker-packed chaos theme with floating emoji bursts, confetti motion, playful gradients, and animated bouncy energy",
    css: "/css/themes/stickerstorm.css",
    accent: "#ff4fd8",
    heroEyebrow: "Sticker Mode ON",
    grandWords: ["Wild", "Sparkly", "Goofy", "Turbo"],
    storyBlurbs: [
      "The whole page feels like a giant mood board exploded into happy motion.",
      "It is bright, loud, playful, and impossible to ignore.",
    ],
    creditsTagline: "bouncing into full chaos",
  },
  {
    key: "stickerchaos",
    label: "Sticker Chaos",
    desc: "A louder, hyper-animated sticker variant with even more emoji, sticker clusters, zoom bursts, and maximal playful motion",
    css: "/css/themes/stickerchaos.css",
    accent: "#ffb703",
    heroEyebrow: "MAX CHAOS",
    grandWords: ["Chaotic", "Turbo", "Explosive", "Loud"],
    storyBlurbs: [
      "This one launches color, stickers, and motion everywhere at once.",
      "Everything feels bigger, louder, brighter, and full of personality.",
    ],
    creditsTagline: "chaos is the vibe",
  },
  {
    key: "neonpulse",
    label: "Neon Pulse",
    desc: "Dark cyber glow, electric cyan-magenta gradients, dramatic contrast and nightlife energy",
    css: "/css/themes/neonpulse.css",
    accent: "#00f5ff",
    heroEyebrow: "Glow Mode",
    grandWords: ["Neon", "Voltage", "Current", "Afterglow"],
    storyBlurbs: [
      "Low light, high energy. The whole page feels alive and tuned to the beat.",
      "Electric color, deep contrast, and just enough chaos to feel unforgettable.",
    ],
    creditsTagline: "powered by neon rhythm",
  },
];

// ---------------------------------------------------------------------
// Avatar effects
// ---------------------------------------------------------------------
// Built-in CSS-driven effects, plus any decoration image dropped into
// /public/decor (auto-discovered — no code change needed for those).
const AVATAR_EFFECTS_BASE = [
  { value: "none", label: "No extra effect", description: "Clean and classic" },
  { value: "neon", label: "Neon glow", description: "A bold electric halo around the avatar" },
  { value: "burn", label: "Burning ember", description: "A fierce warm flicker around the profile" },
  { value: "discord", label: "Discord pulse", description: "A polished glowing ring with a dramatic pulse" },
  { value: "hologram", label: "Hologram", description: "A futuristic beam that lifts the profile" },
];

function loadDecorFiles() {
  const decorDir = path.join(__dirname, "..", "public", "decor");
  if (!fs.existsSync(decorDir)) return [];
  return fs
    .readdirSync(decorDir)
    .filter((file) => /\.(gif|png|jpg|jpeg|webp|svg)$/i.test(file))
    .sort()
    .map((file) => ({
      value: file.replace(/\.[^/.]+$/, ""),
      label: file.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
      description: "Animated avatar decoration",
      file: `/decor/${file}`,
    }));
}

// Evaluated once at startup (matches previous behavior — drop a file in
// /public/decor and restart the server to pick it up).
const AVATAR_EFFECTS = [...AVATAR_EFFECTS_BASE, ...loadDecorFiles()];

// ---------------------------------------------------------------------
// Title effects
// ---------------------------------------------------------------------
const TITLE_EFFECTS = [
  { value: "none", label: "Static", description: "Classic hero title" },
  { value: "typewriter", label: "Typewriter", description: "A satisfying typing animation" },
  { value: "glitch", label: "Glitch", description: "A cinematic digital flicker" },
  { value: "shimmer", label: "Shimmer", description: "A bright, magical sweep" },
];

// ---------------------------------------------------------------------
// Showcase (page motion) effects
// ---------------------------------------------------------------------
const SHOWCASE_EFFECTS = [
  { value: "none", label: "No extra motion", description: "Keeps it clean and minimal" },
  { value: "aurora", label: "Aurora drift", description: "Slow color waves across the page" },
  { value: "constellation", label: "Constellation", description: "Sparkling star trails and cosmic light" },
  { value: "plasma", label: "Plasma pulse", description: "Electric energy that breathes through the scene" },
  { value: "hologram", label: "Hologram mesh", description: "Tech-circuit shimmer for a sci-fi landing" },
];

// ---------------------------------------------------------------------
// Validation helpers — the ONLY place "is this a legal value" is decided.
// ---------------------------------------------------------------------
const isValidTheme = (key) => THEMES.some((t) => t.key === key);
const isValidAvatarEffect = (value) => AVATAR_EFFECTS.some((e) => e.value === value);
const isValidTitleEffect = (value) => TITLE_EFFECTS.some((e) => e.value === value);
const isValidShowcaseEffect = (value) => SHOWCASE_EFFECTS.some((e) => e.value === value);

const getTheme = (key) => THEMES.find((t) => t.key === key) || null;

module.exports = {
  themes: THEMES,
  avatarEffects: AVATAR_EFFECTS,
  titleEffects: TITLE_EFFECTS,
  showcaseEffects: SHOWCASE_EFFECTS,
  isValidTheme,
  isValidAvatarEffect,
  isValidTitleEffect,
  isValidShowcaseEffect,
  getTheme,
};
