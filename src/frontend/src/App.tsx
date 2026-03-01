import { Toaster } from "@/components/ui/sonner";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { useEffect, useState } from "react";
import { AppProvider } from "./context/AppContext";
import { useAppContext } from "./context/AppContext";
import { ThemeProvider } from "./context/ThemeContext";

import DashboardScreen from "./screens/DashboardScreen";
import DietTrackerScreen from "./screens/DietTrackerScreen";
import HabitTrackerScreen from "./screens/HabitTrackerScreen";
import ProfileScreen from "./screens/ProfileScreen";
import ProgressScreen from "./screens/ProgressScreen";
import WorkoutTrackerScreen from "./screens/WorkoutTrackerScreen";

// Icons
import {
  Apple,
  Droplets,
  Dumbbell,
  Home,
  TrendingUp,
  UserCircle,
} from "lucide-react";

type Tab = "dashboard" | "diet" | "workout" | "habits" | "progress" | "profile";

const NAV_ITEMS: {
  id: Tab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: "dashboard", label: "Home", icon: Home },
  { id: "diet", label: "Diet", icon: Apple },
  { id: "workout", label: "Workout", icon: Dumbbell },
  { id: "habits", label: "Habits", icon: Droplets },
  { id: "progress", label: "Progress", icon: TrendingUp },
  { id: "profile", label: "Profile", icon: UserCircle },
];

function AppContent() {
  const { profile, isLoading } = useAppContext();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [prevTab, setPrevTab] = useState<Tab>("dashboard");

  // On first load, if no profile, show profile screen
  useEffect(() => {
    if (!isLoading && !profile) {
      setActiveTab("profile");
    }
  }, [isLoading, profile]);

  const handleNavigate = (tab: string) => {
    setPrevTab(activeTab);
    setActiveTab(tab as Tab);
  };

  const handleTabChange = (tab: Tab) => {
    setPrevTab(activeTab);
    setActiveTab(tab);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col items-center gap-3"
        >
          <div className="w-16 h-16 rounded-3xl bg-primary/20 flex items-center justify-center">
            <Dumbbell size={28} className="text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground text-center">
              FitTrack
            </h1>
            <p className="text-sm text-muted-foreground text-center">
              Your fitness companion
            </p>
          </div>
          <div className="flex gap-1.5 mt-2">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-primary"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{
                  duration: 1,
                  repeat: Number.POSITIVE_INFINITY,
                  delay: i * 0.2,
                }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  const renderScreen = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardScreen onNavigate={handleNavigate} />;
      case "diet":
        return <DietTrackerScreen />;
      case "workout":
        return <WorkoutTrackerScreen />;
      case "habits":
        return <HabitTrackerScreen />;
      case "progress":
        return <ProgressScreen />;
      case "profile":
        return <ProfileScreen />;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Main content */}
      <main className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: getDirection(prevTab, activeTab) * 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: getDirection(prevTab, activeTab) * -20 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 overflow-y-auto"
          >
            {renderScreen()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-50">
        <div className="bg-card/95 backdrop-blur-xl border-t border-border safe-area-pb">
          <div className="flex items-center justify-around px-2 pt-2 pb-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTabChange(item.id)}
                  className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-2xl transition-all duration-200 min-w-[56px] ${
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                >
                  <div
                    className={`relative transition-all duration-200 ${isActive ? "scale-110" : "scale-100"}`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="nav-indicator"
                        className="absolute inset-0 -m-2 rounded-xl bg-primary/15"
                        transition={{
                          type: "spring",
                          bounce: 0.3,
                          duration: 0.4,
                        }}
                      />
                    )}
                    <Icon size={22} className="relative z-10" />
                  </div>
                  <span
                    className={`text-[10px] font-semibold transition-all duration-200 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}

// Determine slide direction based on tab order
function getDirection(from: Tab, to: Tab): number {
  const order: Tab[] = [
    "dashboard",
    "diet",
    "workout",
    "habits",
    "progress",
    "profile",
  ];
  const fromIdx = order.indexOf(from);
  const toIdx = order.indexOf(to);
  if (fromIdx === toIdx) return 0;
  return toIdx > fromIdx ? 1 : -1;
}

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <div className="w-full min-h-screen flex justify-center bg-background">
          {/* overflow-hidden is intentionally NOT on this wrapper so that
              fixed-position portals (rest timer, overlays) are not clipped
              on iOS Safari / mobile WebKit */}
          <div className="w-full max-w-[480px] min-h-screen relative">
            <AppContent />
            <Toaster richColors position="top-center" />
          </div>
          {/* Portal root for fixed overlays — lives outside the max-width
              container so overflow clipping can never affect it */}
          <div id="portal-root" />
        </div>
      </AppProvider>
    </ThemeProvider>
  );
}
