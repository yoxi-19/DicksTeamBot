export default function DashboardLoader() {
  return (
    <div className="dashboard-loader" role="status" aria-live="polite">
      <div className="dashboard-loader__halo" />
      <div className="dashboard-loader__mark">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5 12 2.25 3 7.5v9l9 5.25 9-5.25v-9Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.875 12 12.5l8.25-4.625M12 12.5v8.625" />
        </svg>
      </div>
      <div className="dashboard-loader__bars" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <p>Dashboard wird synchronisiert</p>
      <span>Discord, Minecraft und Teamdaten werden geladen</span>
    </div>
  );
}
