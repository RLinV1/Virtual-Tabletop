// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../src/App";

const route = vi.hoisted(() => ({ page: "home", roomId: "room-1" }));
const loaded = vi.hoisted(() => [] as string[]);
vi.mock("../src/router", () => ({ useRoute: () => route }));
vi.mock("../src/pages/HomePage", () => ({ HomePage: () => <p>Home page</p> }));
vi.mock("../src/account/AccountPages", () => ({ SignInPage: () => null, SignUpPage: () => null }));
vi.mock("../src/pages/JoinPage", () => ({ JoinPage: () => null }));
vi.mock("../src/pages/GmDashboardPage", () => {
  loaded.push("dashboard");
  return { GmDashboardPage: () => <p>Dashboard page</p> };
});
vi.mock("../src/pages/LibraryPage", () => {
  loaded.push("library");
  return { LibraryPage: () => <p>Library page</p> };
});
vi.mock("../src/pages/RoomPage", () => {
  loaded.push("room");
  return { RoomPage: ({ roomId }: { roomId: string }) => <p>Room {roomId}</p> };
});
afterEach(cleanup);

it("loads tabletop pages only when visited and preserves the room route (FR-TAC-06)", async () => {
  const view = render(<App />);
  expect(screen.getByText("Home page")).toBeTruthy();
  expect(loaded).toEqual([]);

  route.page = "room";
  view.rerender(<App />);
  expect(await screen.findByText("Room room-1")).toBeTruthy();
  expect(loaded).toEqual(["room"]);

  route.page = "library";
  view.rerender(<App />);
  expect(await screen.findByText("Library page")).toBeTruthy();
  expect(loaded).toEqual(["room", "library"]);
});
