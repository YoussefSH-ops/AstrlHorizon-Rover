export function Help() {
  const items = [
    ["Navigate", "Use the sidebar or press Ctrl K to jump to any page. Press M to mute."],
    ["Plan a route", "In the Route Planner, click the map to place the start (A) and end (B) cells, or type their row and column. Then press Compute routes."],
    ["Compare routes", "Select a route in the right panel to highlight it. Every value shown comes straight from the server."],
    ["Check the return trip", "Open the Return trip tab, or the Return Trip page, to ask the server whether the astronaut can complete a route and still get home."],
    ["Astronaut settings", "Settings on the Astronaut page are loaded from the server and sent with every route and return-trip request."],
    ["Rearrange the dashboard", "Drag a widget by its title to move it."],
  ];
  return <><div className="h1">Help</div><div className="grid">{items.map(([a, b]) => <div className="w" key={a}><h3>{a}</h3><p>{b}</p></div>)}</div></>;
}

export function About() {
  return (
    <>
      <div className="h1">About Astral Horizon</div>
      <div className="w" style={{ maxWidth: 640 }}>
        <img src="/logo.jpg" style={{ width: "100%", mixBlendMode: "screen" }} alt="Astral Horizon" />
        <p style={{ marginTop: 12 }}>New worlds await. This is the Astral Horizon frontend. Map size, astronaut settings, routes and return-trip results are provided by the Astral Horizon server.</p>
      </div>
    </>
  );
}
