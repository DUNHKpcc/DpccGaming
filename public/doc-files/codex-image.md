# 通过 DPCC API 使用最新的 gpt-image-2模型生成图片

⚠️⚠️⚠️如果遇到生成图片超时之类的报错一定要联系管理员，目前回源超时是300s，生成时间超过该图片有概率失败

本文教会你用我们家的中转API使用最新的模型，这里以Codex APP举例，具体配置详细教程参考codex-cli这篇文档

# Codex配置

使用DPCC-SWITCH来快速切换生图模型和编码模型

![DPCC Switch](/docsPhoto/codex-image/dpcc-switch.webp)

```toml
profile = "dpcc"

  [profiles.dpcc]
  model_provider = "dpcc"
  model = "gpt-5.5-image-2"
  model_reasoning_effort = "medium"

  [profiles.dpcc.windows]
  sandbox = "elevated"

  [model_providers.dpcc]
  name = "DPCC new-api"
  base_url = "https://api.dpccgaming.xyz/v1"
  env_key = "OPENAI_API_KEY"
  requires_openai_auth = false
  wire_api = "responses"

  stream_idle_timeout_ms = 900000
  stream_max_retries = 0
  request_max_retries = 4
```

通过修改模型ID来实现对image2模型的调用，本质上通过codex生图的底层调用逻辑


# 提示词示例/使用演示

目前DPCC API支持 gpt-5.5-image-2/gpt-5.5-image-2-hq
hq结尾为高质量生成模型，具体的生成细节可以通过 model_reasoning_effort = "medium" 去调整，因为OpenAI的调用逻辑是

用户输入提示词 --> gpt5.5理解提示词 --> gpt发给生图工具生成

所以图片的质量取决于模型的思考强度和模型等级


⚠️提示词模版 示例：$Image Gen （此项为调用OpenAI官方生成工具） 生成一张蜜雪冰城高清宣传图片，不使用PLC，不写代码，不使用PY脚本
这里以gpt-5.5-image-2生成图片，时间大概30s左右（根据生成质量决定），一张图大概消耗0.04$

![生成示例](/docsPhoto/codex-image/example.webp)

