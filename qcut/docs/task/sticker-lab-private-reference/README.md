# Sticker Lab — 私有剪映参照目录

贴纸实验室有两个目录:

| 目录 | manifest | 存储前缀 | 可见性 |
|---|---|---|---|
| QCut 原创(公开) | 随包分发 `sticker-lab/qcut-original-*.json` | `catalogs/qcut-original-*/assets/` | 预览:所有登录用户;原图:白名单 |
| 剪映参照(私有) | 仅服务端 `jianying/<date>/manifest.json` | `jianying/<date>/assets/` | manifest / 预览 / 原图全部仅白名单 |

私有目录是 2026-07-31 从剪映专业版贴纸面板采集的 42 分类 / 168 个预览
GIF(PR #371 开发期的 harvested catalog,commit `ef470377` 将其从公开目录
中移除)。素材属于字节跳动及其合作 IP,**只作为内部对标参照使用**:

- manifest 不进 Git、不进安装包 —— 只存在于私有 Supabase bucket,经
  license server 的 `/api/sticker-lab/private-manifest` 下发;
- 三层(manifest、缩略图、原图)全部要求
  `STICKER_LAB_ALLOWED_USER_IDS` 白名单,fail-closed;
- 客户端在缓存条目上标注 `commercialUse: "restricted"`
  (见 `PRIVATE_REFERENCE_PROVENANCE`),这些素材不得出现在任何
  发行物、宣传物或公开导出中;
- 普通用户(含全部发行版用户)对该目录完全不可见:请求 manifest 得到
  403,面板不渲染切换入口。

恢复/重采集 manifest 的方法:
`git show 28d2521d6:qcut/apps/web/public/sticker-lab/jianying-2026-07-31.json`,
上传到 bucket 的 `jianying/<date>/manifest.json`,并同步
`packages/license-server/src/routes/sticker-lab.ts` 里的
`PRIVATE_REFERENCE_MANIFEST_OBJECT_KEY`。
