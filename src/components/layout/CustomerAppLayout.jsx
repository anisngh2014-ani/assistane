import React, { useState } from "react";
import { Menu } from "lucide-react";
import CustomerSidebar from "./CustomerSidebar";

export default function CustomerAppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <CustomerSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-xl border-b border-border lg:hidden shrink-0">
          <div className="flex items-center px-4 h-14 gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="touch-manipulation p-1 -ml-1 text-muted-foreground hover:text-foreground active:scale-95 transition-transform"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <img src="https://media.base44.com/images/public/6a32eca12dbb32f7f5ec2a11/8ac54a3e2_Logo.png" alt="RemotePilot" className="h-10 w-auto mix-blend-lighten" />
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}