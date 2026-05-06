# PPT Master 使用简明指南

![GitHub](/docsPhoto/ppt-master/github.svg)原文来源：[hugohe3/ppt-master README_CN.md](https://github.com/hugohe3/ppt-master/blob/main/README_CN.md)（可点击跳转）

![PPT Master 示例](/docsPhoto/ppt-master/ppt-example.webp)

## 它是什么

PPT Master 是一个面向 AI Agent 的开源 PPT 生成工作流。它可以把 PDF、DOCX、网页、Markdown 或直接输入的文字内容，转换成真正可编辑的 PowerPoint 文件，而不是整页截图或图片。

生成结果通常包括：

- 原生可编辑的 `.pptx`
- 一个 `_svg.pptx` 视觉备份版本

## 准备环境

最低要求：

- Python 3.10+
- 一个能读写文件、执行命令的 AI Agent 工具，例如 Claude Code、Cursor、VS Code Copilot、Codex CLI 等

安装方式：

```bash
git clone https://github.com/hugohe3/ppt-master.git
cd ppt-master
pip install -r requirements.txt
```

如果不想安装 Git，也可以在 GitHub 页面点击 **Code → Download ZIP** 下载项目。
Windows尽量参考原文档

## 如何使用

1. 把原始资料放进项目目录，例如 PDF、DOCX、图片或 Markdown 文件。
2. 在 AI 聊天窗口里说明你的需求，例如：

```text
请用 projects/q3-report/sources/report.pdf 生成一份 8 页左右的商务汇报 PPT。
```

3. AI 会先确认设计规范，例如页数、比例、风格、受众、配色、图片策略等。
4. 确认后，AI 会分析内容、设计页面、生成 SVG，并导出 PPTX。
5. 最终文件会保存到 `exports/` 目录中。

## 支持的输入

- PDF
- DOCX
- 网页 URL
- Markdown
- 直接粘贴的文字内容
- 图片素材

## 使用建议

- 如果 AI 不知道怎么继续，让它先阅读 `skills/ppt-master/SKILL.md`。
- 推荐先给明确的受众、用途和页数，例如“投资人路演”“课程培训”“季度复盘”。
- 如果需要固定品牌风格，可以提供 Logo、品牌色、字体和参考页面。
- 导出的 PPT 建议使用 Office 2016 或更新版本打开。

## 总结

PPT Master 适合把已有资料快速变成可编辑、可继续修改的专业 PPT，尤其适合需要本地处理文件、保留编辑能力、不想被在线平台锁定的场景。
