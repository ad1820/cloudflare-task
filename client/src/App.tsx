import { FormEvent, useMemo, useState } from "react";
import { useMatchRoom } from "./useMatchRoom";
import "./styles.css";

const MATCH_ID = "real-madrid-barcelona-001";

export default function App() {
  const [name, setName] = useState(() => localStorage.getItem("90m-name") || `Guest ${Math.floor(Math.random() * 90 + 10)}`);
  const room = useMatchRoom(MATCH_ID, name);
  const match = room.snapshot?.match;
  const events = useMemo(() => [...(match?.events || [])].reverse(), [match?.events]);

  const outcome = useMemo(() => {
    if (!match) return "neutral";
    if (match.status === "finished") {
      if (match.score.home > match.score.away) return "madrid-win";
      if (match.score.away > match.score.home) return "barca-win";
      return "draw";
    }
    if (match.score.home > match.score.away) return "madrid-lead";
    if (match.score.away > match.score.home) return "barca-lead";
    return "neutral";
  }, [match]);

  if (!match) return <main className="loading"><div className="ball" /><p>Entering the VAR room…</p></main>;

  const submit = (handler: (value: string) => void) => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const input = event.currentTarget.elements.namedItem("message") as HTMLInputElement;
    if (!input.value.trim()) return; handler(input.value.trim()); input.value = "";
  };

  const themeClass = outcome === "madrid-win"
    ? "theme-madrid"
    : outcome === "barca-win"
      ? "theme-barca"
      : outcome === "madrid-lead"
        ? "theme-madrid-lead"
        : outcome === "barca-lead"
          ? "theme-barca-lead"
          : "";

  return <div className={`app-shell ${themeClass}`}>
    <header>
      <div><span className="eyebrow">LIVE FOOTBALL INTELLIGENCE</span><h1>90TH <i>MINUTE</i></h1></div>
      <div className="room-meta"><span className={`status ${room.connection}`}>{room.connection}</span><span>{room.snapshot?.connectedUsers ?? 0} in room</span></div>
    </header>

    {outcome === "madrid-win" && (
      <div className="victory-banner madrid">
        <img src="/real-madrid.svg" alt="Real Madrid" className="banner-badge" />
        <div className="banner-text">
          <strong>¡HALA MADRID Y NADA MÁS!</strong>
          <span>Real Madrid triumphs in the all-time Clásico ({match.score.home} — {match.score.away})</span>
        </div>
        <button className="banner-reset-btn" onClick={room.reset} title="Restart match">↺ Start Again</button>
      </div>
    )}

    {outcome === "barca-win" && (
      <div className="victory-banner barca">
        <img src="/barcelona.svg" alt="FC Barcelona" className="banner-badge" />
        <div className="banner-text">
          <strong>¡FORÇA BARÇA!</strong>
          <span>FC Barcelona claims victory in the all-time Clásico ({match.score.away} — {match.score.home})</span>
        </div>
        <button className="banner-reset-btn" onClick={room.reset} title="Restart match">↺ Start Again</button>
      </div>
    )}

    {outcome === "draw" && (
      <div className="victory-banner draw">
        <div className="banner-text">
          <strong>HONOURS EVEN AT FULL TIME</strong>
          <span>An immortal Clásico finishes level ({match.score.home} — {match.score.away})</span>
        </div>
        <button className="banner-reset-btn" onClick={room.reset} title="Restart match">↺ Start Again</button>
      </div>
    )}

    <section className="scoreboard">
      <div className="team home">
        <div className="team-identity">
          <img src="/real-madrid.svg" alt="Real Madrid CF Crest (Wikipedia)" className="club-crest" title="Real Madrid CF (Source: Wikipedia)" />
          <div>
            <small>HOME</small>
            <strong>{match.homeTeam}</strong>
          </div>
        </div>
      </div>
      <div className="score">
        <span>{match.score.home}</span>
        <em>—</em>
        <span>{match.score.away}</span>
        <small>{match.status === "finished" ? "FT" : `${match.minute}′`}</small>
      </div>
      <div className="team away">
        <div className="team-identity away-identity">
          <div>
            <small>AWAY</small>
            <strong>{match.awayTeam}</strong>
          </div>
          <img src="/barcelona.svg" alt="FC Barcelona Crest (Wikipedia)" className="club-crest" title="FC Barcelona (Source: Wikipedia)" />
        </div>
      </div>
      <div className="match-controls">
        <button className="simulate" onClick={room.simulate} disabled={match.status === "finished" || room.simulating}>
          {room.simulating ? "Simulation running…" : "Simulate next 10′"} <span>→</span>
        </button>
        <button className="reset-btn" onClick={room.reset} title="Reset match back to 0′ and restart">
          ↺ Start Again
        </button>
      </div>
    </section>

    {room.error && <div className="notice">{room.error}</div>}
    <main className="dashboard">
      <section className="panel timeline-panel">
        <div className="panel-title"><h2>Match timeline</h2><span>{events.length} events</span></div>
        <div className="timeline">
          {events.length === 0 && <div className="empty"><b>The tunnel is quiet.</b><span>Simulate 10 minutes to kick off.</span></div>}
          {events.map((item) => <article className={`event ${item.kind === "goal" ? "goal" : ""}`} key={item.id}>
            <time>{item.minute}′</time><span className="event-dot" /><div><b>{item.kind.replaceAll("_", " ")}</b><p>{item.summary}</p></div>
          </article>)}
        </div>
      </section>

      <section className="panel stats-panel">
        <div className="panel-title"><h2>Match pulse</h2><span>authoritative</span></div>
        <Stat label="Possession" home={`${match.stats.possession.home}%`} away={`${match.stats.possession.away}%`} ratio={match.stats.possession.home} />
        <Stat label="Shots" home={match.stats.shots.home} away={match.stats.shots.away} />
        <Stat label="On target" home={match.stats.shotsOnTarget.home} away={match.stats.shotsOnTarget.away} />
        <Stat label="Yellow cards" home={match.stats.yellowCards.home} away={match.stats.yellowCards.away} />
        <Stat label="Fouls" home={match.stats.fouls.home} away={match.stats.fouls.away} />
        <details className="lineups">
          <summary>View all-time XIs</summary>
          <div>
            <div>
              <div className="lineup-club-header"><img src="/real-madrid.svg" alt="" className="mini-crest" /><b>Real Madrid XI</b></div>
              <ol>{match.lineup.home.filter((player) => player.onPitch).map((player) => <li key={player.id}><span>{player.position}</span>{player.name}</li>)}</ol>
            </div>
            <div>
              <div className="lineup-club-header"><img src="/barcelona.svg" alt="" className="mini-crest" /><b>Barcelona XI</b></div>
              <ol>{match.lineup.away.filter((player) => player.onPitch).map((player) => <li key={player.id}><span>{player.position}</span>{player.name}</li>)}</ol>
            </div>
          </div>
        </details>
      </section>

      <section className="panel analyst-panel">
        <div className="panel-title"><h2>AI match analyst</h2><span className="ai-label">AI generated</span></div>
        <div className="analyst-copy">{room.thinking ? <div className="thinking"><i /><i /><i /> Reading the match…</div> : <p>{room.analysis}</p>}</div>
        <div className="suggestions">
          {["Who has controlled the last 10 minutes?", "What tactical change would you make?", "Who looks more dangerous?"].map((q) => <button key={q} onClick={() => room.ask(q)}>{q}</button>)}
        </div>
        <form className="composer" onSubmit={submit(room.ask)}><input name="message" maxLength={500} placeholder="Ask the analyst…" /><button aria-label="Ask">↑</button></form>
      </section>

      <section className="panel chat-panel">
        <div className="panel-title"><h2>VAR room</h2><label>Speaking as <input value={name} maxLength={40} onChange={(e) => { setName(e.target.value); localStorage.setItem("90m-name", e.target.value); }} /></label></div>
        <div className="messages">
          {(room.snapshot?.chat || []).slice(-20).map((message) => <div className="message" key={message.id}><div className="avatar">{message.displayName.slice(0, 1).toUpperCase()}</div><p><b>{message.displayName}</b><span>{message.text}</span></p></div>)}
          {!room.snapshot?.chat.length && <div className="empty compact">No messages yet. Call the first move.</div>}
        </div>
        <form className="composer" onSubmit={submit(room.chat)}><input name="message" maxLength={500} placeholder="Share a tactical thought…" /><button aria-label="Send">↑</button></form>
      </section>
    </main>
    <footer><span>Deterministic match engine</span><span>Cloudflare Durable Objects + Workers AI</span></footer>
  </div>;
}

function Stat({ label, home, away, ratio }: { label: string; home: string | number; away: string | number; ratio?: number }) {
  return <div className="stat"><div><b>{home}</b><span>{label}</span><b>{away}</b></div>{ratio !== undefined && <div className="bar"><i style={{ width: `${ratio}%` }} /></div>}</div>;
}
