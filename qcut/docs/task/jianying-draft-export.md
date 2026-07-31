# QCut → 剪映草稿导出

## 当前结论

第一阶段只做单向导出，并把产物明确标记为
`synthetic-plaintext-5.9`。它是根据公开实现建立的剪映 5.9 明文兼容基线，
不是由当前剪映生成的样本，也没有通过本机剪映 11 验证。

本机剪映 `11.0.0-beta5` 的草稿主体是不可读的高熵载荷。QCut 不读取、覆盖或
解密现有草稿，也不把明文 JSON 直接写入当前草稿库。

## 本地参考仓库

参考仓库只存在于被 Git 忽略的 `.reference-repos/`：

| 仓库 | 固定研究提交 | 用途 | 许可证 |
| --- | --- | --- | --- |
| [pyJianYingDraft](https://github.com/GuanYixuan/pyJianYingDraft) | `c3318066d964744e2bfc66f75c71745fe8cea52a` | 5.9 完整骨架、素材和片段语义 | Apache-2.0 |
| [capcut-cli](https://github.com/renezander030/capcut-cli) | `42ae5047e6f61ff1081c5ce76ecfd6afca7974be` | TypeScript 类型、版本护栏、原子写入 | MIT |
| [VectCutAPI](https://github.com/sun-guannan/VectCutAPI) | `c12b8e3effc5f610748e315363e000313b4ed7e3` | 10.2 工程目录和时间线镜像布局 | Apache-2.0 |

这些仓库不是 QCut 的运行时依赖。QCut 不分发剪映官方贴纸、字体、效果资源、
模板预览或缓存内容。

## 已实现的第一切片

`@qcut/editor-core/jianying-draft` 现在提供纯函数转换层：

- 输入是版本化的 `TProject + TimelineTrack[] + MediaItem[]` 强类型快照。
- 输出是单场景明文草稿、素材复制清单和逐项兼容性报告。
- 复制清单只保存宿主机无关的相对路径；写入器以后用本机路径 API 组装 staging
  目的地，草稿 JSON 中的平台路径单独生成。
- 视频、图片、音频支持基础时间范围、固定速度、音量和静态变换。
- 时间统一转换为整数微秒。
- QCut UI 轨道顺序会转换为剪映的底层到顶层顺序。
- 素材与片段使用稳定且相互独立的 ID。
- 缺素材、越界时间、反向播放、冻结帧、变速曲线和未支持元素会阻止写入。
- 颜色、蒙版、动画等暂未映射的设置会产生显式警告，不会静默消失。
- 5.9 明文参考实现与本机剪映 11 的明文 subdraft 都使用
  `draft_content.json`。根目录加密的 `draft_info.json` 属于另一层存储，不能把两者混用。

这一层不访问文件系统，不注册剪映工程，也不修改 `root_meta_info.json`。

## 下一阶段

1. Renderer 用实际项目状态构造快照，并通过 QCut 的播放时长函数填充每个元素
   的时间线时长。
2. Electron writer 校验源素材、复制到独立 staging 目录、写入
   `draft_info.json`，完成后原子重命名。默认只导出独立文件夹。
3. 为纯转换层建立 QCut 自有的 deterministic golden fixture。
4. 在用户新建的 disposable 剪映工程上验证导入/迁移路径；测试前完全退出剪映，
   只新增唯一目录，绝不覆盖已有工程。
5. 验证通过后再增加文字、字幕、静态贴纸；QCut 自有贴纸优先作为图片、GIF 或
   视频叠加层输出。
6. 无法原生映射的文字动画、特效和蒙版提供“明确警告”或“烘焙为透明视频”两条
   路径。

## 发布门槛

只有真实的 Windows/macOS 剪映打开、重开、编辑和导出回归通过后，才能把某个
版本标为已验证。剪映 6+ 的加密格式必须单独评估；首版不实现解密或回写加密草稿。
