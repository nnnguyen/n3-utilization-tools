import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ZoomSyncRulesService } from "./sync-rules.service";

describe("ZoomSyncRulesService", () => {
  const rules = [
    { id: "a", position: 0 },
    { id: "b", position: 1 },
  ];
  let prisma: any;
  let service: ZoomSyncRulesService;

  beforeEach(() => {
    prisma = {
      zoomSyncRule: {
        findMany: jest.fn().mockResolvedValue(rules),
        findFirst: jest.fn(),
        create: jest.fn(async ({ data }) => data),
        update: jest.fn(async ({ data }) => data),
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (ops) => Promise.all(ops)),
    };
    service = new ZoomSyncRulesService(prisma);
  });

  it("appends a new rule after the last one and cleans its fields", async () => {
    prisma.zoomSyncRule.findFirst.mockResolvedValue({ position: 4 });
    const created = await service.create("user-1", {
      matchText: "  SOH ",
      titleTemplate: "  ",
      tags: [" soh", "soh", ""],
      playlistId: "",
    });
    expect(created).toMatchObject({
      userId: "user-1",
      position: 5,
      matchText: "SOH",
      titleTemplate: null,
      tags: ["soh"],
      playlistId: null,
    });
  });

  it("reorders when every rule is listed once", async () => {
    await service.reorder("user-1", ["b", "a"]);
    expect(prisma.zoomSyncRule.update).toHaveBeenCalledWith({
      where: { id: "b" },
      data: { position: 0 },
    });
    expect(prisma.zoomSyncRule.update).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { position: 1 },
    });
  });

  it("rejects an order that misses, repeats or adds rules", async () => {
    for (const ids of [["a"], ["a", "a"], ["a", "c"]]) {
      await expect(service.reorder("user-1", ids)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });

  it("refuses to edit another account's rule", async () => {
    prisma.zoomSyncRule.findFirst.mockResolvedValue(null);
    await expect(
      service.update("user-1", "x", { matchText: "GOH" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.zoomSyncRule.update).not.toHaveBeenCalled();
  });
});
