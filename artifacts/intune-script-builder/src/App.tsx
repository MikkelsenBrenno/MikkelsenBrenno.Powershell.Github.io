import { Switch, Route, Router as WouterRouter } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Builder from "@/pages/builder";
import Pitfalls from "@/pages/pitfalls";
import BestPractices from "@/pages/best-practices";
import Reference from "@/pages/reference";
import LibraryPage from "@/pages/library";
import Toolbox from "@/pages/toolbox";
import ModulesGuide from "@/pages/modules-guide";
import { Layout } from "@/components/layout";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/builder" component={Builder} />
      <Route path="/library" component={LibraryPage} />
      <Route path="/pitfalls" component={Pitfalls} />
      <Route path="/best-practices" component={BestPractices} />
      <Route path="/toolbox" component={Toolbox} />
      <Route path="/modules" component={ModulesGuide} />
      <Route path="/reference" component={Reference} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="intune-script-builder-theme">
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Layout>
            <Router />
          </Layout>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
