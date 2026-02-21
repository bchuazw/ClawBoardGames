import { ChessProvider } from "./ChessContext";
import "./chess.css";

export default function ChessLayout({ children }: { children: React.ReactNode }) {
  return <ChessProvider>{children}</ChessProvider>;
}
