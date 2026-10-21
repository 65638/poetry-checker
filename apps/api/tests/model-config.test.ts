import { describe, expect, it } from "vitest";
import {
  resolveModelConfig,
  DEEPSEEK_ENDPOINT,
  GLM_ENDPOINT,
} from "../src/model-config.js";

describe("server model selection", () => {
  const environment = {
    ZHIPU_API_KEY: "glm-private",
    DEEPSEEK_API_KEY: " deepseek-private ",
  };
  it("uses DeepSeek when its server key is present and otherwise preserves GLM", () => {
    expect(resolveModelConfig({}, environment)).toMatchObject({
      provider: "deepseek",
      apiKey: "deepseek-private",
      model: "deepseek-flash",
      endpoint: DEEPSEEK_ENDPOINT,
    });
    expect(
      resolveModelConfig(
        {},
        { ZHIPU_API_KEY: "glm-private", DEEPSEEK_API_KEY: " " },
      ),
    ).toMatchObject({
      provider: "zhipu",
      apiKey: "glm-private",
      endpoint: GLM_ENDPOINT,
    });
  });
  it("honors explicit provider and model without borrowing the other provider's key", () => {
    expect(
      resolveModelConfig(
        {},
        {
          ...environment,
          POETRY_AI_PROVIDER: "zhipu",
          ZHIPU_MODEL: "glm-custom",
        },
      ),
    ).toMatchObject({
      provider: "zhipu",
      apiKey: "glm-private",
      model: "glm-custom",
    });
    expect(
      resolveModelConfig(
        { provider: "deepseek" },
        { ZHIPU_API_KEY: "glm-private" },
      ).apiKey,
    ).toBe("");
    expect(
      resolveModelConfig(
        { provider: "zhipu" },
        { DEEPSEEK_API_KEY: "deepseek-private" },
      ).apiKey,
    ).toBe("");
    expect(
      resolveModelConfig(
        { provider: "deepseek", apiKey: "override", model: "custom" },
        environment,
      ),
    ).toMatchObject({
      provider: "deepseek",
      apiKey: "override",
      model: "custom",
    });
  });
  it("preserves the GLM service injection contract and rejects misspelled providers", () => {
    expect(resolveModelConfig({ apiKey: "test" }, environment).provider).toBe(
      "zhipu",
    );
    expect(() =>
      resolveModelConfig({}, { POETRY_AI_PROVIDER: "deepseke" }),
    ).toThrow();
  });
});
