# Trace 测试启动说明


## 1) 环境要求

- macOS（建议 12+）
- Node.js 18+（推荐 20 LTS）
- pnpm（推荐使用）
- Rust 工具链（`rustup` + `cargo`）
- Xcode Command Line Tools（macOS 必需）

可用以下命令快速检查：

```bash
node -v
pnpm -v
rustc -V
cargo -V
```

## 2) 获取项目并安装依赖

进入项目根目录后执行：

```bash
pnpm install
```

## 3) 启动项目（Tauri + 前端）

在项目根目录执行：

```bash
npm run tauri dev
```

启动后会：

- 自动拉起前端开发服务（默认 `http://localhost:3000`）
- 编译并启动 Tauri 桌面端

首次启动会比较慢（Rust 首次编译时间较长），请耐心等待。

## 4) 建议测试点

- 文档预览：PDF / Docx 是否能稳定打开
- 编辑器：Bubble Menu 是否正常显示
- `/` 指令菜单是否可用
- 窗口布局：编辑区边缘是否无遮挡、无闪烁

## 5) 常见问题

### 端口占用（3000 被占用）

先关闭占用进程，或结束其他本地前端服务后重试。

### Rust 编译失败

可以先执行：

```bash
cd src-tauri
cargo clean
cd ..
npm run tauri dev
```

### 依赖异常

删除 `node_modules` 后重新安装：

```bash
rm -rf node_modules
pnpm install
npm run tauri dev
```

