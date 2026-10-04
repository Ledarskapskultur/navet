import { describe, expect, it } from "vitest";
import { formToRequest, InboundError } from "./inbound";

describe("formToRequest", () => {
  it("maps a UGL booking form to a request", () => {
    const r = formToRequest("ugl", {
      name: "Anna Andersson",
      email: "anna@exempel.se",
      organization: "Exempel AB",
      subject: "Företagsintern UGL",
      date: "2027-03-15",
      participants: "8",
      message: "Vi vill boka en kursvecka för ledningsgruppen.",
      page: "https://uglsverige.store/foretag",
    });
    expect(r).toMatchObject({
      title: "Företagsintern UGL – Exempel AB",
      type: "request",
      stage: "new",
      status: "inbox",
      source: "web_form",
      projectId: "p-ugl",
      eventDate: "2027-03-15",
      contact: { name: "Anna Andersson", email: "anna@exempel.se", phone: null, organization: "Exempel AB" },
    });
    expect(r.description).toContain("Antal deltagare: 8");
  });

  it("keeps free-text dates in the description", () => {
    const r = formToRequest("ledarskapsmetoden", { name: "Per", phone: "070-123 45 67", date: "vecka 12" });
    expect(r.eventDate).toBeNull();
    expect(r.description).toContain("Önskat datum: vecka 12");
    expect(r.projectId).toBe("p-lm");
  });

  it("rejects unknown sources, missing contact info and honeypot spam", () => {
    expect(() => formToRequest("okand", { email: "a@b.se" })).toThrow(InboundError);
    expect(() => formToRequest("ugl", { name: "Utan kontakt" })).toThrow("Ange e-post eller telefon");
    expect(() => formToRequest("ugl", { email: "a@b.se", website: "spam.example" })).toThrowError(
      expect.objectContaining({ status: 422 }),
    );
  });
});
