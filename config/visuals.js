const fs = require('fs');
const path = require('path');

const decorDir = path.join(__dirname, '..', 'public', 'decor');
const decorFiles = fs.existsSync(decorDir)
  ? fs.readdirSync(decorDir)
      .filter((file) => /\.(gif|png|jpg|jpeg|webp|svg)$/i.test(file))
      .sort()
      .map((file) => ({
        value: file.replace(/\.[^/.]+$/, ''),
        label: file.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
        description: 'Animated avatar decoration',
        file: `/decor/${file}`,
      }))
  : [];

module.exports = {
  avatarEffects: [
    { value: "none", label: "No extra effect", description: "Clean and classic" },
    { value: "neon", label: "Neon glow", description: "A bold electric halo around the avatar" },
    { value: "burn", label: "Burning ember", description: "A fierce warm flicker around the profile" },
    { value: "discord", label: "Discord pulse", description: "A polished glowing ring with a dramatic pulse" },
    { value: "hologram", label: "Hologram", description: "A futuristic beam that lifts the profile" },
    ...decorFiles,
  ],
  titleEffects: [
    { value: "none", label: "Static", description: "Classic hero title" },
    { value: "typewriter", label: "Typewriter", description: "A satisfying typing animation" },
    { value: "glitch", label: "Glitch", description: "A cinematic digital flicker" },
    { value: "shimmer", label: "Shimmer", description: "A bright, magical sweep" },
  ],
  showcaseEffects: [
    { value: "none", label: "No extra motion", description: "Keeps it clean and minimal" },
    { value: "aurora", label: "Aurora drift", description: "Slow color waves across the page" },
    { value: "constellation", label: "Constellation", description: "Sparkling star trails and cosmic light" },
    { value: "plasma", label: "Plasma pulse", description: "Electric energy that breathes through the scene" },
    { value: "hologram", label: "Hologram mesh", description: "Tech-circuit shimmer for a sci-fi landing" },
  ],
};
