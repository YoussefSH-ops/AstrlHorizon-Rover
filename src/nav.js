export const NAV = [
  ["Overview", [["dashboard", "◉", "Dashboard"]]],
  ["Explore", [["map", "▦", "Route Planner"]]],
  ["Operations", [["return", "⟲", "Return Trip"], ["astronaut", "⚙", "Astronaut"]]],
  ["Knowledge", [["server", "▥", "Server & Data"]]],
  ["System", [["settings", "☰", "Settings"], ["help", "?", "Help"], ["about", "i", "About"]]],
];
export const NAME = Object.fromEntries(NAV.flatMap(g => g[1].map(p => [p[0], p[2]])));
