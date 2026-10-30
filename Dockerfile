# 生产镜像：SDK 里发布 → 只留运行时 + web 静态资源
# 构建：docker build -t agi2046 .
# 运行：docker run -d -p 5178:5178 -v agi-data:/data agi2046
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# 先单独 restore：只要 csproj 没变，改代码不会重下 NuGet
COPY src/AGI2046.Rules/AGI2046.Rules.csproj src/AGI2046.Rules/
COPY src/AGI2046.Server/AGI2046.Server.csproj src/AGI2046.Server/
RUN dotnet restore src/AGI2046.Server/AGI2046.Server.csproj

COPY src/ src/
# --no-restore：上面已经还原过；Release + 不裁剪（System.Text.Json 走反射，裁了会炸）
RUN dotnet publish src/AGI2046.Server/AGI2046.Server.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# curl 只用于容器健康检查和线上排查，apt 把列表也删掉，别把镜像撑大
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /out/ ./
# 前端是零构建的静态目录，服务端按 ContentRoot/web 找它（见 Program.cs 的 webRoot 兜底）
COPY web/ ./web/

# 存档/房间/profile 全在 /data，必须挂卷，否则重建容器就没了
ENV AGI2046_PORT=5178 \
    AGI2046_DATA=/data \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_RUNNING_IN_CONTAINER=true
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 5178

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${AGI2046_PORT}/api/health" || exit 1

ENTRYPOINT ["dotnet", "AGI2046.Server.dll"]
