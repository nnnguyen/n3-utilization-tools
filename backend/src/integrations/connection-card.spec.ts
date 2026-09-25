import { PROVIDERS } from "../connections/providers";
import { tokenHealth } from "../connections/token-health";
import { connectionCard } from "./connection-card";

const health = tokenHealth(
  { active: true, hasToken: true, tokenObtainedAt: null, lastTokenRefreshAt: null, tokenInvalidAt: null },
  null,
);

describe("connectionCard", () => {
  it("never exposes secrets, only whether they are stored", () => {
    const card = connectionCard(
      PROVIDERS.zoom,
      { isActive: true, accountId: "acc", clientId: "cid", clientSecret: "s3cret", webhookSecretToken: "" },
      health,
      null,
    );
    expect(card).toMatchObject({
      provider: "zoom",
      status: "active",
      connected: true,
      externalAccountId: "acc",
      settings: { accountId: "acc", clientId: "cid" },
      secrets: { clientSecret: true, webhookSecretToken: false },
    });
    expect(JSON.stringify(card)).not.toContain("s3cret");
  });

  it("reports an app never configured", () => {
    expect(connectionCard(PROVIDERS.youtube, null, health, null)).toMatchObject({
      status: "not_configured",
      connected: false,
      settings: { clientId: null },
      secrets: { clientSecret: false, refreshToken: false },
    });
  });

  it("is not connected while disabled or without its token", () => {
    expect(
      connectionCard(PROVIDERS.youtube, { isActive: false, refreshToken: "tok" }, health, null).connected,
    ).toBe(false);
    expect(
      connectionCard(PROVIDERS.youtube, { isActive: true, clientSecret: "s" }, health, null).connected,
    ).toBe(false);
  });
});
