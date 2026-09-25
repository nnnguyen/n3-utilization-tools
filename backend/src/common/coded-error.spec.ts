import { BadRequestException, NotFoundException } from "@nestjs/common";
import { codedError } from "./coded-error";

describe("codedError", () => {
  it("keeps the exception class and status, and exposes code and message", () => {
    const error = codedError(NotFoundException, "TOPIC_NOT_FOUND", "Không tìm thấy topic.");
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toEqual({
      code: "TOPIC_NOT_FOUND",
      message: "Không tìm thấy topic.",
    });
    expect(error.message).toBe("Không tìm thấy topic.");
  });

  it("adds params when given", () => {
    const error = codedError(BadRequestException, "X", "msg", { reason: "r" });
    expect(error.getResponse()).toEqual({ code: "X", message: "msg", params: { reason: "r" } });
  });
});
