import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../entrypoints/utils/api", () => ({ apiClient: vi.fn() }));
vi.mock("../entrypoints/utils/timeEntries", () => ({
  getCurrentTimeEntry: vi.fn(),
}));
vi.mock("../entrypoints/utils/oauth", () => ({ accessToken: { value: "" } }));
vi.mock("../entrypoints/utils/dayjs", () => ({ dayjs: {} }));

import {
  findNotionActionsWrapper,
  getIssueTitleFromDOM,
  getNotionPageInfo,
  isNotionDatabaseItemPage,
  removeNotionTimeTrackingButton,
} from "../entrypoints/utils/notion";

const ID_A = "a".repeat(32);
const ID_B = "b".repeat(32);

const title = (text: string) =>
  `<h1 role="textbox" aria-roledescription="page title">${text}</h1>`;
const share = `<div class="actions"><div class="notion-topbar-share-menu">Share</div></div>`;
const props = `<div data-pinned-row></div>`;
const closedPeek = `<div class="notion-peek-renderer" aria-hidden="true"></div>`;

function setUrl(path: string) {
  history.pushState({}, "", path);
}

beforeEach(() => {
  document.body.innerHTML = "";
  setUrl("/");
});

describe("isNotionDatabaseItemPage", () => {
  it("is true for an item page with a properties row", () => {
    document.body.innerHTML = `<header>${share}</header>${title("Task")}${props}`;
    expect(isNotionDatabaseItemPage()).toBe(true);
  });

  it("is true for a properties table outside a collection view", () => {
    document.body.innerHTML = `${title("Task")}<div role="table"></div>`;
    expect(isNotionDatabaseItemPage()).toBe(true);
  });

  it("is false when there is no title", () => {
    document.body.innerHTML = props;
    expect(isNotionDatabaseItemPage()).toBe(false);
  });

  it("is false for a database page with only a collection view", () => {
    document.body.innerHTML = `${title("DB")}<div class="notion-collection-view-body"><div role="table"></div></div>`;
    expect(isNotionDatabaseItemPage()).toBe(false);
  });

  it("ignores a closed peek and uses the page", () => {
    document.body.innerHTML = `${title("Task")}${props}${closedPeek}`;
    expect(isNotionDatabaseItemPage()).toBe(true);
  });

  it("uses an open peek when the background is a database page", () => {
    document.body.innerHTML = `${title("DB")}<div class="notion-collection-view-body"><div role="table"></div></div>
      <div class="notion-peek-renderer">${title("Item")}${props}</div>`;
    expect(isNotionDatabaseItemPage()).toBe(true);
  });

  it("is false when the open peek has no properties even if the background does", () => {
    document.body.innerHTML = `${title("Task")}${props}<div class="notion-peek-renderer">${title("Doc")}</div>`;
    expect(isNotionDatabaseItemPage()).toBe(false);
  });
});

describe("getNotionPageInfo", () => {
  it("returns null on non-item pages", () => {
    document.body.innerHTML = title("Plain");
    expect(getNotionPageInfo()).toBeNull();
  });

  it("reads pageId from the path and trims the title", () => {
    setUrl(`/Some-Task-${ID_A}`);
    document.body.innerHTML = `${title("  My task \n")}${props}`;
    const info = getNotionPageInfo();
    expect(info).toMatchObject({ pageId: ID_A, title: "My task", inPeek: false });
    expect(info?.fullUrl).toBe(window.location.href);
  });

  it("reads pageId from ?p= when in a peek", () => {
    setUrl(`/Database-${ID_A}?p=${ID_B}&pm=s`);
    document.body.innerHTML = `${title("DB")}<div class="notion-peek-renderer">${title("Item")}${props}</div>`;
    expect(getNotionPageInfo()).toMatchObject({
      pageId: ID_B,
      title: "Item",
      inPeek: true,
    });
  });

  it("ignores ?p= when no peek is open", () => {
    setUrl(`/Task-${ID_A}?p=${ID_B}`);
    document.body.innerHTML = `${title("Task")}${props}`;
    expect(getNotionPageInfo()?.pageId).toBe(ID_A);
  });

  it("gives null pageId when the path has no 32-hex id", () => {
    setUrl("/short-id");
    document.body.innerHTML = `${title("Task")}${props}`;
    expect(getNotionPageInfo()?.pageId).toBeNull();
  });
});

describe("getIssueTitleFromDOM", () => {
  it("scopes to the open peek when the background has its own title", () => {
    document.body.innerHTML = `${title("Background")}<div class="notion-peek-renderer">${title("Peek item")}${props}</div>`;
    expect(getIssueTitleFromDOM()).toBe("Peek item");
  });

  it("returns null for an empty title", () => {
    document.body.innerHTML = title("   ");
    expect(getIssueTitleFromDOM()).toBeNull();
  });

  it("uses the document when the peek is closed", () => {
    document.body.innerHTML = `${title("Page")}${closedPeek}`;
    expect(getIssueTitleFromDOM()).toBe("Page");
  });
});

describe("findNotionActionsWrapper", () => {
  it("returns the header share parent on an item page", () => {
    document.body.innerHTML = `<header>${share}</header>${title("Task")}${props}`;
    const wrapper = findNotionActionsWrapper();
    expect(wrapper).toBe(document.querySelector("header .actions"));
  });

  it("returns the peek share parent when a peek is open", () => {
    document.body.innerHTML = `<header>${share}</header>${title("DB")}
      <div class="notion-peek-renderer">${title("Item")}${props}<div class="peek-actions"><div class="notion-topbar-share-menu"></div></div></div>`;
    expect(findNotionActionsWrapper()).toBe(
      document.querySelector(".peek-actions"),
    );
  });

  it("returns null on a non-item page", () => {
    document.body.innerHTML = `<header>${share}</header>${title("Plain")}`;
    expect(findNotionActionsWrapper()).toBeNull();
  });

  it("returns null when no share menu exists", () => {
    document.body.innerHTML = `<header></header>${title("Task")}${props}`;
    expect(findNotionActionsWrapper()).toBeNull();
  });
});

describe("removeNotionTimeTrackingButton", () => {
  it("removes the button if present", () => {
    document.body.innerHTML = `<button id="solidtime-notion-tracking-btn"></button>`;
    removeNotionTimeTrackingButton();
    expect(document.getElementById("solidtime-notion-tracking-btn")).toBeNull();
  });

  it("does nothing when absent", () => {
    expect(() => removeNotionTimeTrackingButton()).not.toThrow();
  });
});
