import { Outlet } from "react-router";

export default function Root() {
  return (
    <div className="size-full flex items-center justify-center bg-[#1a1a1a]">
      <div className="w-full max-w-md h-full bg-background overflow-hidden shadow-2xl relative text-foreground">
        <Outlet />
      </div>
    </div>
  );
}
