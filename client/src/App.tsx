import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import WorkflowLauncher from "./pages/WorkflowLauncher";
import WorkflowMonitor from "./pages/WorkflowMonitor";
import ResultsDashboard from "./pages/ResultsDashboard";
import AgentSettings from "./pages/AgentSettings";
import ConfigManager from "./pages/ConfigManager";
import HistoryViewer from "./pages/HistoryViewer";

/** Route table – exported so integration smoke tests can render the real routing tree. */
export function AppRoutes() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/launcher"} component={WorkflowLauncher} />
      <Route path={"/agents"} component={AgentSettings} />
      <Route path={"/configs"} component={ConfigManager} />
      <Route path={"/history"} component={HistoryViewer} />
      <Route path={"/runs/:id"} component={WorkflowMonitor} />
      <Route path={"/monitor/:id"} component={WorkflowMonitor} />
      <Route path={"/results/:id"} component={ResultsDashboard} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <AppRoutes />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
