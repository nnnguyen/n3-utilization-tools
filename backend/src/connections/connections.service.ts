import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { Connection, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialsCipher, Secrets } from "./credentials-cipher";
import { getProvider, ProviderId } from "./providers";
import { tokenHealth } from "./token-health";

export type ConnectionStatus = "active" | "disabled" | "needs_reauth";

/** A connection with its secrets decrypted — for server-side use only. */
export class ConnectionView {
  id: string;
  userId: string;
  workspaceId: string | null;
  provider: ProviderId;
  status: ConnectionStatus;
  externalAccountId: string | null;
  externalAccountName: string | null;
  settings: Record<string, string>;
  secrets: Secrets;
  state: Record<string, unknown>;
  tokenObtainedAt: Date | null;
  lastTokenRefreshAt: Date | null;
  tokenInvalidAt: Date | null;
  updatedAt: Date;
}

export interface SaveConnectionInput {
  workspaceId?: string | null;
  status?: ConnectionStatus;
  externalAccountId?: string | null;
  externalAccountName?: string | null;
  // Merged into the stored settings; only the provider's settings fields
  settings?: Record<string, string | null | undefined>;
  // Empty or missing = keep the stored value (as the P1-1 forms send them)
  secrets?: Record<string, string | null | undefined>;
  state?: Record<string, unknown>;
}

/** Every field of a connection, written as-is (legacy mirror, P2-1c). */
export interface ConnectionSnapshot {
  status: ConnectionStatus;
  externalAccountId: string | null;
  externalAccountName: string | null;
  settings: Record<string, string>;
  secrets: Secrets;
  state: Record<string, unknown>;
  tokenObtainedAt: Date | null;
  lastTokenRefreshAt: Date | null;
  tokenInvalidAt: Date | null;
}

// API calls refresh the token often: one bookkeeping write per 5 min is enough
const REFRESH_WRITE_INTERVAL_MS = 5 * 60_000;

// Stores and reads connections (docs/design/P2-1-connector.md). Secrets are
// encrypted with CREDENTIALS_KEY, bound to "userId:provider".
@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);
  private cipherInstance: CredentialsCipher | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // Created on first use, so the app starts without CREDENTIALS_KEY until
  // connections are actually stored
  private get cipher(): CredentialsCipher {
    this.cipherInstance ??= CredentialsCipher.fromEnv();
    return this.cipherInstance;
  }

  async find(
    userId: string,
    provider: ProviderId,
    externalAccountId?: string,
  ): Promise<ConnectionView | null> {
    const row = await this.prisma.connection.findFirst({
      where: { userId, provider, externalAccountId },
    });
    return row ? this.toView(row) : null;
  }

  /** Connections of one provider linked to an external account (e.g. a Zoom account id). */
  async findByExternalAccount(
    provider: ProviderId,
    externalAccountId: string,
  ): Promise<ConnectionView[]> {
    const rows = await this.prisma.connection.findMany({
      where: { provider, externalAccountId },
    });
    return rows.map((row) => this.toView(row));
  }

  async save(
    userId: string,
    provider: ProviderId,
    input: SaveConnectionInput,
    connectionId?: string,
  ): Promise<ConnectionView> {
    const definition = getProvider(provider);
    let existing: ConnectionView | null = null;

    if (connectionId) {
      existing = await this.prisma.connection.findUnique({ where: { id: connectionId } }).then((row) => (row ? this.toView(row) : null));
    }

    if (!existing && input.externalAccountId) {
      existing = await this.find(userId, provider, input.externalAccountId);
    }

    const settings = { ...(existing?.settings ?? {}) };
    for (const [field, value] of Object.entries(input.settings ?? {})) {
      if (!definition.settingsFields.includes(field)) {
        throw new BadRequestException(`Unknown ${provider} setting: ${field}`);
      }
      if (value === undefined) continue;
      if (value === null || value === "") delete settings[field];
      else settings[field] = value;
    }

    const secrets = { ...(existing?.secrets ?? {}) };
    for (const [field, value] of Object.entries(input.secrets ?? {})) {
      if (!definition.secretFields.includes(field)) {
        throw new BadRequestException(`Unknown ${provider} secret: ${field}`);
      }
      if (value) secrets[field] = value;
    }

    const data: any = {
      workspaceId: input.workspaceId ?? existing?.workspaceId,
      status: input.status,
      externalAccountId: input.externalAccountId,
      externalAccountName: input.externalAccountName,
      settings,
      credentials: Object.keys(secrets).length
        ? this.cipher.encrypt(secrets, this.context(userId, provider))
        : null,
      state: input.state
        ? ({ ...(existing?.state ?? {}), ...input.state } as Prisma.InputJsonObject)
        : undefined,
    };
    const row = await this.prisma.connection.upsert({
      where: connectionId ? { id: connectionId } : {
        userId_provider_externalAccountId: {
          userId,
          provider,
          externalAccountId: input.externalAccountId || "",
        },
      },
      update: data,
      create: {
        ...data,
        userId,
        provider,
      },
    });
    return this.toView(row);
  }

  /** Clears the secrets and disables the connection (sync history is kept). */
  async disconnect(userId: string, provider: ProviderId, connectionId?: string) {
    await this.prisma.connection.update({
      where: connectionId
        ? { id: connectionId }
        : {
            userId_provider_externalAccountId: {
              userId,
              provider,
              externalAccountId: "",
            },
          },
      data: {
        status: "disabled",
        credentials: null,
        tokenObtainedAt: null,
        lastTokenRefreshAt: null,
        tokenInvalidAt: null,
      },
    });
  }

  /** Hard delete a connection. */
  async delete(userId: string, provider: ProviderId, connectionId?: string) {
    await this.prisma.connection.delete({
      where: connectionId
        ? { id: connectionId }
        : {
            userId_provider_externalAccountId: {
              userId,
              provider,
              externalAccountId: "",
            },
          },
    });
  }

  /** A newly issued token (OAuth callback) restarts the expiry clock. */
  async markTokenIssued(userId: string, provider: ProviderId, now = new Date()) {
    await this.prisma.connection.updateMany({
      where: { userId, provider, status: "active" },
      data: {
        tokenObtainedAt: now,
        lastTokenRefreshAt: now,
        tokenInvalidAt: null,
      },
    });
  }

  // Never throws: token bookkeeping must not affect the calling flow.
  async markTokenRefreshed(userId: string, provider: ProviderId, now = new Date()) {
    try {
      await this.prisma.connection.updateMany({
        where: {
          userId,
          provider,
          status: "active",
          OR: [
            { lastTokenRefreshAt: null },
            {
              lastTokenRefreshAt: {
                lt: new Date(now.getTime() - REFRESH_WRITE_INTERVAL_MS),
              },
            },
            { tokenInvalidAt: { not: null } },
          ],
        },
        data: { lastTokenRefreshAt: now, tokenInvalidAt: null },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record token refresh for ${userId}/${provider}: ${error.message}`,
      );
    }
  }

  // Never throws. The provider rejected the token (e.g. invalid_grant).
  async markTokenInvalid(userId: string, provider: ProviderId, now = new Date()) {
    try {
      await this.prisma.connection.updateMany({
        where: { userId, provider, status: "active", tokenInvalidAt: null },
        data: { tokenInvalidAt: now },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record token error for ${userId}/${provider}: ${error.message}`,
      );
    }
  }

  async tokenHealth(userId: string, provider: ProviderId, now = new Date()) {
    const definition = getProvider(provider);
    const connection = await this.find(userId, provider);
    return tokenHealth(
      {
        active: connection?.status === "active",
        hasToken: !!connection?.secrets[definition.connectedWhen],
        tokenObtainedAt: connection?.tokenObtainedAt ?? null,
        lastTokenRefreshAt: connection?.lastTokenRefreshAt ?? null,
        tokenInvalidAt: connection?.tokenInvalidAt ?? null,
      },
      definition.tokenPolicy,
      now,
    );
  }

  private context(userId: string, provider: string) {
    return `${userId}:${provider}`;
  }

  private toView(row: Connection): ConnectionView {
    return {
      id: row.id,
      userId: row.userId,
      workspaceId: (row as any).workspaceId ?? null,
      provider: getProvider(row.provider).id,
      status: row.status as ConnectionStatus,
      externalAccountId: row.externalAccountId,
      externalAccountName: row.externalAccountName,
      settings: (row.settings ?? {}) as Record<string, string>,
      secrets: row.credentials
        ? this.cipher.decrypt(row.credentials, this.context(row.userId, row.provider))
        : {},
      state: (row.state ?? {}) as Record<string, unknown>,
      tokenObtainedAt: row.tokenObtainedAt,
      lastTokenRefreshAt: row.lastTokenRefreshAt,
      tokenInvalidAt: row.tokenInvalidAt,
      updatedAt: row.updatedAt,
    };
  }
}
