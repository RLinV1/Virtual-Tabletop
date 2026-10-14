import { GmDashboardPage } from "./pages/GmDashboardPage";
import { HomePage } from "./pages/HomePage";
import { SignInPage, SignUpPage } from "./account/AccountPages";
import { JoinPage } from "./pages/JoinPage";
import { LibraryPage } from "./pages/LibraryPage";
import { RoomPage } from "./pages/RoomPage";
import { useRoute } from "./router";

export function App() {
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
