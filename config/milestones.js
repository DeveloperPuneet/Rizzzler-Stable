// Fixed early milestones, then every 1000 views after 2000 ("...then so on").
const FIXED_MILESTONES = [50, 100, 500, 1000, 2000];

// Because profileViews is incremented by exactly +1 per view, a milestone is
// "crossed" precisely when the new total equals a milestone value.
function milestoneForCount(newViews) {
  if (FIXED_MILESTONES.includes(newViews)) return newViews;
  if (newViews > 2000 && newViews % 1000 === 0) return newViews;
  return null;
}

module.exports = { FIXED_MILESTONES, milestoneForCount };
