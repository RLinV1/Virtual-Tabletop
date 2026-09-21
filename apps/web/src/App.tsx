import { HomePage } from "./pages/HomePage";
import { JoinPage } from "./pages/JoinPage";
import { RoomPage } from "./pages/RoomPage";
import { useRoute } from "./router";

export function App() {
  const route = useRoute();
  switch (route.page) {
    case "home":
      return <HomePage />;
    case "join":
      return <JoinPage key={route.inviteCode} inviteCode={route.inviteCode} />;
    case "room":
      return <RoomPage key={route.roomId} roomId={route.roomId} />;
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
