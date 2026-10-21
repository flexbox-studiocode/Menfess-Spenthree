import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import App from "./App.jsx";

const renderRoute = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

describe("foundation routes", () => {
  it.each([
    ["/", "Menfess Spenthree"],
    ["/write", "Tulis menfess"],
    ["/review", "Periksa pesan"],
    ["/status", "Status pesan"],
    ["/menfess/public-id", "Detail menfess"],
    ["/guide", "Panduan menfess"],
    ["/missing", "Halaman tidak ditemukan"],
  ])("renders %s without backend configuration", (path, heading) => {
    renderRoute(path);
    expect(
      screen.getByRole("heading", { level: 1, name: heading }),
    ).toBeInTheDocument();
    if (path === "/write") expect(screen.getByRole("textbox", { name: /Isi pesan/ })).toBeInTheDocument();
    if (path === "/status") expect(screen.getByRole("textbox", { name: /Kode pelacakan/ })).toBeInTheDocument();
  });

  it("navigates using the primary links", async () => {
    const user = userEvent.setup();
    renderRoute("/");
    await user.click(
      screen.getByRole("navigation").querySelector('a[href="/write"]'),
    );
    expect(
      screen.getByRole("heading", { name: "Tulis menfess" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation").querySelector('[aria-current="page"]'),
    ).toHaveAttribute("href", "/write");
    await user.click(screen.getByRole("link", { name: "Status", exact: true }));
    expect(
      screen.getByRole("heading", { name: "Status pesan" }),
    ).toBeInTheDocument();
  });
});
