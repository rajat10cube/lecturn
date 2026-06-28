import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CourseCard, LibraryResponse } from "@/api";

// AppHeader pulls in auth/query wiring we don't care about here — stub it but
// keep rendering the search box it's handed so search still works.
vi.mock("@/components/AppHeader", () => ({
  default: ({ center }: { center?: ReactNode }) => <div data-testid="hdr">{center}</div>,
}));

const getCourses = vi.fn<[], Promise<LibraryResponse>>();
const getSearch = vi.fn();
vi.mock("@/api", () => ({
  getCourses: () => getCourses(),
  getSearch: (q: string) => getSearch(q),
}));

import Library from "@/pages/Library";

function card(over: Partial<CourseCard>): CourseCard {
  return {
    id: Math.floor(Math.random() * 1e9),
    slug: `s-${Math.random()}`,
    title: "Untitled",
    category: null,
    cover: null,
    lectureCount: 5,
    completedCount: 0,
    lastActivity: null,
    createdAt: null,
    ...over,
  };
}

function renderLibrary() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getCourses.mockReset();
  getSearch.mockReset();
  getSearch.mockResolvedValue({ results: [] });
});

describe("Library page", () => {
  it("renders courses returned by the API", async () => {
    getCourses.mockResolvedValue({
      courses: [card({ title: "Unreal Engine 5" }), card({ title: "Blender Basics" })],
      categories: [],
    });
    renderLibrary();
    expect(await screen.findByText("Unreal Engine 5")).toBeInTheDocument();
    expect(screen.getByText("Blender Basics")).toBeInTheDocument();
  });

  it("shows the empty state when there are no courses", async () => {
    getCourses.mockResolvedValue({ courses: [], categories: [] });
    renderLibrary();
    expect(await screen.findByText("No courses yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add a library/i })).toBeInTheDocument();
  });

  it("filters by category chip", async () => {
    getCourses.mockResolvedValue({
      courses: [
        card({ title: "Udemy Course", category: "Udemy" }),
        card({ title: "Skillshare Course", category: "Skillshare" }),
      ],
      categories: ["Udemy", "Skillshare"],
    });
    renderLibrary();
    await screen.findByText("Udemy Course");

    await userEvent.click(screen.getByRole("button", { name: "Skillshare" }));

    expect(screen.queryByText("Udemy Course")).not.toBeInTheDocument();
    expect(screen.getByText("Skillshare Course")).toBeInTheDocument();
  });

  it("filters by completion status", async () => {
    getCourses.mockResolvedValue({
      courses: [
        card({ title: "Done Course", lectureCount: 3, completedCount: 3 }),
        card({ title: "Fresh Course", lectureCount: 3, completedCount: 0 }),
      ],
      categories: [],
    });
    renderLibrary();
    await screen.findByText("Done Course");

    const statusSelect = screen.getAllByRole("combobox")[0];
    await userEvent.selectOptions(statusSelect, "completed");

    await waitFor(() => expect(screen.queryByText("Fresh Course")).not.toBeInTheDocument());
    expect(screen.getByText("Done Course")).toBeInTheDocument();
  });
});
