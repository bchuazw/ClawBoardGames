import "./avalon.css";

export default function AvalonLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="avalon-layout-fullbleed"
      style={{
        width: "100vw",
        position: "relative",
        left: "50%",
        right: "50%",
        marginLeft: "-50vw",
        marginRight: "-50vw",
        background: "linear-gradient(180deg, #0C1B3A 0%, #15103A 40%, #0D2535 70%, #0C1B3A 100%)",
        minHeight: 0,
        height: "100%",
      }}
    >
      {children}
    </div>
  );
}
