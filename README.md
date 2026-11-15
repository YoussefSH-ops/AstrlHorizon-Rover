# Astral Horizon: Frontend

The face of Astral Horizon. This is what an astronaut or mission planner sees and clicks: a mission-control style interface for planning a walk across Mars and checking that the astronaut can get home.

It is built with React and Vite, and talks to the Astral Horizon backend, which does all the route and oxygen calculations.

---

## What you can do

**See the mission at a glance.** The Dashboard shows the state of the system and the size of the map being used.

**Plan a route.** In the Route Planner you choose a start and a goal on the terrain grid. The app asks the backend for three routes between those points and shows each one with the oxygen it needs, so you can compare them and pick one.

**Check the way home.** The Return Trip page takes the route you chose and tells you whether the astronaut can complete it and still get back, with the numbers behind the answer.

**Describe the astronaut.** The Astronaut page holds the settings that shape every estimate, such as body mass and effort level. They start from the backend's defaults and are sent with every request.

**Keep an eye on the system.** The Server page and the header show whether the backend is alive. The status refreshes on its own every 30 seconds.

**Make it yours.** Settings let you adjust preferences, and the Help and About pages explain how everything works.

---

## Design

- **Mission-control feel.** The app opens with an animated intro, and uses synthesized sound effects that are generated in the browser, with no audio files.
- **Honest data.** Everything on screen comes straight from what the backend returns. The interface does not make up numbers, and field names appear as the server sends them.
- **Clear errors.** If the backend rejects a request, the app shows the exact message it gave, so problems are easy to understand and fix.

---

## How it connects

The frontend asks the backend five questions:

| It asks | To show |
|---|---|
| Are you running? | The status light in the header |
| How big is the map? | The grid used for picking points |
| What are the default astronaut settings? | The Astronaut form |
| What are the routes between these two points? | The three route options |
| Can the astronaut still get home on this route? | The return-trip verdict |

The app is packaged with Docker and served through nginx, so it can be hosted on any standard platform.

---

## Pages

| Page | Purpose |
|---|---|
| Dashboard | Overview of the mission and system |
| Route Planner | Pick points and compare three routes |
| Return Trip | Check the oxygen for the way home |
| Astronaut | Set the astronaut's details |
| Server | Live backend status |
| Settings | Personal preferences |
| Help / About | What the app does and how to use it |