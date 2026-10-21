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
    ["/", "Sampaikan pesanmu, tetap anonim."],
    ["/write", "Tulis Menfess"],
    ["/review", "Periksa Pesan"],
    ["/status", "Periksa Status"],
    ["/menfess/public-id", "Detail Menfess"],
    ["/guide", "Panduan"],
    ["/missing", "Halaman tidak ditemukan"],
  ])("renders %s without backend configuration", (path, heading) => {
    renderRoute(path);
    expect(
      screen.getByRole("heading", { level: 1, name: heading }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("navigates using the primary links", async () => {
    const user = userEvent.setup();
    renderRoute("/");
    await user.click(
      screen.getByRole("navigation").querySelector('a[href="/write"]'),
    );
    expect(
      screen.getByRole("heading", { name: "Tulis Menfess" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation").querySelector('[aria-current="page"]'),
    ).toHaveAttribute("href", "/write");
    await user.click(
      screen.getByRole("link", { name: "Lihat halaman pratinjau" }),
    );
    expect(
      screen.getByRole("heading", { name: "Periksa Pesan" }),
    ).toBeInTheDocument();
  });
});
