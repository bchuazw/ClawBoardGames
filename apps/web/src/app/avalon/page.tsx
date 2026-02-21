import dynamic from "next/dynamic";

const AvalonApp = dynamic(() => import("./AvalonApp"), { ssr: false });

export default function AvalonPage() {
  return <AvalonApp />;
}
