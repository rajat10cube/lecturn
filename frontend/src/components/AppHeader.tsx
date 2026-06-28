import { LogOut, SlidersHorizontal } from "lucide-react";
import { type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth";

export default function AppHeader({ center }: { center?: ReactNode }) {
  const { signOut, isAdmin } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <div className="container flex h-14 items-center gap-3">
        <Link to="/" className="text-lg font-bold tracking-tight">
          Lecturn
        </Link>
        <div className="flex flex-1 justify-center px-2">{center}</div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/settings">
            <SlidersHorizontal />
            <span className="hidden sm:inline">{isAdmin ? "Settings" : "Account"}</span>
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          <LogOut />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  );
}
