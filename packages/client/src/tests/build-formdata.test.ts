import { describe, expect, it } from "vitest";
import { buildFormData } from "../request.js";

describe("buildFormData", () => {
  it("should include RPC routing fields (intent, service, action)", () => {
    const fd = buildFormData("users", "create", {});
    expect(fd.get("intent")).toBe("execute");
    expect(fd.get("service")).toBe("users");
    expect(fd.get("action")).toBe("create");
  });

  it("should append user-provided string fields", () => {
    const fd = buildFormData("users", "create", {}, { name: "Alice", role: "admin" });
    expect(fd.get("name")).toBe("Alice");
    expect(fd.get("role")).toBe("admin");
  });

  it("should append a single file under its key", () => {
    const file = new File(["hello"], "test.txt", { type: "text/plain" });
    const fd = buildFormData("uploads", "submit", { document: file });

    const entry = fd.get("document");
    expect(entry).toBeInstanceOf(File);
    expect((entry as File).name).toBe("test.txt");
  });

  it("should append multiple files under the same key", () => {
    const file1 = new File(["a"], "a.txt", { type: "text/plain" });
    const file2 = new File(["b"], "b.txt", { type: "text/plain" });
    const fd = buildFormData("uploads", "submit", { docs: [file1, file2] });

    const entries = fd.getAll("docs");
    expect(entries).toHaveLength(2);
    expect((entries[0] as File).name).toBe("a.txt");
    expect((entries[1] as File).name).toBe("b.txt");
  });

  it("should handle multiple file keys", () => {
    const avatar = new File(["img"], "avatar.png", { type: "image/png" });
    const resume = new File(["pdf"], "resume.pdf", { type: "application/pdf" });

    const fd = buildFormData("users", "update", {
      avatar,
      resume,
    });

    expect(fd.get("avatar")).toBeInstanceOf(File);
    expect(fd.get("resume")).toBeInstanceOf(File);
    expect((fd.get("avatar") as File).name).toBe("avatar.png");
    expect((fd.get("resume") as File).name).toBe("resume.pdf");
  });

  it("should include both fields and files together", () => {
    const file = new File(["data"], "report.csv", { type: "text/csv" });
    const fd = buildFormData(
      "reports",
      "upload",
      { file },
      { title: "Q4 Report" }
    );

    expect(fd.get("intent")).toBe("execute");
    expect(fd.get("service")).toBe("reports");
    expect(fd.get("action")).toBe("upload");
    expect(fd.get("title")).toBe("Q4 Report");
    expect((fd.get("file") as File).name).toBe("report.csv");
  });

  it("should handle empty files and fields", () => {
    const fd = buildFormData("svc", "act", {});

    // Only the 3 routing fields
    const keys: string[] = [];
    fd.forEach((_, key) => keys.push(key));
    expect(keys).toEqual(["intent", "service", "action"]);
  });
});
