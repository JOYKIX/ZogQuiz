export function Loader({ label = 'Chargement…' }: { label?: string }) {
  return <div className="loader"><span />{label}</div>;
}
