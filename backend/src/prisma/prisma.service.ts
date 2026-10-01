import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { workspaceStorage } from "../common/workspace-context/workspace.storage";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private _extendedClient: any;

  constructor() {
    super();

    const tenantModels = [
      "connection",
      "syncLog",
      "zoomSyncLog",
      "syncRule",
      "zoomSyncRule",
      "workspaceInvite",
      "channelVideoCache",
      "zoomYoutubeMatchDismissal",
      "quotaUsage",
      "zoomWorkflowSettings",
    ];

    this._extendedClient = this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const store = workspaceStorage.getStore();
            const workspaceId = store?.workspaceId;

            // Prisma Client Extension uses lowercase model names in query object usually,
            // but here 'model' is the name of the model. We check if it's in our list.
            // We need to match the case or normalize it.
            const isTenantModel = tenantModels.some(
              (m) => m.toLowerCase() === model.toLowerCase(),
            );

            if (workspaceId && isTenantModel) {
              const a = args as any;
              if (
                [
                  "findFirst",
                  "findFirstOrThrow",
                  "findUnique",
                  "findUniqueOrThrow",
                  "findMany",
                  "updateMany",
                  "deleteMany",
                  "count",
                  "aggregate",
                  "groupBy",
                ].includes(operation)
              ) {
                a.where = { ...a.where, workspaceId };
              } else if (operation === "update" || operation === "delete") {
                a.where = { ...a.where, workspaceId };
              } else if (operation === "create" || operation === "createMany") {
                if (operation === "create") {
                  a.data = { ...a.data, workspaceId };
                } else if (Array.isArray(a.data)) {
                  a.data = a.data.map((d: any) => ({ ...d, workspaceId }));
                }
              } else if (operation === "upsert") {
                a.create = { ...a.create, workspaceId };
                a.update = { ...a.update, workspaceId };
                a.where = { ...a.where, workspaceId };
              }
            }
            return query(args);
          },
        },
      },
    });

    // Proxy calls to the extended client
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (prop in target._extendedClient) {
          return target._extendedClient[prop];
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
