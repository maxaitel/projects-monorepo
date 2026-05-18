import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("home page", () => {
  it("renders the masthead and satire disclaimer", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "UC GREEN BISON" })
    ).toBeTruthy();
    expect(screen.getAllByText(/unofficial satire/i).length).toBeGreaterThan(0);
  });
});
