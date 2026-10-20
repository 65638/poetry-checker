/** A returned defect or status must never silently become a passing assertion. */
export function passedScenario(id, detail) {
  if (detail && typeof detail === "object") {
    if (
      "defect" in detail ||
      ("status" in detail && detail.status !== "pass")
    ) {
      throw new Error(`场景未通过：${JSON.stringify(detail)}`);
    }
  }
  return { id, status: "pass", detail };
}
