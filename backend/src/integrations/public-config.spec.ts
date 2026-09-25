import {
  stripEmptySecrets,
  toPublicConfig,
  YOUTUBE_SECRET_FIELDS,
  ZOOM_SECRET_FIELDS,
} from "./public-config";

const SECRET_KEYS = ["clientSecret", "webhookSecretToken", "refreshToken"];

describe("toPublicConfig", () => {
  it("drops secrets and reports which ones are stored", () => {
    const result = toPublicConfig(
      {
        isActive: true,
        accountId: "acc",
        clientId: "zoom-id",
        clientSecret: "zoom-secret",
        webhookSecretToken: "",
      },
      {
        isActive: true,
        clientId: "yt-id",
        clientSecret: "yt-secret",
        refreshToken: "refresh",
      },
    );

    expect(result).toEqual({
      zoom: {
        isActive: true,
        accountId: "acc",
        clientId: "zoom-id",
        hasClientSecret: true,
        hasWebhookSecretToken: false,
      },
      youtube: {
        isActive: true,
        clientId: "yt-id",
        hasClientSecret: true,
        hasRefreshToken: true,
      },
    });
    for (const service of [result.zoom, result.youtube]) {
      for (const key of SECRET_KEYS) expect(service).not.toHaveProperty(key);
    }
    expect(JSON.stringify(result)).not.toMatch(/secret"|refresh"/);
  });

  it("returns inactive defaults when nothing is configured", () => {
    expect(toPublicConfig(null, null)).toEqual({
      zoom: {
        isActive: false,
        accountId: null,
        clientId: null,
        hasClientSecret: false,
        hasWebhookSecretToken: false,
      },
      youtube: {
        isActive: false,
        clientId: null,
        hasClientSecret: false,
        hasRefreshToken: false,
      },
    });
  });
});

describe("stripEmptySecrets", () => {
  it("keeps the stored value when a secret is empty or missing", () => {
    expect(
      stripEmptySecrets(
        { clientId: "id", clientSecret: "", isActive: true },
        ZOOM_SECRET_FIELDS,
      ),
    ).toEqual({ clientId: "id", isActive: true });
  });

  it("passes typed secrets through", () => {
    expect(
      stripEmptySecrets(
        { clientSecret: "new", refreshToken: "tok" },
        YOUTUBE_SECRET_FIELDS,
      ),
    ).toEqual({ clientSecret: "new", refreshToken: "tok" });
  });

  it("leaves non-secret fields untouched, even when empty", () => {
    expect(
      stripEmptySecrets({ accountId: "", clientId: "" }, ZOOM_SECRET_FIELDS),
    ).toEqual({ accountId: "", clientId: "" });
  });
});
