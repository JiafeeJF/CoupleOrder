# CoupleOrder Android APK 打包指南

Android 工程位于 `client/android/`。React + Vite 先产出 `client/dist/`，Capacitor 再把网页和插件同步到原生工程，最后由 Gradle 打包。APK 不包含 Express 或 MongoDB，后端需要单独运行。

## 1. 准备环境

- Node.js 22 或更高版本（包含 npm）。
- Android Studio、JDK 21、Android SDK Platform 36、SDK Build-Tools 和 Platform-Tools。Gradle 所用的 JDK 设为 21；命令行可通过 `JAVA_HOME` 指向安装目录，再用 `java -version` 检查。
- 用 Android Studio 的 SDK Manager 安装 SDK。如果命令行找不到 SDK，可设置 `ANDROID_HOME`，或在本机 `client/android/local.properties` 中设置 `sdk.dir`。不要提交这个文件。
- 仓库自带 Gradle Wrapper，固定为 8.14.3，无需全局安装 Gradle。应用最低支持 Android 7.0（API 24）。

## 2. 配置 APK 使用的后端

先按[项目 README](../README.md#公开版配置)准备 `server/.env`、MongoDB 和所需的邮件配置，部署到手机可访问、证书受信任的 HTTPS 地址。

在 `client/src/api.js` 把 `MOBILE_BASE` 改成自己的服务地址，例如 `https://api.example.com`（不要带 `/api` 或末尾斜杠）。原生端的 API 和 Socket.IO 共用这个地址；反向代理需要转发 `/api` 和 `/socket.io` 并支持 WebSocket 升级。网页开发仍走 Vite 的本地代理。不要把 APK 后端设成 `localhost`：真机上的 `localhost` 指向手机本身。

## 3. 构建调试 APK

从仓库根目录开始，在 Windows PowerShell 中运行：

```powershell
cd client
npm ci
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

macOS / Linux 的前五行相同，最后一行改成 `./gradlew assembleDebug`。不要用 `package.json` 里的 `android:apk*` / `android:release` 快捷命令，它们仍引用原开发机的 Gradle 路径。

输出：`client/android/app/build/outputs/apk/debug/app-debug.apk`。打开手机的 USB 调试、连接并授权后，可从仓库根目录运行 `adb install -r client/android/app/build/outputs/apk/debug/app-debug.apk`。也可以从 `client/` 运行 `npx cap open android`，在 Android Studio 选择设备后运行。安装后先验证登录、配对和实时订单同步。

## 4. 构建正式签名 APK

先执行第 3 步中的网页构建和 Capacitor 同步，再从 `client/` 执行 `npx cap open android`。在 Android Studio 选择 **Build → Generate Signed App Bundle or APK → APK**，选择 `app` 模块和 `release` 构建类型，创建或选用你自己的密钥库。正式 APK 的签名密钥、别名密码和备份必须私下保存，不要提交到 Git。

本项目包名为 `com.coupleorder.app`。升级同一应用时，签名必须匹配，且应在 `client/android/app/build.gradle` 中递增 `versionCode` 并更新 `versionName`。若要与其他签名的原版共存，使用不同的 `applicationId`，并与 `client/capacitor.config.json` 的 `appId` 保持一致。

## 常见问题

- APK 还是旧页面：修改前端或后端地址后，重新运行 `npm run build` 和 `npx cap sync android`，再打包。
- 登录失败或实时消息断开：从手机确认 HTTPS 地址和证书可用，检查 API 和 Socket.IO 转发，以及后端是否允许 WebView 的 `https://localhost` 来源。
- Gradle 镜像不可用：按 `client/android/gradle/wrapper/gradle-wrapper.properties` 里的注释切换到 Gradle 官方分发地址，然后重试。
- 安装提示签名冲突：已有同包名但不同签名的安装。换不同包名，或先备份再卸载旧应用；卸载会删除本机应用数据。
