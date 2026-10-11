import { describe, expect, it } from "vitest";
import { hasMsGroup, hasMsScope, msFeaturesFor, msScopesForRequest, normalizeMsScopes, parseMsGrant } from "./scopes";

describe("Microsoft-behörigheter", () => {
  it("tolkar Microsofts scope-sträng och tar bort OIDC-delar och resursprefix", () => {
    expect(normalizeMsScopes("openid profile email https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read offline_access")).toEqual([
      "Mail.Read",
      "User.Read",
    ]);
    expect(normalizeMsScopes("")).toEqual([]);
    expect(normalizeMsScopes(null)).toEqual([]);
  });

  it("en bredare behörighet täcker den smalare", () => {
    expect(hasMsScope(["Mail.ReadWrite"], "Mail.Read")).toBe(true);
    expect(hasMsScope(["Calendars.ReadWrite"], "Calendars.Read")).toBe(true);
    expect(hasMsScope(["Mail.Read"], "Mail.ReadWrite")).toBe(false);
    expect(hasMsScope(["Mail.Read"], "Mail.Send")).toBe(false);
    expect(hasMsGroup(["mail.read"], "mail_read")).toBe(true);
  });

  it("första anslutningen ber bara om det som kortet behöver", () => {
    expect(msScopesForRequest([], ["mail_read"])).toEqual(["openid", "profile", "offline_access", "User.Read", "Mail.Read"]);
    expect(msScopesForRequest([], ["calendar_read"])).not.toContain("Mail.Read");
  });

  it("stegvis behörighet behåller det som redan är beviljat", () => {
    const scopes = msScopesForRequest(["Mail.Read", "User.Read"], ["calendar_read"]);
    expect(scopes).toContain("Mail.Read");
    expect(scopes).toContain("Calendars.Read");
    expect(scopes.filter((s) => s === "User.Read")).toHaveLength(1);
  });

  it("släpper okända grupper och grupper vars funktion inte är byggd än", () => {
    expect(parseMsGrant("mail_read,calendar_read")).toEqual(["mail_read", "calendar_read"]);
    expect(parseMsGrant("mail_send,mail_write,calendar_write")).toEqual([]);
    expect(parseMsGrant("Directory.ReadWrite.All,../x")).toEqual([]);
    expect(parseMsGrant(null)).toEqual([]);
  });

  it("slår bara på en funktion om behörigheten faktiskt beviljades", () => {
    expect(msFeaturesFor(["mail_read", "calendar_read"], ["Mail.Read", "User.Read"])).toEqual(["mail"]);
    expect(msFeaturesFor(["calendar_read"], ["User.Read"])).toEqual([]);
  });
});
