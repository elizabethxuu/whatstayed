/** Shown instead of the app when no database is connected. Honest, not broken. */
export default function Unconfigured({ reason }: { reason: string }) {
  return (
    <main className="welcome">
      <div className="welcome-card">
        <p className="mark">What Stayed</p>
        <h1 className="welcome-title">The garden isn’t connected yet.</h1>
        <p className="welcome-sub">{reason}</p>
      </div>
    </main>
  );
}
