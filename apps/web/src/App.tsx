import { lazy, Suspense } from "react";
import { HomePage } from "./pages/HomePage";
import { SignInPage, SignUpPage } from "./account/AccountPages";
import { JoinPage } from "./pages/JoinPage";
import { useRoute } from "./router";

// The landing and account pages do not need Pixi, map editors or the animation library.
const GmDashboardPage = lazy(() => import("./pages/GmDashboardPage").then((m) => ({ default: m.GmDashboardPage })));
const LibraryPage = lazy(() => import("./pages/LibraryPage").then((m) => ({ default: m.LibraryPage })));
const RoomPage = lazy(() => import("./pages/RoomPage").then((m) => ({ default: m.RoomPage })));

export function App() {
  return <Suspense fallback={<main className="centered"><p role="status">Loading…</p></main>}><RoutePage /></Suspense>;
}

function RoutePage() {
  const route = useRoute();
  switch (route.page) {
    case "home":
      return <HomePage />;
    case "gmDashboard":
      return <GmDashboardPage />;
    case "library":
      return <LibraryPage />;
    case "signin":
      return <SignInPage />;
    case "signup":
      return <SignUpPage />;
    case "join":
      return <JoinPage key={route.inviteCode} inviteCode={route.inviteCode} />;
    case "room":
      return <RoomPage key={route.roomId} roomId={route.roomId} />;
    case "encounterEdit":
      // A temporary room for editing an encounter template (ADR 0033).
      return <RoomPage key={`edit:${route.roomId}`} roomId={route.roomId} editing />;
    case "notFound":
      return (
        <main className="centered">
          <div className="card">
            <h1>Page not found</h1>
            <a href="/">Go home</a>
          </div>
        </main>
      );
  }
}
